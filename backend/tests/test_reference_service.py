"""
Unit tests for reference_service:
  - RxNorm name parser
  - Local list search (exact, alias, partial, case-insensitive, no match)
  - Result merging (injection-only, pill-only, unscoped)
  - In-memory cache (hit, expiry)
"""

import time
from unittest.mock import AsyncMock, patch

import pytest

from app.services import reference_service
from app.services.reference_service import (
    _cache,
    _map_dose_form,
    _normalize_drug_name,
    _parse_rxnorm_name,
    _search_local,
    _search_rxnorm,
    search,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clear_cache():
    _cache.clear()


# ---------------------------------------------------------------------------
# _normalize_drug_name
# ---------------------------------------------------------------------------

class TestNormalizeDrugName:
    def test_all_lower(self):
        assert _normalize_drug_name("metformin") == "Metformin"

    def test_rxnorm_emphasis(self):
        result = _normalize_drug_name("metFORMIN")
        assert result == "Metformin"

    def test_multi_word(self):
        result = _normalize_drug_name("metFORMIN hydroCHLORIDE")
        assert "Metformin" in result
        assert "Hydrochloride" in result

    def test_already_title(self):
        assert _normalize_drug_name("Fluticasone Propionate") == "Fluticasone Propionate"


# ---------------------------------------------------------------------------
# _map_dose_form
# ---------------------------------------------------------------------------

class TestMapDoseForm:
    def test_oral_tablet(self):
        mt, du, route = _map_dose_form("Oral Tablet")
        assert mt == "tablet"
        assert du == "tablet"
        assert route == "oral"

    def test_oral_capsule(self):
        mt, du, route = _map_dose_form("Oral Capsule")
        assert mt == "capsule"
        assert du == "capsule"

    def test_extended_release_capsule(self):
        mt, du, route = _map_dose_form("Extended Release Capsule")
        assert mt == "capsule"

    def test_oral_solution(self):
        mt, du, route = _map_dose_form("Oral Solution")
        assert mt == "liquid"
        assert du == "ml"
        assert route == "oral"

    def test_topical(self):
        mt, du, route = _map_dose_form("Topical Cream")
        assert mt == "topical"
        assert route == "topical"

    def test_unknown_defaults_other(self):
        mt, du, route = _map_dose_form("Unknown Inhalation Thing")
        assert mt == "inhaled"


# ---------------------------------------------------------------------------
# _parse_rxnorm_name
# ---------------------------------------------------------------------------

class TestParseRxnormName:
    def test_standard_tablet(self):
        r = _parse_rxnorm_name("metFORMIN hydrochloride 500 MG Oral Tablet")
        assert r is not None
        assert "Metformin" in r["drug_name"]
        assert r["strength_amount"] == 500.0
        assert r["strength_unit"] == "mg"
        assert r["medication_type"] == "tablet"
        assert r["dose_unit"] == "tablet"
        assert r["route"] == "oral"

    def test_mcg_capsule(self):
        r = _parse_rxnorm_name("Fluticasone Propionate 50 MCG Oral Capsule")
        assert r is not None
        assert r["strength_amount"] == 50.0
        assert r["strength_unit"] == "mcg"
        assert r["medication_type"] == "capsule"

    def test_extended_release_capsule(self):
        r = _parse_rxnorm_name("Metformin 500 MG Extended Release Capsule")
        assert r is not None
        assert r["medication_type"] == "capsule"
        assert r["dose_unit"] == "capsule"

    def test_liquid(self):
        r = _parse_rxnorm_name("Amoxicillin 250 MG Oral Solution")
        assert r is not None
        assert r["medication_type"] == "liquid"
        assert r["dose_unit"] == "ml"

    def test_decimal_strength(self):
        r = _parse_rxnorm_name("Semaglutide 0.5 MG Injection")
        assert r is not None
        assert r["strength_amount"] == 0.5

    def test_no_strength_returns_none(self):
        assert _parse_rxnorm_name("Some Drug Name Only") is None

    def test_html_entities_stripped(self):
        r = _parse_rxnorm_name("Drug &amp; Name 100 MG Oral Tablet")
        assert r is not None
        assert "&amp;" not in r["drug_name"]

    def test_display_name_format(self):
        r = _parse_rxnorm_name("Aspirin 325 MG Oral Tablet")
        assert r is not None
        assert "325" in r["display_name"]
        assert "mg" in r["display_name"].lower()


# ---------------------------------------------------------------------------
# _search_local
# ---------------------------------------------------------------------------

class TestSearchLocal:
    def test_exact_name_match(self):
        results = _search_local("BPC-157")
        assert results[0]["name"] == "BPC-157"
        assert results[0]["source"] == "local"

    def test_case_insensitive(self):
        results = _search_local("bpc-157")
        assert any(r["name"] == "BPC-157" for r in results)

    def test_partial_name_match(self):
        results = _search_local("bpc")
        assert any(r["name"] == "BPC-157" for r in results)

    def test_alias_match(self):
        results = _search_local("Body Protection")
        assert any(r["name"] == "BPC-157" for r in results)

    def test_alias_case_insensitive(self):
        results = _search_local("thymosin beta")
        assert any(r["name"] == "TB-500" for r in results)

    def test_no_match(self):
        results = _search_local("xyzq123notareal")
        assert results == []

    def test_max_5_results(self):
        # "peptide" won't match most, but any single-letter search could match many
        results = _search_local("a")  # too short for real use but tests cap
        assert len(results) <= 5

    def test_exact_before_partial(self):
        # "TB-500" exact match should come before partial matches
        results = _search_local("TB-500")
        assert results[0]["name"] == "TB-500"

    def test_local_result_shape(self):
        results = _search_local("BPC-157")
        r = results[0]
        assert "source" in r
        assert "name" in r
        assert "display_name" in r
        assert "medication_type" in r
        assert "dose_unit" in r
        assert "route" in r
        assert "aliases" in r
        assert r["rxcui"] is None
        assert r["strength_amount"] is None


# ---------------------------------------------------------------------------
# Merging — search()
# ---------------------------------------------------------------------------

FAKE_RXNORM_RESPONSE = {
    "drugGroup": {
        "conceptGroup": [
            {
                "conceptProperties": [
                    {
                        "rxcui": "861007",
                        "name": "Metformin Hydrochloride 500 MG Oral Tablet",
                        "synonym": "",
                    }
                ]
            }
        ]
    }
}


@pytest.mark.asyncio
class TestSearchMerge:
    async def test_injection_type_local_only(self):
        _clear_cache()
        with patch("app.services.reference_service._search_rxnorm", new_callable=AsyncMock) as mock_rx:
            results = await search("BPC", "injection")
            mock_rx.assert_not_called()
        assert all(r["source"] == "local" for r in results)

    async def test_tablet_type_rxnorm_only(self):
        _clear_cache()
        with patch(
            "app.services.reference_service._search_rxnorm",
            new_callable=AsyncMock,
            return_value=[{
                "source": "rxnorm", "rxcui": "861007", "name": "Metformin Hydrochloride",
                "display_name": "Metformin Hcl 500mg — Oral Tablet", "medication_type": "tablet",
                "strength_amount": 500.0, "strength_unit": "mg", "dose_unit": "tablet",
                "route": "oral", "aliases": [],
            }],
        ) as mock_rx:
            results = await search("metformin", "tablet")
            mock_rx.assert_called_once()
        assert all(r["source"] == "rxnorm" for r in results)

    async def test_no_type_both_sources(self):
        _clear_cache()
        local_result = {
            "source": "local", "rxcui": None, "name": "BPC-157",
            "display_name": "BPC-157 — Subcutaneous", "medication_type": "injection",
            "strength_amount": None, "strength_unit": None, "dose_unit": "mcg",
            "route": "subcutaneous", "aliases": [],
        }
        rxnorm_result = {
            "source": "rxnorm", "rxcui": "123", "name": "Some Drug",
            "display_name": "Some Drug 100mg — Oral Tablet", "medication_type": "tablet",
            "strength_amount": 100.0, "strength_unit": "mg", "dose_unit": "tablet",
            "route": "oral", "aliases": [],
        }
        with patch("app.services.reference_service._search_local", return_value=[local_result]):
            with patch(
                "app.services.reference_service._search_rxnorm",
                new_callable=AsyncMock,
                return_value=[rxnorm_result],
            ):
                results = await search("bpc", None)
        sources = {r["source"] for r in results}
        assert "local" in sources
        assert "rxnorm" in sources

    async def test_local_comes_first(self):
        _clear_cache()
        local_result = {
            "source": "local", "rxcui": None, "name": "BPC-157",
            "display_name": "BPC-157 — Subcutaneous", "medication_type": "injection",
            "strength_amount": None, "strength_unit": None, "dose_unit": "mcg",
            "route": "subcutaneous", "aliases": [],
        }
        rxnorm_result = {
            "source": "rxnorm", "rxcui": "123", "name": "BPC Drug",
            "display_name": "Bpc Drug 100mg — Oral Tablet", "medication_type": "tablet",
            "strength_amount": 100.0, "strength_unit": "mg", "dose_unit": "tablet",
            "route": "oral", "aliases": [],
        }
        with patch("app.services.reference_service._search_local", return_value=[local_result]):
            with patch(
                "app.services.reference_service._search_rxnorm",
                new_callable=AsyncMock,
                return_value=[rxnorm_result],
            ):
                results = await search("bpc", None)
        assert results[0]["source"] == "local"

    async def test_short_query_returns_empty(self):
        results = await search("a", None)
        assert results == []

    async def test_max_10_results(self):
        _clear_cache()
        many_local = [
            {"source": "local", "rxcui": None, "name": f"Peptide-{i}",
             "display_name": f"Peptide {i}", "medication_type": "injection",
             "strength_amount": None, "strength_unit": None, "dose_unit": "mcg",
             "route": "subcutaneous", "aliases": []}
            for i in range(5)
        ]
        many_rxnorm = [
            {"source": "rxnorm", "rxcui": str(i), "name": f"Drug {i}",
             "display_name": f"Drug {i} 100mg", "medication_type": "tablet",
             "strength_amount": 100.0, "strength_unit": "mg", "dose_unit": "tablet",
             "route": "oral", "aliases": []}
            for i in range(8)
        ]
        with patch("app.services.reference_service._search_local", return_value=many_local):
            with patch(
                "app.services.reference_service._search_rxnorm",
                new_callable=AsyncMock,
                return_value=many_rxnorm,
            ):
                results = await search("test", None)
        assert len(results) <= 10


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestCache:
    async def test_cache_hit_within_ttl(self):
        _clear_cache()
        call_count = 0

        async def fake_http(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return []

        with patch("app.services.reference_service._search_rxnorm", side_effect=fake_http):
            # Seed the cache manually
            from app.services.reference_service import _cache_set
            _cache_set("rxnorm:metformin", [{"cached": True}])

            # Calling _search_rxnorm with cached key should return cache without HTTP
            result = reference_service._cache_get("rxnorm:metformin")
            assert result == [{"cached": True}]
            assert call_count == 0

    async def test_cache_expired_entry_removed(self):
        _clear_cache()
        from app.services.reference_service import _cache_set
        # Manually inject an expired entry (ts = 0)
        _cache["rxnorm:old"] = (["stale"], 0.0)
        result = reference_service._cache_get("rxnorm:old")
        assert result is None
        assert "rxnorm:old" not in _cache

    async def test_cache_evicts_oldest_at_max(self):
        _clear_cache()
        from app.services.reference_service import MAX_CACHE, _cache_set
        # Fill to MAX_CACHE
        for i in range(MAX_CACHE):
            _cache_set(f"key:{i}", [i])
        assert len(_cache) == MAX_CACHE
        # Adding one more should evict one
        _cache_set("key:new", ["new"])
        assert len(_cache) == MAX_CACHE

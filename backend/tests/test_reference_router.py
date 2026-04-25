"""
Integration test for GET /api/reference/search and /api/reference/local.
RxNorm HTTP calls are mocked.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.reference_service import _cache


def _clear_cache():
    _cache.clear()


FAKE_RXNORM_RESULT = [
    {
        "source": "rxnorm",
        "rxcui": "861007",
        "name": "Metformin Hydrochloride",
        "display_name": "Metformin Hydrochloride 500mg — Oral Tablet",
        "medication_type": "tablet",
        "strength_amount": 500.0,
        "strength_unit": "mg",
        "dose_unit": "tablet",
        "route": "oral",
        "aliases": [],
    }
]


class TestReferenceSearchEndpoint:
    def test_search_tablet_returns_rxnorm_shape(self, admin_client):
        _clear_cache()
        with patch(
            "app.services.reference_service._search_rxnorm",
            new_callable=AsyncMock,
            return_value=FAKE_RXNORM_RESULT,
        ):
            resp = admin_client.get("/api/reference/search?q=metformin&type=tablet")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0

        r = data[0]
        for key in ("source", "rxcui", "name", "display_name", "medication_type",
                    "strength_amount", "strength_unit", "dose_unit", "route", "aliases"):
            assert key in r, f"Missing key: {key}"

        assert r["source"] == "rxnorm"
        assert r["medication_type"] == "tablet"
        assert isinstance(r["aliases"], list)

    def test_search_injection_returns_local_results(self, admin_client):
        _clear_cache()
        resp = admin_client.get("/api/reference/search?q=BPC&type=injection")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0
        assert all(r["source"] == "local" for r in data)
        assert any(r["name"] == "BPC-157" for r in data)

    def test_search_short_query_returns_empty(self, admin_client):
        resp = admin_client.get("/api/reference/search?q=a")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_search_no_query_returns_empty(self, admin_client):
        resp = admin_client.get("/api/reference/search?q=")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_search_works_with_auth(self, admin_client):
        resp = admin_client.get("/api/reference/search?q=bpc&type=injection")
        assert resp.status_code == 200

    def test_rxnorm_failure_returns_partial_results(self, admin_client):
        _clear_cache()
        with patch(
            "app.services.reference_service._search_rxnorm",
            new_callable=AsyncMock,
            return_value=[],  # simulates unreachable RxNorm
        ):
            resp = admin_client.get("/api/reference/search?q=bpc")
        assert resp.status_code == 200
        data = resp.json()
        assert any(r["source"] == "local" for r in data)


class TestReferenceLocalEndpoint:
    def test_admin_can_get_local_list(self, admin_client):
        resp = admin_client.get("/api/reference/local")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert all(r["medication_type"] == "injection" for r in data)
        assert all(r["source"] == "local" for r in data)

    def test_member_cannot_get_local_list(self, member_client):
        resp = member_client.get("/api/reference/local")
        assert resp.status_code == 403

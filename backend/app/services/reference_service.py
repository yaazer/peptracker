"""
Medication reference service.

Sources:
  - Local: curated peptide_reference.json (injection/research compounds)
  - RxNorm: NLM free API (pill/capsule/liquid medications)

RxNorm responses are cached in-memory with a 1-hour TTL.
"""

import json
import logging
import re
import time
from html import unescape
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Local reference data — loaded once at import time
# ---------------------------------------------------------------------------

_DATA_PATH = Path(__file__).parent.parent / "data" / "peptide_reference.json"

try:
    _LOCAL_LIST: list[dict] = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
except Exception as exc:
    raise RuntimeError(f"Failed to load peptide_reference.json: {exc}") from exc

# ---------------------------------------------------------------------------
# In-memory RxNorm cache
# ---------------------------------------------------------------------------

_cache: dict[str, tuple[list, float]] = {}
CACHE_TTL = 3600  # seconds
MAX_CACHE = 500

RXNORM_TIMEOUT = 5.0  # seconds
RXNORM_URL = "https://rxnav.nlm.nih.gov/REST/drugs.json"

# ---------------------------------------------------------------------------
# RxNorm dose form mappings
# ---------------------------------------------------------------------------

_FORM_TO_MED_TYPE: list[tuple[str, str]] = [
    ("oral tablet", "tablet"),
    ("tablet", "tablet"),
    ("oral capsule", "capsule"),
    ("extended release capsule", "capsule"),
    ("delayed release capsule", "capsule"),
    ("capsule", "capsule"),
    ("oral solution", "liquid"),
    ("oral liquid", "liquid"),
    ("oral suspension", "liquid"),
    ("oral syrup", "liquid"),
    ("topical", "topical"),
    ("sublingual", "sublingual"),
    ("inhalation", "inhaled"),
]

_FORM_TO_DOSE_UNIT: dict[str, str] = {
    "tablet": "tablet",
    "capsule": "capsule",
    "liquid": "ml",
    "topical": "other",
    "sublingual": "other",
    "inhaled": "other",
    "other": "other",
}

_FORM_TO_ROUTE: dict[str, str] = {
    "tablet": "oral",
    "capsule": "oral",
    "liquid": "oral",
    "topical": "topical",
    "sublingual": "sublingual",
    "inhaled": "inhaled",
    "other": "oral",
}

# Matches: "{drug name} {number} {unit} {dose form}"
_RX_PATTERN = re.compile(
    r"^(?P<drug>.+?)\s+(?P<amount>\d+(?:\.\d+)?)\s+(?P<unit>MCG|MG|G|ML)\s+(?P<form>.+)$",
    re.IGNORECASE,
)

# Matches camelCase emphasis like "metFORMIN" — any lowercase char followed by uppercase sequence
_EMPHASIS_RE = re.compile(r"([a-z])([A-Z]+)")


def _normalize_drug_name(raw: str) -> str:
    """Convert RxNorm emphasis casing (metFORMIN) to Title Case."""
    # Insert space before uppercase run that follows lowercase, then title-case
    spaced = _EMPHASIS_RE.sub(lambda m: m.group(1) + m.group(2).lower(), raw)
    return spaced.title()


def _map_dose_form(form_str: str) -> tuple[str, str, str]:
    """Return (medication_type, dose_unit, route) from a RxNorm dose form string."""
    form_lower = form_str.lower().strip()
    med_type = "other"
    for pattern, mtype in _FORM_TO_MED_TYPE:
        if pattern in form_lower:
            med_type = mtype
            break
    dose_unit = _FORM_TO_DOSE_UNIT.get(med_type, "other")
    route = _FORM_TO_ROUTE.get(med_type, "oral")
    return med_type, dose_unit, route


def _parse_rxnorm_name(raw: str) -> dict | None:
    """
    Parse a RxNorm drug name string into structured fields.
    Returns None if the string doesn't match the expected pattern.

    Example input: "metFORMIN hydrochloride 500 MG Oral Tablet"
    """
    raw = unescape(raw).strip()
    m = _RX_PATTERN.match(raw)
    if not m:
        return None

    drug_raw = m.group("drug").strip()
    amount = float(m.group("amount"))
    unit = m.group("unit").lower()
    form = m.group("form").strip()

    med_type, dose_unit, route = _map_dose_form(form)
    drug_name = _normalize_drug_name(drug_raw)
    display_name = f"{drug_name} {amount:g}{unit} — {form.title()}"

    return {
        "drug_name": drug_name,
        "strength_amount": amount,
        "strength_unit": unit,
        "dose_form": form,
        "medication_type": med_type,
        "dose_unit": dose_unit,
        "route": route,
        "display_name": display_name,
    }


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _cache_get(key: str) -> list | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    results, ts = entry
    if time.time() - ts < CACHE_TTL:
        return results
    del _cache[key]
    return None


def _cache_set(key: str, results: list) -> None:
    if len(_cache) >= MAX_CACHE:
        oldest = min(_cache, key=lambda k: _cache[k][1])
        del _cache[oldest]
    _cache[key] = (results, time.time())


# ---------------------------------------------------------------------------
# RxNorm search
# ---------------------------------------------------------------------------

async def _search_rxnorm(q: str) -> list[dict]:
    cache_key = f"rxnorm:{q.lower().strip()}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=RXNORM_TIMEOUT) as client:
            resp = await client.get(RXNORM_URL, params={"name": q})
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("RxNorm request failed for %r: %s", q, exc)
        return []

    results: list[dict] = []
    concept_groups = (
        data.get("drugGroup", {}).get("conceptGroup") or []
    )
    for group in concept_groups:
        for prop in group.get("conceptProperties") or []:
            rxcui = prop.get("rxcui", "")
            name_raw = prop.get("name", "")
            synonym = prop.get("synonym", "")

            parsed = _parse_rxnorm_name(name_raw)
            if parsed is None:
                logger.debug("Could not parse RxNorm name: %r", name_raw)
                continue

            aliases = []
            if synonym and synonym != name_raw:
                syn_parsed = _parse_rxnorm_name(synonym)
                if syn_parsed:
                    aliases.append(syn_parsed["drug_name"])

            results.append({
                "source": "rxnorm",
                "rxcui": rxcui,
                "name": parsed["drug_name"],
                "display_name": parsed["display_name"],
                "medication_type": parsed["medication_type"],
                "strength_amount": parsed["strength_amount"],
                "strength_unit": parsed["strength_unit"],
                "dose_unit": parsed["dose_unit"],
                "route": parsed["route"],
                "aliases": aliases,
            })

            if len(results) >= 8:
                break
        if len(results) >= 8:
            break

    _cache_set(cache_key, results)
    return results


# ---------------------------------------------------------------------------
# Local search
# ---------------------------------------------------------------------------

def _search_local(q: str) -> list[dict]:
    q_lower = q.lower().strip()
    exact: list[dict] = []
    partial_name: list[dict] = []
    alias_match: list[dict] = []

    for entry in _LOCAL_LIST:
        name = entry["name"]
        aliases = entry.get("aliases", [])
        name_lower = name.lower()

        if name_lower == q_lower:
            exact.append(entry)
        elif q_lower in name_lower:
            partial_name.append(entry)
        elif any(q_lower in a.lower() for a in aliases):
            alias_match.append(entry)

    ordered = exact + partial_name + alias_match

    results: list[dict] = []
    for entry in ordered[:5]:
        name = entry["name"]
        route = entry.get("route", "subcutaneous")
        dose_unit = entry.get("dose_unit", "mcg")
        display = f"{name} — {route.replace('_', ' ').title()}"
        results.append({
            "source": "local",
            "rxcui": None,
            "name": name,
            "display_name": display,
            "medication_type": entry.get("medication_type", "injection"),
            "strength_amount": None,
            "strength_unit": None,
            "dose_unit": dose_unit,
            "route": route,
            "aliases": entry.get("aliases", []),
        })

    return results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_PILL_TYPES = frozenset({"tablet", "capsule", "liquid", "topical", "sublingual", "inhaled", "other",
                         "supplement_pill", "supplement_powder"})
_INJECTION_TYPES = frozenset({"injection"})


async def search(q: str, med_type: str | None) -> list[dict]:
    """
    Merge local and RxNorm results.
    Local list is searched for injection type; RxNorm for pill types.
    If med_type is None, both sources are queried.
    Returns [] for queries shorter than 2 characters.
    """
    if len(q) < 2:
        return []

    _SUPPLEMENT_TYPES = frozenset({"supplement_pill", "supplement_powder"})
    use_local = med_type is None or med_type in _INJECTION_TYPES or med_type in _SUPPLEMENT_TYPES
    use_rxnorm = med_type is None or med_type in _PILL_TYPES

    local: list[dict] = _search_local(q) if use_local else []
    rxnorm: list[dict] = await _search_rxnorm(q) if use_rxnorm else []

    return (local + rxnorm)[:10]


def get_all_local() -> list[dict]:
    """Return the full local peptide list (for admin inspection)."""
    return [
        {
            "source": "local",
            "rxcui": None,
            "name": e["name"],
            "display_name": f"{e['name']} — {e.get('route', 'subcutaneous').replace('_', ' ').title()}",
            "medication_type": e.get("medication_type", "injection"),
            "strength_amount": None,
            "strength_unit": None,
            "dose_unit": e.get("dose_unit", "mcg"),
            "route": e.get("route", "subcutaneous"),
            "aliases": e.get("aliases", []),
        }
        for e in _LOCAL_LIST
    ]

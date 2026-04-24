"""Integration tests for non-injection (pill/liquid) dose logging and skip endpoint."""
from datetime import datetime

import pytest


def _create_compound(client, **kwargs):
    defaults = {
        "name": "Test Compound",
        "medication_type": "tablet",
        "dose_unit": "tablet",
        "strength_amount": 500.0,
        "strength_unit": "mcg",
        "route": "oral",
    }
    defaults.update(kwargs)
    resp = client.post("/api/compounds", json=defaults)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_injection_compound(client, **kwargs):
    defaults = {
        "name": "BPC-157",
        "medication_type": "injection",
        "concentration_mg_per_ml": 1.0,
    }
    defaults.update(kwargs)
    resp = client.post("/api/compounds", json=defaults)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Pill creation
# ---------------------------------------------------------------------------

class TestPillInjectionCreate:
    def test_creates_tablet_dose_with_quantity(self, admin_client):
        compound = _create_compound(admin_client)
        payload = {
            "compound_id": compound["id"],
            "quantity": 2.0,
            "injected_at": "2026-04-21T08:00:00",
        }
        resp = admin_client.post("/api/injections", json=payload)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["quantity"] == 2.0
        assert data["injection_site"] is None
        assert data["component_snapshot"] is None
        assert data["status"] == "taken"

    def test_dose_mcg_computed_from_strength_mcg(self, admin_client):
        # strength_amount=500 mcg, quantity=2 → dose_mcg=1000
        compound = _create_compound(admin_client, strength_amount=500.0, strength_unit="mcg")
        resp = admin_client.post(
            "/api/injections",
            json={"compound_id": compound["id"], "quantity": 2.0, "injected_at": "2026-04-21T08:00:00"},
        )
        assert resp.json()["dose_mcg"] == 1000

    def test_dose_mcg_computed_from_strength_mg(self, admin_client):
        # strength_amount=0.5 mg = 500 mcg, quantity=1 → dose_mcg=500
        compound = _create_compound(admin_client, strength_amount=0.5, strength_unit="mg")
        resp = admin_client.post(
            "/api/injections",
            json={"compound_id": compound["id"], "quantity": 1.0, "injected_at": "2026-04-21T08:00:00"},
        )
        assert resp.json()["dose_mcg"] == 500

    def test_dose_mcg_null_for_unknown_unit(self, admin_client):
        # strength_unit="tablet" → dose_mcg should be None
        compound = _create_compound(
            admin_client,
            medication_type="other",
            dose_unit="other",
            strength_amount=1.0,
            strength_unit="other",
        )
        resp = admin_client.post(
            "/api/injections",
            json={"compound_id": compound["id"], "quantity": 1.0, "injected_at": "2026-04-21T08:00:00"},
        )
        assert resp.status_code == 201
        assert resp.json()["dose_mcg"] is None

    def test_missing_quantity_returns_422(self, admin_client):
        compound = _create_compound(admin_client)
        resp = admin_client.post(
            "/api/injections",
            json={"compound_id": compound["id"], "injected_at": "2026-04-21T08:00:00"},
        )
        assert resp.status_code == 422

    def test_injection_type_still_requires_dose_mcg(self, admin_client):
        compound = _create_injection_compound(admin_client)
        resp = admin_client.post(
            "/api/injections",
            json={
                "compound_id": compound["id"],
                "injected_at": "2026-04-21T08:00:00",
                # no dose_mcg, no injection_site
            },
        )
        assert resp.status_code == 422

    def test_injection_type_requires_injection_site(self, admin_client):
        compound = _create_injection_compound(admin_client)
        resp = admin_client.post(
            "/api/injections",
            json={
                "compound_id": compound["id"],
                "dose_mcg": 500,
                "injected_at": "2026-04-21T08:00:00",
                # no injection_site
            },
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Skip endpoint
# ---------------------------------------------------------------------------

class TestSkipEndpoint:
    def test_skip_creates_skipped_record(self, admin_client):
        compound = _create_injection_compound(admin_client)
        # Create a real injection first to get a valid injection_id
        inj_resp = admin_client.post(
            "/api/injections",
            json={
                "compound_id": compound["id"],
                "dose_mcg": 500,
                "injection_site": "left_abdomen",
                "injected_at": "2026-04-21T08:00:00",
            },
        )
        assert inj_resp.status_code == 201
        inj_id = inj_resp.json()["id"]

        skip_resp = admin_client.post(
            f"/api/injections/{inj_id}/skip",
            json={"skip_reason": "felt sick"},
        )
        assert skip_resp.status_code == 201, skip_resp.text
        data = skip_resp.json()
        assert data["status"] == "skipped"
        assert data["skip_reason"] == "felt sick"
        assert data["compound_id"] == compound["id"]
        assert data["dose_mcg"] is None

    def test_skip_without_reason_is_valid(self, admin_client):
        compound = _create_injection_compound(admin_client)
        inj_resp = admin_client.post(
            "/api/injections",
            json={
                "compound_id": compound["id"],
                "dose_mcg": 250,
                "injection_site": "right_thigh",
                "injected_at": "2026-04-21T08:00:00",
            },
        )
        inj_id = inj_resp.json()["id"]

        skip_resp = admin_client.post(f"/api/injections/{inj_id}/skip", json={})
        assert skip_resp.status_code == 201
        assert skip_resp.json()["skip_reason"] is None

    def test_skip_nonexistent_injection_returns_404(self, admin_client):
        resp = admin_client.post("/api/injections/99999/skip", json={})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Liquid (mg/ml strength unit)
# ---------------------------------------------------------------------------

class TestLiquidDose:
    def test_liquid_dose_mcg_computed_from_mg_per_ml(self, admin_client):
        # 5 mg/ml × 2 ml = 10 mg = 10,000 mcg
        compound = _create_compound(
            admin_client,
            name="Liquid Med",
            medication_type="liquid",
            dose_unit="ml",
            strength_amount=5.0,
            strength_unit="mg/ml",
        )
        resp = admin_client.post(
            "/api/injections",
            json={"compound_id": compound["id"], "quantity": 2.0, "injected_at": "2026-04-21T08:00:00"},
        )
        assert resp.status_code == 201
        assert resp.json()["dose_mcg"] == 10000

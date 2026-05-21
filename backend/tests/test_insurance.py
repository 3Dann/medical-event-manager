"""
פרק 4 — ביטוחים
כיסוי:
  4.1 מקורות ביטוח — CRUD
  4.2 כיסויים — הוספה ומחיקה
  4.3 auto-populate — סל הבריאות
  4.4 הרשאות — גישה לא מורשית
"""
import pytest
from tests.helpers import (
    make_admin, make_patient, make_insurance_source,
    full_login, TEST_ADMIN_PASSWORD,
)


# ═══════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════

@pytest.fixture
def admin(db):
    return make_admin(db)


@pytest.fixture
def admin_token(client, admin):
    return full_login(client, admin.email, TEST_ADMIN_PASSWORD)


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def patient(db, admin):
    return make_patient(db, manager_id=admin.id)


@pytest.fixture
def source(db, patient):
    return make_insurance_source(db, patient_id=patient.id)


def _create_source(client, patient_id, headers, source_type="private", **extra):
    payload = {
        "source_type": source_type,
        "company_name": "מגדל",
        "policy_number": "POL-001",
        **extra,
    }
    r = client.post(f"/api/patients/{patient_id}/insurance", json=payload, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ═══════════════════════════════════════════════════════
# 4.1 — מקורות ביטוח
# ═══════════════════════════════════════════════════════

class TestInsuranceSources:

    def test_list_sources_empty(self, client, admin_headers, patient):
        r = client.get(f"/api/patients/{patient.id}/insurance", headers=admin_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_create_private_source(self, client, admin_headers, patient):
        src = _create_source(client, patient.id, admin_headers)
        assert src["source_type"] == "private"
        assert src["company_name"] == "מגדל"

    def test_created_source_appears_in_list(self, client, admin_headers, patient):
        _create_source(client, patient.id, admin_headers)
        r = client.get(f"/api/patients/{patient.id}/insurance", headers=admin_headers)
        assert len(r.json()) == 1

    def test_delete_source(self, client, admin_headers, patient, source):
        r = client.delete(
            f"/api/patients/{patient.id}/insurance/{source.id}",
            headers=admin_headers,
        )
        assert r.status_code in (200, 204)
        r2 = client.get(f"/api/patients/{patient.id}/insurance", headers=admin_headers)
        assert r2.json() == []

    def test_delete_nonexistent_source_returns_404(self, client, admin_headers, patient):
        r = client.delete(
            f"/api/patients/{patient.id}/insurance/999999",
            headers=admin_headers,
        )
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════
# 4.2 — כיסויים
# ═══════════════════════════════════════════════════════

class TestInsuranceCoverage:

    def test_add_coverage_to_source(self, client, admin_headers, patient, source):
        payload = {
            "category": "hospitalization",
            "is_covered": True,
            "coverage_percentage": 80,
        }
        r = client.post(
            f"/api/patients/{patient.id}/insurance/{source.id}/coverage",
            json=payload,
            headers=admin_headers,
        )
        assert r.status_code in (200, 201)

    def test_delete_coverage(self, client, admin_headers, patient, source):
        payload = {"category": "surgery", "is_covered": True}
        r = client.post(
            f"/api/patients/{patient.id}/insurance/{source.id}/coverage",
            json=payload,
            headers=admin_headers,
        )
        cov_id = r.json()["id"]
        r2 = client.delete(
            f"/api/patients/{patient.id}/insurance/{source.id}/coverage/{cov_id}",
            headers=admin_headers,
        )
        assert r2.status_code in (200, 204)


# ═══════════════════════════════════════════════════════
# 4.3 — auto-populate סל הבריאות
# ═══════════════════════════════════════════════════════

class TestSalHabriutAutoPopulate:

    def test_sal_habriut_creates_coverages_automatically(self, client, admin_headers, patient):
        src = _create_source(client, patient.id, admin_headers, source_type="sal_habriut")
        assert len(src["coverages"]) > 0, "סל הבריאות צריך ליצור כיסויים אוטומטית"

    def test_kupat_holim_mushlam_creates_coverages(self, client, admin_headers, patient):
        src = _create_source(
            client, patient.id, admin_headers,
            source_type="kupat_holim",
            hmo_name="מכבי",
            hmo_level="mushlam",
        )
        assert len(src["coverages"]) > 0


# ═══════════════════════════════════════════════════════
# 4.4 — הרשאות
# ═══════════════════════════════════════════════════════

class TestInsurancePermissions:

    def test_unauthenticated_returns_401(self, client, patient):
        r = client.get(f"/api/patients/{patient.id}/insurance")
        assert r.status_code == 401

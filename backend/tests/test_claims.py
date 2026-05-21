"""
פרק 3 — תביעות ביטוח
כיסוי:
  3.1 CRUD — יצירה, רשימה, עדכון, מחיקה
  3.2 זרימת אישור — draft → pending
  3.3 ולידציות — סטטוס לא חוקי
  3.4 הרשאות — אין הרשאה → 403
"""
import pytest
from tests.helpers import (
    make_admin, make_manager, make_patient, make_insurance_source,
    full_login, TEST_ADMIN_PASSWORD, TEST_MANAGER_PASSWORD,
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


@pytest.fixture
def claim_payload(source):
    return {
        "insurance_source_id": source.id,
        "category": "hospitalization",
        "status": "draft",
        "amount_requested": 5000,
    }


def _create_claim(client, patient_id, payload, headers):
    r = client.post(f"/api/patients/{patient_id}/claims", json=payload, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ═══════════════════════════════════════════════════════
# 3.1 — CRUD
# ═══════════════════════════════════════════════════════

class TestClaimCRUD:

    def test_create_claim(self, client, admin_headers, patient, claim_payload):
        r = client.post(f"/api/patients/{patient.id}/claims", json=claim_payload, headers=admin_headers)
        assert r.status_code in (200, 201)
        assert r.json()["category"] == "hospitalization"

    def test_list_claims_empty(self, client, admin_headers, patient):
        r = client.get(f"/api/patients/{patient.id}/claims", headers=admin_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_list_claims_returns_created(self, client, admin_headers, patient, claim_payload):
        _create_claim(client, patient.id, claim_payload, admin_headers)
        r = client.get(f"/api/patients/{patient.id}/claims", headers=admin_headers)
        assert len(r.json()) == 1

    def test_update_claim_amount(self, client, admin_headers, patient, claim_payload):
        claim = _create_claim(client, patient.id, claim_payload, admin_headers)
        r = client.put(
            f"/api/patients/{patient.id}/claims/{claim['id']}",
            json={"amount_approved": 4500},
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert r.json()["amount_approved"] == 4500

    def test_delete_claim(self, client, admin_headers, patient, claim_payload):
        claim = _create_claim(client, patient.id, claim_payload, admin_headers)
        r = client.delete(
            f"/api/patients/{patient.id}/claims/{claim['id']}",
            headers=admin_headers,
        )
        assert r.status_code in (200, 204)
        r2 = client.get(f"/api/patients/{patient.id}/claims", headers=admin_headers)
        assert len(r2.json()) == 0

    def test_update_nonexistent_claim_returns_404(self, client, admin_headers, patient):
        r = client.put(
            f"/api/patients/{patient.id}/claims/999999",
            json={"notes": "test"},
            headers=admin_headers,
        )
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════
# 3.2 — זרימת אישור
# ═══════════════════════════════════════════════════════

class TestClaimApproveFlow:

    def test_approve_draft_claim(self, client, admin_headers, patient, claim_payload):
        claim = _create_claim(client, patient.id, claim_payload, admin_headers)
        assert claim["status"] == "draft"
        r = client.post(
            f"/api/patients/{patient.id}/claims/{claim['id']}/approve",
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_approve_non_draft_claim_returns_400(self, client, admin_headers, patient, claim_payload):
        payload = {**claim_payload, "status": "submitted"}
        claim = _create_claim(client, patient.id, payload, admin_headers)
        r = client.post(
            f"/api/patients/{patient.id}/claims/{claim['id']}/approve",
            headers=admin_headers,
        )
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════
# 3.3 — ולידציות
# ═══════════════════════════════════════════════════════

class TestClaimValidation:

    def test_invalid_status_rejected(self, client, admin_headers, patient, claim_payload):
        payload = {**claim_payload, "status": "invalid_status"}
        r = client.post(f"/api/patients/{patient.id}/claims", json=payload, headers=admin_headers)
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════
# 3.4 — הרשאות
# ═══════════════════════════════════════════════════════

class TestClaimPermissions:

    def test_unauthenticated_list_returns_401(self, client, patient):
        r = client.get(f"/api/patients/{patient.id}/claims")
        assert r.status_code == 401

    def test_manager_without_permission_cannot_create_claim(self, client, admin, patient, claim_payload, db):
        """מנהל ללא manage_claims → 403."""
        other = make_manager(db, email="noperms@test.com")
        token = full_login(client, other.email, TEST_MANAGER_PASSWORD)
        headers = {"Authorization": f"Bearer {token}"}
        r = client.post(f"/api/patients/{patient.id}/claims", json=claim_payload, headers=headers)
        assert r.status_code in (403, 404)

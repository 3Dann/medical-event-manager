"""
פרק 2 — ניהול מטופלים
כיסוי:
  2.1 יצירה, קריאה, עדכון, מחיקה (CRUD)
  2.2 ולידציות — שדות חסרים, כפילות ת\"ז
  2.3 הרשאות — אין הרשאה → 403, מטופל לא שייך → 404
"""
import pytest
from tests.helpers import (
    make_admin, make_manager, make_patient, full_login,
    TEST_ADMIN_PASSWORD, TEST_MANAGER_PASSWORD, PATIENT_PAYLOAD,
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
def other_manager(db, admin):
    return make_manager(db, email="other@test.com")


@pytest.fixture
def other_token(client, other_manager):
    return full_login(client, other_manager.email, TEST_MANAGER_PASSWORD)


@pytest.fixture
def other_headers(other_token):
    return {"Authorization": f"Bearer {other_token}"}


@pytest.fixture
def patient(db, admin):
    return make_patient(db, manager_id=admin.id)


# ═══════════════════════════════════════════════════════
# 2.1 — CRUD בסיסי
# ═══════════════════════════════════════════════════════

class TestPatientCRUD:

    def test_create_patient_returns_201_or_200(self, client, admin_headers):
        r = client.post("/api/patients", json=PATIENT_PAYLOAD, headers=admin_headers)
        assert r.status_code in (200, 201)
        assert r.json()["full_name"] == PATIENT_PAYLOAD["full_name"]

    def test_create_patient_appears_in_list(self, client, admin_headers):
        client.post("/api/patients", json=PATIENT_PAYLOAD, headers=admin_headers)
        r = client.get("/api/patients", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        patients = data["items"] if isinstance(data, dict) else data
        names = [p["full_name"] for p in patients]
        assert PATIENT_PAYLOAD["full_name"] in names

    def test_get_patient_by_id(self, client, admin_headers, patient):
        r = client.get(f"/api/patients/{patient.id}", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["id"] == patient.id

    def test_update_patient_full_name(self, client, admin_headers, patient):
        r = client.patch(
            f"/api/patients/{patient.id}",
            json={"full_name": "שם חדש"},
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert r.json()["full_name"] == "שם חדש"

    def test_delete_patient(self, client, admin_headers, patient):
        r = client.delete(f"/api/patients/{patient.id}", headers=admin_headers)
        assert r.status_code in (200, 204)
        r2 = client.get(f"/api/patients/{patient.id}", headers=admin_headers)
        assert r2.status_code == 404

    def test_get_nonexistent_patient_returns_404(self, client, admin_headers):
        r = client.get("/api/patients/999999", headers=admin_headers)
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════
# 2.2 — ולידציות
# ═══════════════════════════════════════════════════════

class TestPatientValidation:

    def test_create_without_name_rejected(self, client, admin_headers):
        r = client.post("/api/patients", json={}, headers=admin_headers)
        assert r.status_code == 422

    def test_duplicate_id_number_rejected(self, client, admin_headers):
        payload = {**PATIENT_PAYLOAD, "id_number": "123456789"}
        client.post("/api/patients", json=payload, headers=admin_headers)
        r2 = client.post("/api/patients", json={**payload, "full_name": "אחר"}, headers=admin_headers)
        assert r2.status_code == 400

    def test_invalid_birth_date_rejected(self, client, admin_headers):
        r = client.post(
            "/api/patients",
            json={**PATIENT_PAYLOAD, "birth_date": "not-a-date"},
            headers=admin_headers,
        )
        assert r.status_code in (400, 422)


# ═══════════════════════════════════════════════════════
# 2.3 — הרשאות
# ═══════════════════════════════════════════════════════

class TestPatientPermissions:

    def test_unauthenticated_request_returns_401(self, client):
        r = client.get("/api/patients")
        assert r.status_code == 401

    def test_manager_without_permission_cannot_create(self, client, admin, other_headers, db):
        """מנהל ללא הרשאת create_patient → 403."""
        r = client.post("/api/patients", json=PATIENT_PAYLOAD, headers=other_headers)
        assert r.status_code == 403

    def test_manager_cannot_access_other_managers_patient(self, client, other_headers, patient):
        """מטופל ששייך למנהל אחר → 403 או 404."""
        r = client.get(f"/api/patients/{patient.id}", headers=other_headers)
        assert r.status_code in (403, 404)

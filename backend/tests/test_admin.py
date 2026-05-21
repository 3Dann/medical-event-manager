"""
פרק 6 — ניהול מערכת (admin)
כיסוי:
  6.1 רשימת משתמשים
  6.2 שינוי תפקיד
  6.3 אפס חשבון (reset)
  6.4 הרשאות — מנהל רגיל מנסה → 403
  6.5 מחיקת נתוני משתמש
"""
import pytest
from tests.helpers import (
    make_admin, make_manager, full_login,
    TEST_ADMIN_PASSWORD, TEST_MANAGER_PASSWORD,
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
def manager(db, admin):
    return make_manager(db)


@pytest.fixture
def manager_token(client, manager):
    return full_login(client, manager.email, TEST_MANAGER_PASSWORD)


@pytest.fixture
def manager_headers(manager_token):
    return {"Authorization": f"Bearer {manager_token}"}


# ═══════════════════════════════════════════════════════
# 6.1 — רשימת משתמשים
# ═══════════════════════════════════════════════════════

class TestListUsers:

    def test_admin_can_list_users(self, client, admin_headers, admin):
        r = client.get("/api/admin/users", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_response_contains_email_and_role(self, client, admin_headers, admin):
        r = client.get("/api/admin/users", headers=admin_headers)
        user = r.json()[0]
        assert "email" in user
        assert "role" in user

    def test_non_admin_cannot_list_users(self, client, manager_headers, manager):
        r = client.get("/api/admin/users", headers=manager_headers)
        assert r.status_code in (403, 401)

    def test_unauthenticated_cannot_list_users(self, client):
        r = client.get("/api/admin/users")
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════
# 6.2 — שינוי תפקיד
# ═══════════════════════════════════════════════════════

class TestUpdateRole:

    def test_admin_can_change_user_role(self, client, admin_headers, manager):
        r = client.put(
            f"/api/admin/users/{manager.id}/role",
            json={"role": "broker"},
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert r.json()["role"] == "broker"

    def test_invalid_role_rejected(self, client, admin_headers, manager):
        r = client.put(
            f"/api/admin/users/{manager.id}/role",
            json={"role": "superuser"},
            headers=admin_headers,
        )
        assert r.status_code == 400

    def test_admin_cannot_change_own_role(self, client, admin_headers, admin):
        r = client.put(
            f"/api/admin/users/{admin.id}/role",
            json={"role": "broker"},
            headers=admin_headers,
        )
        assert r.status_code == 400

    def test_change_role_nonexistent_user_returns_404(self, client, admin_headers):
        r = client.put(
            "/api/admin/users/999999/role",
            json={"role": "manager"},
            headers=admin_headers,
        )
        assert r.status_code == 404

    def test_non_admin_cannot_change_role(self, client, manager_headers, manager):
        r = client.put(
            f"/api/admin/users/{manager.id}/role",
            json={"role": "broker"},
            headers=manager_headers,
        )
        assert r.status_code in (401, 403)


# ═══════════════════════════════════════════════════════
# 6.3 — אפס חשבון
# ═══════════════════════════════════════════════════════

class TestResetUser:

    def test_admin_can_reset_user(self, client, admin_headers, manager):
        r = client.post(
            f"/api/admin/users/{manager.id}/reset",
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert "message" in r.json()

    def test_reset_response_does_not_contain_password(self, client, admin_headers, manager):
        """סיסמה זמנית אסור שתוחזר ב-response — נשלחת למייל בלבד."""
        r = client.post(
            f"/api/admin/users/{manager.id}/reset",
            headers=admin_headers,
        )
        body = str(r.json())
        assert "temp_password" not in body
        assert "password" not in body.lower().replace("message", "")

    def test_admin_cannot_reset_own_account(self, client, admin_headers, admin):
        r = client.post(
            f"/api/admin/users/{admin.id}/reset",
            headers=admin_headers,
        )
        assert r.status_code == 400

    def test_non_admin_cannot_reset_user(self, client, manager_headers, manager):
        r = client.post(
            f"/api/admin/users/{manager.id}/reset",
            headers=manager_headers,
        )
        assert r.status_code in (401, 403)


# ═══════════════════════════════════════════════════════
# 6.4 — דשבורד מנהל
# ═══════════════════════════════════════════════════════

class TestAdminDashboard:

    def test_admin_dashboard_returns_stats(self, client, admin_headers):
        r = client.get("/api/admin/dashboard", headers=admin_headers)
        assert r.status_code == 200

    def test_non_admin_cannot_access_dashboard(self, client, manager_headers):
        r = client.get("/api/admin/dashboard", headers=manager_headers)
        assert r.status_code in (401, 403)


# ═══════════════════════════════════════════════════════
# 6.5 — מחיקת נתוני משתמש
# ═══════════════════════════════════════════════════════

class TestDeleteUserData:

    def test_admin_cannot_delete_own_data(self, client, admin_headers, admin):
        r = client.post(
            f"/api/admin/users/{admin.id}/delete-data",
            headers=admin_headers,
        )
        assert r.status_code == 400

    def test_delete_data_user_with_preserve_flag_returns_403(self, client, admin_headers, manager, db):
        manager.preserve_data = True
        db.commit()
        r = client.post(
            f"/api/admin/users/{manager.id}/delete-data",
            headers=admin_headers,
        )
        assert r.status_code == 403

    def test_delete_data_nonexistent_user_returns_404(self, client, admin_headers):
        r = client.post(
            "/api/admin/users/999999/delete-data",
            headers=admin_headers,
        )
        assert r.status_code == 404

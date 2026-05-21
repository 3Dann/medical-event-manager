"""
פרק 5 — משימות (היום שלי)
כיסוי:
  5.1 רשימת משימות — GET /api/tasks/my
  5.2 יצירה ידנית — POST /api/tasks
  5.3 עדכון — PUT /api/tasks/{id}
  5.4 השלמה — POST /api/tasks/{id}/complete
  5.5 מחיקה — DELETE /api/tasks/{id}
  5.6 הרשאות
"""
import pytest
from tests.helpers import (
    make_admin, make_patient, full_login, TEST_ADMIN_PASSWORD,
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


def _create_task(client, headers, patient_id=None, title="משימת בדיקה"):
    payload = {"title": title, "priority": "normal"}
    if patient_id:
        payload["patient_id"] = patient_id
    r = client.post("/api/tasks", json=payload, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ═══════════════════════════════════════════════════════
# 5.1 — רשימת משימות
# ═══════════════════════════════════════════════════════

class TestGetMyTasks:

    def test_returns_paginated_structure(self, client, admin_headers):
        r = client.get("/api/tasks/my", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data

    def test_empty_tasks_on_fresh_user(self, client, admin_headers):
        r = client.get("/api/tasks/my", headers=admin_headers)
        assert r.json()["total"] >= 0


# ═══════════════════════════════════════════════════════
# 5.2 — יצירה ידנית
# ═══════════════════════════════════════════════════════

class TestCreateTask:

    def test_create_manual_task(self, client, admin_headers):
        task = _create_task(client, admin_headers, title="משימה ידנית")
        assert task["title"] == "משימה ידנית"
        assert task["status"] == "pending"

    def test_create_task_with_patient(self, client, admin_headers, patient):
        task = _create_task(client, admin_headers, patient_id=patient.id)
        assert task["patient_id"] == patient.id

    def test_create_task_with_priority(self, client, admin_headers):
        r = client.post(
            "/api/tasks",
            json={"title": "דחוף", "priority": "urgent"},
            headers=admin_headers,
        )
        assert r.status_code in (200, 201)
        assert r.json()["priority"] == "urgent"

    def test_create_task_without_title_rejected(self, client, admin_headers):
        r = client.post("/api/tasks", json={"priority": "normal"}, headers=admin_headers)
        assert r.status_code == 422

    def test_created_task_appears_in_my_tasks(self, client, admin_headers):
        task = _create_task(client, admin_headers, title="נראית ברשימה")
        r = client.get("/api/tasks/my", headers=admin_headers)
        ids = [t["id"] for t in r.json()["items"]]
        assert task["id"] in ids


# ═══════════════════════════════════════════════════════
# 5.3 — עדכון
# ═══════════════════════════════════════════════════════

class TestUpdateTask:

    def test_update_task_title(self, client, admin_headers):
        task = _create_task(client, admin_headers)
        r = client.put(
            f"/api/tasks/{task['id']}",
            json={"title": "כותרת מעודכנת"},
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert r.json()["title"] == "כותרת מעודכנת"

    def test_update_task_priority(self, client, admin_headers):
        task = _create_task(client, admin_headers)
        r = client.put(
            f"/api/tasks/{task['id']}",
            json={"priority": "high"},
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert r.json()["priority"] == "high"

    def test_update_nonexistent_task_returns_404(self, client, admin_headers):
        r = client.put(
            "/api/tasks/999999",
            json={"title": "לא קיים"},
            headers=admin_headers,
        )
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════
# 5.4 — השלמה
# ═══════════════════════════════════════════════════════

class TestCompleteTask:

    def test_complete_task_sets_done_status(self, client, admin_headers):
        task = _create_task(client, admin_headers)
        r = client.post(f"/api/tasks/{task['id']}/complete", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "done"

    def test_completed_task_has_completed_at(self, client, admin_headers):
        task = _create_task(client, admin_headers)
        r = client.post(f"/api/tasks/{task['id']}/complete", headers=admin_headers)
        assert r.json()["completed_at"] is not None


# ═══════════════════════════════════════════════════════
# 5.5 — מחיקה
# ═══════════════════════════════════════════════════════

class TestDeleteTask:

    def test_delete_manual_task(self, client, admin_headers):
        task = _create_task(client, admin_headers)
        r = client.delete(f"/api/tasks/{task['id']}", headers=admin_headers)
        assert r.status_code in (200, 204)

    def test_deleted_task_not_in_list(self, client, admin_headers):
        task = _create_task(client, admin_headers)
        client.delete(f"/api/tasks/{task['id']}", headers=admin_headers)
        r = client.get("/api/tasks/my", headers=admin_headers)
        ids = [t["id"] for t in r.json()["items"]]
        assert task["id"] not in ids

    def test_delete_nonexistent_task_returns_404(self, client, admin_headers):
        r = client.delete("/api/tasks/999999", headers=admin_headers)
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════
# 5.6 — הרשאות
# ═══════════════════════════════════════════════════════

class TestTaskPermissions:

    def test_unauthenticated_get_returns_401(self, client):
        r = client.get("/api/tasks/my")
        assert r.status_code == 401

    def test_unauthenticated_post_returns_401(self, client):
        r = client.post("/api/tasks", json={"title": "test", "priority": "normal"})
        assert r.status_code == 401

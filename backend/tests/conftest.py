"""
הגדרות בסיס לטסטים — DB בזיכרון, TestClient, fixtures משותפים.
"""
import os

# חייב להיות לפני כל ייבוא של קוד האפליקציה
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-not-production!")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from database import Base, get_db
from main import app
import models
import auth as auth_utils


# ─── DB בזיכרון — חדש לכל טסט ───────────────────────────────────────────────

def _make_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def db():
    """Session נקייה לכל טסט — נסגרת בסוף."""
    engine = _make_engine()
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def client(db, monkeypatch):
    """TestClient עם DB בזיכרון. Seeds מנוטרלים."""
    # מנטרל seed functions שמשתמשות ב-DB הגלובלי ולא בDB הטסט
    monkeypatch.setattr("main._seed_drugs_on_startup", lambda: None)
    monkeypatch.setattr("main._seed_nsclc_drugs_on_startup", lambda: None)

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


# ─── IP ייחודי לכל טסט — מונע דליפת rate-limit בין טסטים ──────────────────

@pytest.fixture(autouse=True)
def _unique_ip_per_test(monkeypatch, request):
    """כל טסט מקבל IP ייחודי — limiters לא מדברים בין טסטים."""
    import routes.auth as _auth_route
    test_hash = abs(hash(request.node.nodeid)) % (256 ** 3)
    ip = f"10.{(test_hash >> 16) % 256}.{(test_hash >> 8) % 256}.{test_hash % 256}"
    monkeypatch.setattr(_auth_route.limiter, "key_func", lambda req: ip)


# ─── עזרים ליצירת משתמשים ────────────────────────────────────────────────────

def make_admin(db, email="admin@test.com", password="Admin1!Admin"):
    """יוצר משתמש אדמין ישירות ב-DB."""
    user = models.User(
        full_name="Admin Test",
        email=email,
        hashed_password=auth_utils.get_password_hash(password),
        role="manager",
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_manager(db, email="manager@test.com", password="Manager1!"):
    """יוצר משתמש מנהל אירוע ישירות ב-DB."""
    user = models.User(
        full_name="Test Manager",
        email=email,
        hashed_password=auth_utils.get_password_hash(password),
        role="manager",
        is_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def full_login(client, email, password):
    """
    זרימת כניסה מלאה עם 2FA מייל.
    מחזיר את access_token.
    """
    # שלב 1: login → temp_token
    r = client.post("/api/auth/login", data={"username": email, "password": password})
    assert r.status_code == 200, f"login נכשל: {r.text}"
    d = r.json()
    assert d.get("requires_2fa") is True
    temp_token = d["temp_token"]

    # שלב 2: בקש קוד מייל → קוד מוחזר בresponse במצב dev (אין שרת מייל)
    r2 = client.post("/api/auth/2fa/request-email-code", json={"temp_token": temp_token})
    assert r2.status_code == 200, f"request-email-code נכשל: {r2.text}"
    code = r2.json().get("code")
    assert code, "קוד לא הוחזר — ייתכן שמייל מוגדר ומסתיר את הקוד"

    # שלב 3: אמת קוד → access_token מלא
    r3 = client.post("/api/auth/verify-2fa", json={
        "temp_token": temp_token,
        "code": code,
        "method": "email",
    })
    assert r3.status_code == 200, f"verify-2fa נכשל: {r3.text}"
    token = r3.json().get("access_token")
    assert token
    return token


# ─── Fixtures נוחים לטסטים ────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db):
    return make_admin(db)


@pytest.fixture
def manager_user(db):
    make_admin(db)          # אדמין חייב להיות ב-DB (is_first_user logic)
    return make_manager(db)


@pytest.fixture
def manager_token(client, manager_user):
    """Token מלא של מנהל אירוע מחובר."""
    return full_login(client, manager_user.email, "Manager1!")


@pytest.fixture
def manager_headers(manager_token):
    """Headers מוכנים לבקשות מאומתות."""
    return {"Authorization": f"Bearer {manager_token}"}

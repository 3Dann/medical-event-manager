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
from tests.helpers import make_admin, make_manager, full_login


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
    """כל טסט מקבל IP ייחודי."""
    import routes.auth as _auth_route
    test_hash = abs(hash(request.node.nodeid)) % (256 ** 3)
    ip = f"10.{(test_hash >> 16) % 256}.{(test_hash >> 8) % 256}.{test_hash % 256}"
    monkeypatch.setattr(_auth_route.limiter, "_key_func", lambda req: ip)


# ─── Fixtures נוחים לטסטים ────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db):
    return make_admin(db)


@pytest.fixture
def manager_user(db):
    make_admin(db)
    return make_manager(db)


@pytest.fixture
def manager_token(client, manager_user):
    return full_login(client, manager_user.email, "Manager1!")


@pytest.fixture
def manager_headers(manager_token):
    return {"Authorization": f"Bearer {manager_token}"}

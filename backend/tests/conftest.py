"""
הגדרות בסיס לטסטים — DB בזיכרון, TestClient, fixtures משותפים.
"""
import os
import importlib
import pkgutil

# חייב להיות לפני כל ייבוא של קוד האפליקציה
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-not-production!")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from database import Base, get_db
from main import app
from tests.helpers import make_admin, make_manager, full_login, TEST_MANAGER_PASSWORD


# ─── DB בזיכרון — חדש לכל טסט (StaticPool = חיבור יחיד → DB יחיד) ─────────

def _make_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def db():
    """Session נקייה לכל טסט — rollback + dispose בסוף."""
    engine = _make_engine()
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.rollback()
    session.close()
    engine.dispose()


# ─── איפוס rate limiters ──────────────────────────────────────────────────────

def _reset_all_limiters():
    """מאפס כל Limiter בכל מודולי routes + main.
    גישה גנרית — לא תלויה ברשימה ידנית שצריך לעדכן."""
    import routes
    import main as _main
    for _, mod_name, _ in pkgutil.iter_modules(routes.__path__):
        try:
            mod = importlib.import_module(f"routes.{mod_name}")
            lim = getattr(mod, "limiter", None)
            if lim and hasattr(lim, "reset"):
                lim.reset()
        except Exception:
            pass
    if hasattr(_main, "limiter"):
        _main.limiter.reset()


# ─── TestClient עם DB מבודד ───────────────────────────────────────────────────

@pytest.fixture
def client(db, monkeypatch):
    """TestClient עם DB בזיכרון. Seeds מנוטרלים. כל rate limiters מאופסים."""
    _reset_all_limiters()

    monkeypatch.setattr("main._seed_drugs_on_startup", lambda: None)
    monkeypatch.setattr("main._seed_nsclc_drugs_on_startup", lambda: None)

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


# ─── Fixtures למשתמשים ────────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db):
    return make_admin(db)


@pytest.fixture
def manager_user(admin_user, db):
    """Manager רגיל. admin_user כתלות מפורשת — app מצריך אדמין קיים להרשמה."""
    return make_manager(db)


@pytest.fixture
def manager_token(client, manager_user):
    return full_login(client, manager_user.email, TEST_MANAGER_PASSWORD)


@pytest.fixture
def manager_headers(manager_token):
    return {"Authorization": f"Bearer {manager_token}"}

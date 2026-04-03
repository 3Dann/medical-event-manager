from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from database import engine, SessionLocal
import models
from routes import auth, patients, insurance, claims, strategy, responsiveness, import_data, private_import, learning, public, doctors, admin
from data.seed_data import RESPONSIVENESS_DEFAULTS
import sqlalchemy
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────
    from apscheduler.schedulers.background import BackgroundScheduler
    from scraper import run_all_sources
    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(
        run_all_sources,
        trigger="interval",
        hours=24,
        args=[SessionLocal],
        id="auto_scrape",
        replace_existing=True,
    )
    scheduler.start()
    app.state.scheduler = scheduler
    logger.info("Background scraper scheduler started (every 24h)")
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


app = FastAPI(title="Medical Event Manager API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables
models.Base.metadata.create_all(bind=engine)

# SQLite column migrations — add missing columns without losing data
def run_migrations():
    migrations = [
        ("patients", "hmo_name",  "VARCHAR"),
        ("patients", "hmo_level", "VARCHAR"),
        ("doctors", "source_url", "VARCHAR"),
        ("users", "is_admin", "BOOLEAN DEFAULT 0"),
        ("users", "preserve_data", "BOOLEAN DEFAULT 0"),
        ("users", "reset_token", "VARCHAR"),
        ("users", "reset_token_expires", "DATETIME"),
    ]
    with engine.connect() as conn:
        for table, col, col_type in migrations:
            try:
                conn.execute(sqlalchemy.text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                pass  # column already exists

run_migrations()

# Seed default responsiveness scores
def seed_responsiveness():
    db = SessionLocal()
    try:
        count = db.query(models.ResponsivenessScore).count()
        if count == 0:
            for item in RESPONSIVENESS_DEFAULTS:
                score = models.ResponsivenessScore(**item, is_default=True)
                db.add(score)
            db.commit()
    finally:
        db.close()

seed_responsiveness()

# Seed predefined Israeli scraping sources
def seed_israeli_sources():
    from routes.doctors import PREDEFINED_ISRAELI_SOURCES
    db = SessionLocal()
    try:
        valid_urls = {s["url"] for s in PREDEFINED_ISRAELI_SOURCES}
        # Remove outdated sources that are no longer in the predefined list
        all_sources = db.query(models.ScrapingSource).all()
        for src in all_sources:
            if src.url not in valid_urls:
                logger.info(f"Removing stale source: {src.name}")
                db.delete(src)
        db.flush()
        # Add new sources
        for src in PREDEFINED_ISRAELI_SOURCES:
            exists = db.query(models.ScrapingSource).filter(models.ScrapingSource.url == src["url"]).first()
            if not exists:
                db.add(models.ScrapingSource(name=src["name"], url=src["url"], interval_hours=24))
                logger.info(f"Added Israeli source: {src['name']}")
        db.commit()
    finally:
        db.close()

seed_israeli_sources()

# One-time user reset (clears all users so first registration becomes admin)
def reset_users_once():
    flag = "/data/.users_reset_v1" if os.path.isdir("/data") else "./.users_reset_v1"
    if os.path.exists(flag):
        return
    db = SessionLocal()
    try:
        count = db.query(models.User).count()
        if count > 0:
            db.query(models.User).delete()
            db.commit()
            logger.info("One-time user reset complete — first registration will become Admin")
        open(flag, "w").close()
    finally:
        db.close()

reset_users_once()

# Register routes
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(insurance.router)
app.include_router(insurance.entitlement_router)
app.include_router(claims.router)
app.include_router(strategy.router)
app.include_router(responsiveness.router)
app.include_router(import_data.router)
app.include_router(private_import.router)
app.include_router(learning.router)
app.include_router(public.router)
app.include_router(doctors.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve React frontend (production build)
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "../frontend/dist")

if os.path.exists(FRONTEND_DIST):
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

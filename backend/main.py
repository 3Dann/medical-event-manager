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
        ("users", "totp_secret", "VARCHAR"),
        ("users", "totp_enabled", "BOOLEAN DEFAULT 0"),
        ("users", "totp_method", "VARCHAR DEFAULT 'totp'"),
        ("users", "email_2fa_code", "VARCHAR"),
        ("users", "email_2fa_expires", "DATETIME"),
        ("nodes", "stage_order", "INTEGER"),
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


JOURNEY_STAGES = [
    {"description": "גילוי ואבחון",   "stage_order": 10},
    {"description": "תכנון הטיפול",   "stage_order": 20},
    {"description": "שלב הטיפולים",   "stage_order": 30},
    {"description": "החלמה ושיקום",   "stage_order": 40},
    {"description": "מעקב",           "stage_order": 50},
]


def seed_journey_stages():
    """
    Idempotent: ensures all patients have exactly the 5 journey stages.
    Migrates old stage_orders (1-4) → (10-40) and splits stage 4 into 40+50.
    """
    db = SessionLocal()
    try:
        # ── Migrate old integer orders 1-4 → 10-40 ──────────────────────────
        old_map = {1: 10, 2: 20, 3: 30, 4: 40}
        for old, new in old_map.items():
            nodes = db.query(models.Node).filter(
                models.Node.node_type == "stage",
                models.Node.stage_order == old,
            ).all()
            for n in nodes:
                n.stage_order = new
                if old == 4:
                    n.description = "החלמה ושיקום"

        # ── Migrate custom nodes that had null stage_order → keep null ───────
        # (nothing to do — nulls sort to end, which is correct)

        db.flush()

        # ── Seed missing stages per patient ──────────────────────────────────
        patients = db.query(models.Patient).all()
        for patient in patients:
            existing = {
                n.stage_order for n in db.query(models.Node).filter(
                    models.Node.patient_id == patient.id,
                    models.Node.node_type == "stage",
                ).all()
            }
            for stage in JOURNEY_STAGES:
                if stage["stage_order"] not in existing:
                    db.add(models.Node(
                        patient_id=patient.id,
                        node_type="stage",
                        description=stage["description"],
                        stage_order=stage["stage_order"],
                        status="future",
                    ))
        db.commit()
        logger.info("Journey stages seeded/migrated for all patients")
    finally:
        db.close()


seed_journey_stages()


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


def reimport_doctors_v2():
    """
    One-time cleanup: delete truncated doctor records from CKAN + tteam sources
    and re-import them fresh so full names are restored.
    Also fixes misspelled specialty values.
    """
    flag = "/data/.doctors_reimport_v2" if os.path.isdir("/data") else "./.doctors_reimport_v2"
    if os.path.exists(flag):
        return
    try:
        import scraper as sc
        from doctor_normalize import normalize_record
        db = SessionLocal()

        # ── Fix misspelled specialties ───────────────────────────────────────
        fixes = {
            "גניקולוגיה": "גינקולוגיה",
            "פסיכלוגיה":  "פסיכולוגיה",
            "גינקולוגיה":  "גינקולוגיה",  # already correct but normalize just in case
        }
        for wrong, right in fixes.items():
            if wrong == right:
                continue
            rows = db.query(models.Doctor).filter(models.Doctor.specialty == wrong).all()
            for r in rows:
                r.specialty = right
            if rows:
                logger.info("Fixed spelling '%s' → '%s' for %d records", wrong, right, len(rows))

        # ── Fix 4 long merged-name records ───────────────────────────────────
        import re as _re
        for doc in db.query(models.Doctor).filter(
            models.Doctor.name.isnot(None)
        ).all():
            if len(doc.name) > 25:
                # Try to extract just the name (first ~2 Hebrew words)
                words = [w for w in doc.name.split() if _re.search(r'[\u05d0-\u05ea]', w)]
                if words:
                    doc.name = " ".join(words[:3])
                    logger.info("Truncated long merged name → '%s'", doc.name)

        db.commit()

        # ── Re-import CKAN sources ────────────────────────────────────────────
        ckan_source_urls = [
            ("https://data.gov.il/api/3/action/datastore_search?resource_id=ebe7b0fa-42c8-4195-8b40-b0b0e73cc494",
             "ebe7b0fa-42c8-4195-8b40-b0b0e73cc494"),
            ("https://data.gov.il/api/3/action/datastore_search?resource_id=37f14c29-47af-4b6c-b38e-e08a15e15b5b",
             "37f14c29-47af-4b6c-b38e-e08a15e15b5b"),
        ]
        for source_url, resource_id in ckan_source_urls:
            try:
                # Delete existing records from this source
                deleted = db.query(models.Doctor).filter(
                    models.Doctor.source_url.ilike(f"%{resource_id[:8]}%")
                ).delete(synchronize_session=False)
                db.commit()
                logger.info("Deleted %d records from CKAN source %s", deleted, resource_id[:8])

                # Re-import fresh
                records = sc.scrape_ckan(resource_id, source_url)
                added = 0
                existing = {sc._normalize_name(d.name) for d in db.query(models.Doctor.name).all()}
                for rec in records:
                    rec = normalize_record(rec)
                    if rec is None:
                        continue
                    n = sc._normalize_name(rec["name"])
                    if n in existing:
                        continue
                    db.add(models.Doctor(**rec))
                    existing.add(n)
                    added += 1
                db.commit()
                logger.info("Re-imported %d doctors from CKAN %s", added, resource_id[:8])
            except Exception as e:
                db.rollback()
                logger.warning("CKAN re-import failed for %s: %s", resource_id[:8], e)

        # ── Re-import tteam Google Sheets ─────────────────────────────────────
        tteam_url = "https://tteam.co.il/mcm-toolbox/"
        gs_url = "https://docs.google.com/spreadsheets/d/1fmgDA25Rklu8VbvN-pe0vN2EUahjhXTGuk1ODuKzl3E/view"
        try:
            deleted = db.query(models.Doctor).filter(
                models.Doctor.source_url == tteam_url
            ).delete(synchronize_session=False)
            db.commit()
            logger.info("Deleted %d tteam records", deleted)

            records = sc._scrape_google_sheets(gs_url)
            added = 0
            existing = {sc._normalize_name(d.name) for d in db.query(models.Doctor.name).all()}
            for rec in records:
                rec = normalize_record(rec)
                if rec is None:
                    continue
                n = sc._normalize_name(rec["name"])
                if n in existing:
                    continue
                db.add(models.Doctor(**rec))
                existing.add(n)
                added += 1
            db.commit()
            logger.info("Re-imported %d doctors from tteam", added)
        except Exception as e:
            db.rollback()
            logger.warning("tteam re-import failed: %s", e)

        db.close()
        open(flag, "w").close()
        logger.info("doctors_reimport_v2 complete")
    except Exception as e:
        logger.error("doctors_reimport_v2 error: %s", e)


reimport_doctors_v2()


def scrape_all_sources_once():
    """
    One-time immediate scrape of all active sources after deployment.
    Uses a version flag so it only runs once per deployment version.
    """
    flag = "/data/.scrape_all_v1" if os.path.isdir("/data") else "./.scrape_all_v1"
    if os.path.exists(flag):
        return
    try:
        from scraper import run_all_sources
        import threading
        def _run():
            logger.info("One-time startup scrape: running all sources…")
            run_all_sources(SessionLocal)
            logger.info("One-time startup scrape complete")
        threading.Thread(target=_run, daemon=True).start()
        open(flag, "w").close()
    except Exception as e:
        logger.error("scrape_all_sources_once error: %s", e)


scrape_all_sources_once()

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

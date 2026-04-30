from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from database import engine, SessionLocal
import models
from routes import auth, patients, insurance, claims, strategy, responsiveness, import_data, private_import, learning, public, doctors, admin, documents, workflows, webauthn as webauthn_routes, specialties, settings as settings_routes, medications as medications_routes, policy_ai as policy_ai_routes, audit as audit_routes
from audit_middleware import AuditMiddleware
from data.seed_data import RESPONSIVENESS_DEFAULTS
import sqlalchemy
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

def _seed_drugs_on_startup():
    from drug_updater import seed_drugs
    db = SessionLocal()
    try:
        seed_drugs(db)
    finally:
        db.close()


def _weekly_drug_update():
    from drug_updater import run_drug_update
    db = SessionLocal()
    try:
        run_drug_update(db)
    finally:
        db.close()


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
    scheduler.add_job(
        _weekly_drug_update,
        trigger="interval",
        weeks=1,
        id="weekly_drug_update",
        replace_existing=True,
    )
    scheduler.start()
    app.state.scheduler = scheduler
    logger.info("Background scraper scheduler started (every 24h)")
    _seed_drugs_on_startup()
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

from audit_middleware import AuditMiddleware
app.add_middleware(AuditMiddleware)

# Create tables
models.Base.metadata.create_all(bind=engine)

# SQLite column migrations — add missing columns without losing data
def run_migrations():
    migrations = [
        # Original columns
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
        # Workflow engine v2 — medical awareness
        ("patients", "condition_tags", "TEXT"),
        ("patients", "medical_stage",  "VARCHAR"),
        ("workflow_templates", "condition_tags", "TEXT"),
        ("workflow_templates", "trigger_event",  "VARCHAR"),
        ("workflow_templates", "specialty",      "VARCHAR"),
        ("workflow_step_templates", "coverage_categories", "TEXT"),
        ("workflow_step_templates", "step_type",           "VARCHAR DEFAULT 'administrative'"),
        ("workflow_step_templates", "estimated_cost",      "FLOAT"),
        ("workflow_step_templates", "required_documents",  "TEXT"),
        ("workflow_steps", "coverage_categories",  "TEXT"),
        ("workflow_steps", "step_type",            "VARCHAR"),
        ("workflow_steps", "estimated_cost",       "FLOAT"),
        ("workflow_steps", "required_documents",   "TEXT"),
        # Phase 1 — journey + draft claims
        ("workflow_templates", "is_journey",   "BOOLEAN DEFAULT 0"),
        ("claims", "workflow_step_id", "INTEGER REFERENCES workflow_steps(id)"),
        # Phase 2 — step tasks (checklist)
        ("workflow_step_templates", "task_templates_json", "TEXT"),  # unused col, tables created by metadata
        # Medical specialties — learning fields
        ("medical_specialties", "confidence_score", "FLOAT DEFAULT 1.0"),
        ("medical_specialties", "feedback_count",   "INTEGER DEFAULT 0"),
        ("medical_specialties", "is_verified",       "BOOLEAN DEFAULT 0"),
        ("medical_specialty_feedback", "correction", "TEXT"),
        # Intake form fields
        ("patients", "phone_prefix",           "VARCHAR"),
        ("patients", "phone",                  "VARCHAR"),
        ("patients", "gender",                 "VARCHAR"),
        ("patients", "birth_date",             "VARCHAR"),
        ("patients", "marital_status",         "VARCHAR"),
        ("patients", "num_children",           "INTEGER"),
        ("patients", "height_cm",              "FLOAT"),
        ("patients", "weight_kg",              "FLOAT"),
        ("patients", "city",                   "VARCHAR"),
        ("patients", "city_code",              "VARCHAR"),
        ("patients", "street",                 "VARCHAR"),
        ("patients", "house_number",           "VARCHAR"),
        ("patients", "entrance",               "VARCHAR"),
        ("patients", "floor",                  "VARCHAR"),
        ("patients", "apartment",              "VARCHAR"),
        ("patients", "postal_code",            "VARCHAR"),
        ("patients", "ec_name",                "VARCHAR"),
        ("patients", "ec_phone_prefix",        "VARCHAR"),
        ("patients", "ec_phone",               "VARCHAR"),
        ("patients", "ec_relation",            "VARCHAR"),
        ("patients", "medications",            "TEXT"),
        ("patients", "adl_answers",            "TEXT"),
        ("patients", "iadl_answers",           "TEXT"),
        ("patients", "mmse_answers",           "TEXT"),
        ("patients", "adl_score",              "INTEGER"),
        ("patients", "iadl_score",             "INTEGER"),
        ("patients", "mmse_score",             "INTEGER"),
        ("patients", "consent_agreed",         "BOOLEAN DEFAULT 0"),
        ("patients", "consent_signed_at",      "DATETIME"),
        ("patients", "consent_signature_path", "VARCHAR"),
        ("patients", "poa_agreed",             "BOOLEAN DEFAULT 0"),
        ("patients", "poa_signed_at",          "DATETIME"),
        ("patients", "poa_signature_path",     "VARCHAR"),
        ("patients", "intake_completed",       "BOOLEAN DEFAULT 0"),
        ("patients", "intake_completed_at",    "DATETIME"),
        # Patient portal
        ("patients", "patient_user_id",        "INTEGER REFERENCES users(id)"),
        # Medical specialty (auto-suggested)
        ("patients", "specialty",              "VARCHAR"),
        ("patients", "sub_specialty",          "VARCHAR"),
        # Referral fields (replaced height/weight in intake form)
        ("patients", "referral_goal",                    "VARCHAR"),
        ("patients", "referral_source",                  "VARCHAR"),
        # Extended signatures
        ("patients", "financial_consent_agreed",         "BOOLEAN DEFAULT 0"),
        ("patients", "financial_consent_signature_path", "VARCHAR"),
        ("patients", "financial_consent_signed_at",      "DATETIME"),
        ("patients", "signer_name",                      "VARCHAR"),
        ("patients", "signer_relation",                  "VARCHAR"),
        ("patients", "phone2_prefix",                    "VARCHAR"),
        ("patients", "phone2",                           "VARCHAR"),
        # Demo mode permission
        ("users", "demo_mode_allowed", "BOOLEAN DEFAULT 0"),
        # Feedback enhancements
        ("project_feedback", "feedback_type", "VARCHAR DEFAULT 'general'"),
        ("project_feedback", "is_read",       "BOOLEAN DEFAULT 0"),
        ("project_feedback", "is_handled",    "BOOLEAN DEFAULT 0"),
        # node sub-items — migration handled by create_all (new table)
        # openFDA enrichment columns
        ("drug_entries", "openfda_indication",    "TEXT"),
        ("drug_entries", "openfda_dosages",       "TEXT"),
        ("drug_entries", "openfda_interactions",  "TEXT"),
        ("drug_entries", "openfda_fetched_at",    "DATETIME"),
        ("patient_medications", "indication",     "VARCHAR"),
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
app.include_router(settings_routes.router)
app.include_router(documents.router)
app.include_router(workflows.router)
app.include_router(webauthn_routes.router)
app.include_router(specialties.router)
app.include_router(medications_routes.router)
app.include_router(policy_ai_routes.router)
app.include_router(audit_routes.router)


def _seed_step_task_templates(db, step_template, tasks):
    """Idempotent: create task templates for a step template if not already present."""
    existing_titles = {t.title for t in step_template.task_templates}
    for i, title in enumerate(tasks):
        if title not in existing_titles:
            db.add(models.WorkflowStepTaskTemplate(
                step_template_id=step_template.id,
                title=title,
                task_order=i,
            ))


def seed_workflow_templates():
    import json as _json
    from data.workflow_seed import BUILTIN_TEMPLATES
    db = SessionLocal()
    try:
        for tmpl_data in BUILTIN_TEMPLATES:
            exists = db.query(models.WorkflowTemplate).filter(
                models.WorkflowTemplate.name == tmpl_data["name"],
                models.WorkflowTemplate.is_builtin == True,
            ).first()

            if exists:
                # Update medical-awareness fields on existing templates
                exists.condition_tags = _json.dumps(tmpl_data.get("condition_tags", []))
                exists.trigger_event  = tmpl_data.get("trigger_event")
                exists.specialty      = tmpl_data.get("specialty")
                exists.is_journey     = tmpl_data.get("is_journey", False)
                # Update/add step templates
                for step_data in tmpl_data.get("steps", []):
                    st = db.query(models.WorkflowStepTemplate).filter(
                        models.WorkflowStepTemplate.template_id == exists.id,
                        models.WorkflowStepTemplate.step_key == step_data["step_key"],
                    ).first()
                    if st:
                        cats = step_data.get("coverage_categories")
                        st.coverage_categories = _json.dumps(cats) if cats else None
                        st.step_type      = step_data.get("step_type", "administrative")
                        st.estimated_cost = step_data.get("estimated_cost")
                        docs = step_data.get("required_documents")
                        st.required_documents = _json.dumps(docs) if docs else None
                        _seed_step_task_templates(db, st, step_data.get("tasks", []))
                    else:
                        # New step added to existing template
                        cats = step_data.get("coverage_categories")
                        docs = step_data.get("required_documents")
                        new_st = models.WorkflowStepTemplate(
                            template_id=exists.id,
                            step_key=step_data["step_key"],
                            name=step_data["name"],
                            step_order=step_data["step_order"],
                            duration_days=step_data.get("duration_days"),
                            is_optional=step_data.get("is_optional", False),
                            instructions=step_data.get("instructions"),
                            coverage_categories=_json.dumps(cats) if cats else None,
                            step_type=step_data.get("step_type", "administrative"),
                            estimated_cost=step_data.get("estimated_cost"),
                            required_documents=_json.dumps(docs) if docs else None,
                        )
                        db.add(new_st)
                        db.flush()
                        _seed_step_task_templates(db, new_st, step_data.get("tasks", []))
                continue

            tmpl = models.WorkflowTemplate(
                name=tmpl_data["name"],
                description=tmpl_data.get("description"),
                category=tmpl_data.get("category"),
                condition_tags=_json.dumps(tmpl_data.get("condition_tags", [])),
                trigger_event=tmpl_data.get("trigger_event"),
                specialty=tmpl_data.get("specialty"),
                is_journey=tmpl_data.get("is_journey", False),
                is_builtin=True,
                is_active=True,
            )
            db.add(tmpl)
            db.flush()
            for step in tmpl_data.get("steps", []):
                cats = step.get("coverage_categories")
                docs = step.get("required_documents")
                new_st = models.WorkflowStepTemplate(
                    template_id=tmpl.id,
                    step_key=step["step_key"],
                    name=step["name"],
                    step_order=step["step_order"],
                    duration_days=step.get("duration_days"),
                    is_optional=step.get("is_optional", False),
                    instructions=step.get("instructions"),
                    coverage_categories=_json.dumps(cats) if cats else None,
                    step_type=step.get("step_type", "administrative"),
                    estimated_cost=step.get("estimated_cost"),
                    required_documents=_json.dumps(docs) if docs else None,
                )
                db.add(new_st)
                db.flush()
                _seed_step_task_templates(db, new_st, step.get("tasks", []))
        db.commit()
        logger.info("Workflow templates seeded/updated")
    except Exception as e:
        db.rollback()
        logger.error(f"Workflow seed error: {e}")
    finally:
        db.close()

seed_workflow_templates()


def seed_condition_tags():
    from data.condition_tags_seed import BUILTIN_CONDITION_TAGS
    db = SessionLocal()
    try:
        for tag_data in BUILTIN_CONDITION_TAGS:
            exists = db.query(models.MedicalConditionTag).filter(
                models.MedicalConditionTag.key == tag_data["key"]
            ).first()
            if exists:
                # Update labels/category in case they changed
                exists.label_he    = tag_data["label_he"]
                exists.category    = tag_data["category"]
                exists.category_he = tag_data["category_he"]
                exists.is_builtin  = True
                continue
            db.add(models.MedicalConditionTag(
                key=tag_data["key"],
                label_he=tag_data["label_he"],
                category=tag_data["category"],
                category_he=tag_data["category_he"],
                is_builtin=True,
                is_active=True,
            ))
        db.commit()
        logger.info("Medical condition tags seeded")
    except Exception as e:
        db.rollback()
        logger.error(f"Condition tags seed error: {e}")
    finally:
        db.close()

seed_condition_tags()


def seed_medical_specialties():
    """
    Seed from builtin list only (fast, no network).
    External scraping runs once in background after startup.
    """
    flag = "/data/.specialties_seed_v1" if os.path.isdir("/data") else "./.specialties_seed_v1"
    if os.path.exists(flag):
        return
    try:
        from specialty_scraper import seed_from_builtin, upsert_specialties
        db = SessionLocal()
        try:
            count = db.query(models.MedicalSpecialty).count()
            if count == 0:
                result = seed_from_builtin(db)
                logger.info("Medical specialties seeded from builtin: %s", result)
            open(flag, "w").close()
        finally:
            db.close()
        # Kick off external scraping in background (non-blocking)
        import threading
        def _bg_scrape():
            bg_db = SessionLocal()
            try:
                upsert_specialties(bg_db)
                logger.info("Background specialty scrape complete")
            except Exception as exc:
                logger.warning("Background specialty scrape error: %s", exc)
            finally:
                bg_db.close()
        threading.Thread(target=_bg_scrape, daemon=True).start()
    except Exception as e:
        logger.error("seed_medical_specialties error: %s", e)


seed_medical_specialties()


def seed_journey_workflows():
    """
    Idempotent: ensure every patient has an active journey workflow instance.
    Runs once after templates are seeded. Skips patients that already have one.
    """
    db = SessionLocal()
    try:
        tmpl = db.query(models.WorkflowTemplate).filter(
            models.WorkflowTemplate.is_journey == True,
            models.WorkflowTemplate.is_active == True,
        ).first()
        if not tmpl:
            logger.warning("Journey template not found — skipping journey workflow seed")
            return

        patients = db.query(models.Patient).all()
        created = 0
        for patient in patients:
            existing = db.query(models.WorkflowInstance).filter(
                models.WorkflowInstance.patient_id == patient.id,
                models.WorkflowInstance.template_id == tmpl.id,
            ).first()
            if existing:
                continue
            # Use the first admin/manager user as creator fallback
            creator_id = patient.manager_id
            from flow_engine import FlowEngine
            try:
                FlowEngine.create_instance(
                    db=db,
                    template_id=tmpl.id,
                    patient_id=patient.id,
                    created_by=creator_id,
                    title="מסע המטופל",
                )
                created += 1
            except Exception as e:
                db.rollback()
                logger.warning(f"Failed to create journey workflow for patient {patient.id}: {e}")
        logger.info(f"Journey workflows seeded: {created} created")
    except Exception as e:
        db.rollback()
        logger.error(f"Journey workflow seed error: {e}")
    finally:
        db.close()


seed_journey_workflows()


def patch_journey_intake_step():
    """
    Idempotent: add the 'intake' step (pre-completed) to existing journey instances
    that were created before the intake step was added to the template.
    """
    db = SessionLocal()
    try:
        from datetime import datetime, timezone
        tmpl = db.query(models.WorkflowTemplate).filter(
            models.WorkflowTemplate.is_journey == True,
            models.WorkflowTemplate.is_active == True,
        ).first()
        if not tmpl:
            return

        intake_st = db.query(models.WorkflowStepTemplate).filter(
            models.WorkflowStepTemplate.template_id == tmpl.id,
            models.WorkflowStepTemplate.step_key == "intake",
        ).first()
        if not intake_st:
            return

        instances = db.query(models.WorkflowInstance).filter(
            models.WorkflowInstance.template_id == tmpl.id,
        ).all()

        now = datetime.now(timezone.utc)
        patched = 0
        for inst in instances:
            has_intake = any(s.step_key == "intake" for s in inst.steps)
            if has_intake:
                continue
            # Add intake step as pre-completed (patient was already onboarded)
            step = models.WorkflowStep(
                instance_id=inst.id,
                step_key="intake",
                name="קליטת מטופל",
                step_order=5,
                status="completed",
                started_at=inst.started_at,
                completed_at=now,
                instructions=intake_st.instructions,
                step_type=intake_st.step_type,
                notes="הושלם אוטומטית — מטופל נוסף לפני הוספת שלב זה",
            )
            db.add(step)
            db.flush()
            for task_tmpl in intake_st.task_templates:
                db.add(models.WorkflowStepTask(
                    step_id=step.id,
                    title=task_tmpl.title,
                    task_order=task_tmpl.task_order,
                    is_completed=True,
                    completed_at=now,
                ))
            patched += 1

        db.commit()
        if patched:
            logger.info(f"Patched {patched} journey instances with pre-completed intake step")
    except Exception as e:
        db.rollback()
        logger.error(f"patch_journey_intake_step error: {e}")
    finally:
        db.close()


patch_journey_intake_step()


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
        return FileResponse(
            os.path.join(FRONTEND_DIST, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"}
        )

    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from database import engine, SessionLocal
import models
import auth as auth_module
from routes import auth, patients, insurance, claims, strategy, responsiveness, import_data, private_import, learning, public, doctors, admin, documents, workflows, webauthn as webauthn_routes, specialties, settings as settings_routes, medications as medications_routes, policy_ai as policy_ai_routes, audit as audit_routes, financial_map as financial_map_routes, care_team as care_team_routes, meetings as meetings_routes, form17 as form17_routes, red_flags as red_flags_routes, reports as reports_routes, patient_portal as patient_portal_routes, family_share as family_share_routes, tasks as tasks_routes, calendar_feed as calendar_feed_routes, broker as broker_routes, address as address_routes
from routes.patient_auth import router as patient_auth_router
from audit_middleware import AuditMiddleware
from data.seed_data import RESPONSIVENESS_DEFAULTS
import sqlalchemy
import os
import logging
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

_sentry_dsn = os.getenv("SENTRY_DSN", "")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        integrations=[
            FastApiIntegration(),
            SqlalchemyIntegration(),
            LoggingIntegration(level=logging.WARNING, event_level=logging.ERROR),
        ],
        traces_sample_rate=0.1,
        send_default_pii=False,
        environment=os.getenv("RAILWAY_ENVIRONMENT", "development"),
    )
    logger.info("Sentry initialized")

def _daily_backup():
    from backup import run_backup
    result = run_backup()
    if result["error"]:
        logger.error(f"Daily backup failed: {result}")
    else:
        logger.info(f"Daily backup OK — local={result['local']} cloud={result['cloud']}")


def _seed_nsclc_drugs_on_startup():
    from data.nsclc_drugs import seed_nsclc_drugs
    db = SessionLocal()
    try:
        added = seed_nsclc_drugs(db)
        if added:
            logger.info(f"NSCLC drug seed: added {added} new drugs")
    finally:
        db.close()


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


def _daily_overdue_check():
    """בדיקה יומית — רושם לוג על משימות שעבר זמנן."""
    from datetime import datetime, timezone
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        overdue = db.query(models.Task).filter(
            models.Task.due_date < now,
            models.Task.status != "done",
        ).count()
        if overdue > 0:
            logger.warning(f"OVERDUE TASKS: {overdue} tasks past due date")
    finally:
        db.close()


def _daily_sla_check():
    """
    בדיקה יומית — שלבי זרימה שחצו את ה-SLA ועדיין לא קיבלו התראה.
    מסמן sla_alerted=True ויוצר WorkflowAction מסוג sla_breached.
    """
    from datetime import datetime, timezone
    import json as _json
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        breached = db.query(models.WorkflowStep).filter(
            models.WorkflowStep.sla_deadline < now,
            models.WorkflowStep.sla_alerted.is_(False),
            models.WorkflowStep.status == "active",
        ).all()
        for step in breached:
            # Normalize timezone-naive deadlines (legacy data before timezone support)
            deadline = step.sla_deadline
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
            step.sla_alerted = True
            action = models.WorkflowAction(
                step_id=step.id,
                user_id=None,
                action_type="sla_breached",
                description=f"SLA עבר — שלב '{step.name}' חצה את מועד היעד",
                data=_json.dumps({
                    "sla_deadline": deadline.isoformat(),
                    "step_key": step.step_key,
                }),
            )
            db.add(action)
            logger.warning(
                "SLA BREACH: step_id=%s step_key=%s instance_id=%s deadline=%s",
                step.id, step.step_key, step.instance_id,
                deadline.isoformat(),
            )
            # Auto-create a task for the patient's manager
            try:
                instance = db.get(models.WorkflowInstance, step.instance_id)
                if instance:
                    patient = db.get(models.Patient, instance.patient_id)
                    manager_id = patient.manager_id if patient else None
                    if manager_id:
                        existing = db.query(models.Task).filter(
                            models.Task.source_id == step.id,
                            models.Task.source_type == "sla_breach",
                        ).first()
                        if not existing:
                            db.add(models.Task(
                                title=f"חריגת SLA — {step.name}",
                                description=f"מועד היעד עבר ב-{deadline.strftime('%d/%m/%Y')}. נדרשת התייחסות.",
                                patient_id=instance.patient_id,
                                assigned_to=manager_id,
                                created_by=manager_id,
                                source_type="sla_breach",
                                source_id=step.id,
                                priority="urgent",
                                status="pending",
                                due_date=now,
                            ))
                        elif existing and existing.status != "done":
                            existing.due_date = now  # refresh deadline
            except Exception:
                logger.exception("Failed to create SLA task for step %s", step.id)
        if breached:
            db.commit()
            logger.info(f"SLA check: {len(breached)} steps marked as breached")
    except Exception:
        logger.exception("SLA check job failed")
    finally:
        db.close()


def _daily_insurance_gap_check():
    """
    בדיקה יומית — פערים ביטוחיים משמעותיים.
    לכל מטופל פעיל: מחשב פער ביטוחי. אם > 30% — יוצר PatientRedFlag.
    אם הפער ירד מתחת לסף — מסמן את הדגל כלא פעיל.
    """
    from routes.financial_map import _best_coverage_for_node
    import json as _json
    db = SessionLocal()
    try:
        patients = db.query(models.Patient).all()
        for patient in patients:
            nodes = db.query(models.Node).filter(
                models.Node.patient_id == patient.id,
                models.Node.node_type != "stage",
                models.Node.overlay_global.is_(False),
            ).all()
            total_cost = 0.0
            total_covered = 0.0
            for node in nodes:
                if node.estimated_cost:
                    total_cost += float(node.estimated_cost)
                    cov = _best_coverage_for_node(node, patient, db)
                    total_covered += cov["covered_amount"]

            if total_cost <= 0:
                continue

            insurance_gap = max(0.0, total_cost - total_covered)
            gap_pct = insurance_gap / total_cost

            existing_flag = db.query(models.PatientRedFlag).filter(
                models.PatientRedFlag.patient_id == patient.id,
                models.PatientRedFlag.title == "פער ביטוחי משמעותי",
            ).first()

            if gap_pct > 0.3:
                if not existing_flag:
                    pct_label = round(gap_pct * 100)
                    db.add(models.PatientRedFlag(
                        patient_id=patient.id,
                        flag_type="financial",
                        severity="warning",
                        title="פער ביטוחי משמעותי",
                        description=f"פער ביטוחי של {pct_label}% ({insurance_gap:,.0f} ₪) — מעל 30% מהעלות הכוללת.",
                        is_active=True,
                    ))
                elif not existing_flag.is_active:
                    existing_flag.is_active = True
                    pct_label = round(gap_pct * 100)
                    existing_flag.description = f"פער ביטוחי של {pct_label}% ({insurance_gap:,.0f} ₪) — מעל 30% מהעלות הכוללת."
            else:
                if existing_flag and existing_flag.is_active:
                    existing_flag.is_active = False

        db.commit()
        logger.info("Insurance gap check completed for %s patients", len(patients))
    except Exception:
        logger.exception("Insurance gap check job failed")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────
    from apscheduler.schedulers.background import BackgroundScheduler
    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(
        _weekly_drug_update,
        trigger="interval",
        weeks=1,
        id="weekly_drug_update",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _daily_overdue_check,
        trigger="cron",
        hour=8,
        minute=0,
        id="daily_overdue_check",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _daily_backup,
        trigger="cron",
        hour=3,
        minute=0,
        id="daily_backup",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _daily_sla_check,
        trigger="cron",
        hour=7,
        minute=30,
        id="daily_sla_check",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _daily_insurance_gap_check,
        trigger="cron",
        hour=9,
        minute=0,
        id="daily_insurance_gap_check",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()
    app.state.scheduler = scheduler
    logger.info("Scheduler started")
    _seed_drugs_on_startup()
    _seed_nsclc_drugs_on_startup()
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


_TRUSTED_PROXIES = {"100.64.0.0/10"}  # Railway's internal network range

def _get_real_ip(request: Request) -> str:
    client_host = request.client.host if request.client else None
    # Only trust X-Forwarded-For if the direct connection is from a trusted proxy
    # (Railway's internal network). Otherwise the header can be spoofed by end users.
    if client_host and any(
        client_host.startswith("100.64.") or client_host == "127.0.0.1"
        for _ in [1]  # single iteration to allow the condition
    ):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return client_host or "unknown"

limiter = Limiter(key_func=_get_real_ip)

app = FastAPI(title="Medical Event Manager API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_cors_origins = ["http://localhost:5173", "http://localhost:3000"]
_production_origin = os.getenv("FRONTEND_ORIGIN", "")
if _production_origin:
    _cors_origins.append(_production_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.add_middleware(AuditMiddleware)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Create tables
models.Base.metadata.create_all(bind=engine)

# SQLite column migrations — add missing columns without losing data
def run_migrations():
    migrations = [
        # Original columns
        ("patients", "hmo_name",  "VARCHAR"),
        ("patients", "hmo_level", "VARCHAR"),
        ("doctors", "source_url", "VARCHAR"),
        ("doctors", "phone2",        "VARCHAR"),
        ("doctors", "whatsapp",      "VARCHAR"),
        ("doctors", "email",         "VARCHAR"),
        ("doctors", "city",          "VARCHAR"),
        ("doctors", "private_price",  "INTEGER"),
        ("doctors", "license_number", "VARCHAR"),
        ("doctors", "title",          "VARCHAR"),
        ("doctors", "extra_data",     "TEXT"),
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
        ("nodes", "source_template_key", "VARCHAR"),
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
        ("users", "failed_login_attempts", "INTEGER DEFAULT 0"),
        ("users", "reset_verify_attempts", "INTEGER DEFAULT 0"),
        ("users", "locked_until", "DATETIME"),
        ("users", "last_login", "DATETIME"),
        ("users", "last_activity", "DATETIME"),
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
        # Journey template enrichment
        ("nodes", "overlay_global",      "BOOLEAN DEFAULT 0"),
        ("nodes", "estimated_cost",      "FLOAT"),
        ("nodes", "coverage_categories", "TEXT"),
        # Financial map — fund applications
        ("patient_fund_applications", "applied_at",   "DATETIME"),
        ("patient_fund_applications", "resolved_at",  "DATETIME"),
        ("patient_fund_applications", "updated_at",   "DATETIME"),
        # CalendarToken — expiry and revocation
        ("calendar_tokens", "expires_at", "DATETIME"),
        ("calendar_tokens", "is_active",  "BOOLEAN DEFAULT 1"),
        # Family share revocation audit
        ("family_share_tokens", "revoked_at", "DATETIME"),
        ("family_share_tokens", "revoked_by", "INTEGER"),
        # Calendar token mandatory TTL
        ("calendar_tokens", "expires_at_v2", "DATETIME"),
        # SMS 2FA phone number on User
        ("users", "phone_2fa",        "TEXT"),
        ("users", "phone_2fa_prefix", "TEXT"),
        # User permissions (granular download/export permissions)
        ("users", "permissions",          "TEXT"),
        ("users", "must_change_password", "BOOLEAN DEFAULT 0"),
        # NSCLC clinical fields on Patient
        ("patients", "smoking_status",        "TEXT"),
        ("patients", "ngs_method",            "TEXT"),
        ("patients", "fev1_score",            "REAL"),
        ("patients", "access_type",           "TEXT"),
        ("patients", "biomarker_target",      "TEXT"),
        ("patients", "tumor_board_surgeon",    "BOOLEAN DEFAULT 0"),
        ("patients", "tumor_board_oncologist", "BOOLEAN DEFAULT 0"),
        ("patients", "tumor_board_radiation",  "BOOLEAN DEFAULT 0"),
        # Parallel & gate fields on WorkflowStepTemplate
        ("workflow_step_templates", "parallel_group",      "TEXT"),
        ("workflow_step_templates", "sla_days",            "INTEGER"),
        ("workflow_step_templates", "gate_condition",      "TEXT"),
        ("workflow_step_templates", "gate_error_msg",      "TEXT"),
        ("workflow_step_templates", "is_exploration_gate", "BOOLEAN DEFAULT 0"),
        # Parallel & SLA runtime fields on WorkflowStep
        ("workflow_steps", "parallel_group", "TEXT"),
        ("workflow_steps", "sla_deadline",   "DATETIME"),
        ("workflow_steps", "sla_alerted",    "BOOLEAN DEFAULT 0"),
        ("workflow_steps", "gate_fields",    "TEXT"),
        # Oncology logistics on DrugEntry
        ("drug_entries", "msl_phone",           "TEXT"),
        ("drug_entries", "access_type",         "TEXT"),
        ("drug_entries", "treatment_line",      "TEXT"),
        ("drug_entries", "indication_oncology", "TEXT"),
        # Doctor enrichment fields
        ("doctors", "working_hours",         "TEXT"),
        ("doctors", "accessibility",         "BOOLEAN DEFAULT 0"),
        ("doctors", "waiting_days",          "INTEGER"),
        ("doctors", "is_accepting_patients", "BOOLEAN DEFAULT 1"),
        ("doctors", "last_verified",         "DATETIME"),
        ("doctors", "active_contact",        "BOOLEAN DEFAULT 0"),
    ]
    with engine.connect() as conn:
        # ── Schema version tracking ──────────────────────────────────────────
        conn.execute(sqlalchemy.text(
            "CREATE TABLE IF NOT EXISTS schema_versions ("
            "  version INTEGER PRIMARY KEY,"
            "  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            "  description TEXT"
            ")"
        ))
        conn.commit()

        # Create new tables (idempotent)
        conn.execute(sqlalchemy.text(
            "CREATE TABLE IF NOT EXISTS active_sessions ("
            "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
            "  jti TEXT UNIQUE NOT NULL,"
            "  login_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,"
            "  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,"
            "  ip_address TEXT,"
            "  user_agent TEXT,"
            "  is_active BOOLEAN DEFAULT 1 NOT NULL,"
            "  revoked_at DATETIME,"
            "  revoked_by INTEGER"
            ")"
        ))
        conn.commit()

        for table, col, col_type in migrations:
            try:
                conn.execute(sqlalchemy.text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                conn.commit()
                logger.info(f"Migration applied: {table}.{col}")
            except Exception:
                pass  # column already exists

        # Record current schema version
        version = len(migrations)
        existing = conn.execute(sqlalchemy.text(
            "SELECT version FROM schema_versions WHERE version = :v"
        ), {"v": version}).fetchone()
        if not existing:
            conn.execute(sqlalchemy.text(
                "INSERT INTO schema_versions (version, description) VALUES (:v, :d)"
            ), {"v": version, "d": f"auto-migration batch — {version} columns"})
            conn.commit()
            logger.info(f"Schema version recorded: {version}")

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


JOURNEY_STAGES = [
    {"description": "גילוי ואבחון",   "stage_order": 10},
    {"description": "תכנון הטיפול",   "stage_order": 20},
    {"description": "שלב הטיפולים",   "stage_order": 30},
    {"description": "החלמה ושיקום",   "stage_order": 40},
    {"description": "מעקב",           "stage_order": 50},
]


def seed_journey_stages():
    """Idempotent: ensures all patients have exactly the 5 journey stages."""
    db = SessionLocal()
    try:
        # Quick-exit: if no patients exist, nothing to do
        if db.query(models.Patient).count() == 0:
            logger.info("seed_journey_stages: no patients, skipping")
            return
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
    # Safety guard: only delete if ALLOW_USER_RESET=1 is explicitly set in the environment.
    # This prevents accidental wipe if the flag file is lost from the Railway volume.
    if os.environ.get("ALLOW_USER_RESET") != "1":
        logger.warning("reset_users_once: flag file missing but ALLOW_USER_RESET not set — skipping wipe")
        open(flag, "w").close()
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
app.include_router(settings_routes.router)
app.include_router(documents.router)
app.include_router(workflows.router)
app.include_router(webauthn_routes.router)
app.include_router(specialties.router)
app.include_router(medications_routes.router)
app.include_router(policy_ai_routes.router)
app.include_router(audit_routes.router)
app.include_router(financial_map_routes.router)
app.include_router(care_team_routes.router)
app.include_router(meetings_routes.router)
app.include_router(form17_routes.router)
app.include_router(red_flags_routes.router)
app.include_router(reports_routes.router)
app.include_router(patient_portal_routes.router)
app.include_router(family_share_routes.router)
app.include_router(tasks_routes.router)
app.include_router(calendar_feed_routes.router)
app.include_router(broker_routes.router)
app.include_router(address_routes.router)
app.include_router(patient_auth_router)


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
                        gate = step_data.get("gate_condition")
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
                            parallel_group=step_data.get("parallel_group"),
                            sla_days=step_data.get("sla_days"),
                            gate_condition=_json.dumps(gate) if gate else None,
                            gate_error_msg=step_data.get("gate_error_msg"),
                            is_exploration_gate=step_data.get("is_exploration_gate", False),
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
                gate = step.get("gate_condition")
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
                    parallel_group=step.get("parallel_group"),
                    sla_days=step.get("sla_days"),
                    gate_condition=_json.dumps(gate) if gate else None,
                    gate_error_msg=step.get("gate_error_msg"),
                    is_exploration_gate=step.get("is_exploration_gate", False),
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


def seed_financial_funds():
    """Idempotent: load Israeli financial funds if table is empty."""
    import json as _json
    from data.financial_funds_seed import FINANCIAL_FUNDS
    db = SessionLocal()
    try:
        if db.query(models.FinancialFund).count() > 0:
            return
        for f in FINANCIAL_FUNDS:
            conds = f.get("eligible_conditions")
            db.add(models.FinancialFund(
                name=f["name"],
                fund_type=f["fund_type"],
                organization=f.get("organization"),
                description=f.get("description"),
                max_amount=f.get("max_amount"),
                eligible_conditions=_json.dumps(conds) if conds is not None else None,
                eligible_ages_min=f.get("eligible_ages_min"),
                eligible_ages_max=f.get("eligible_ages_max"),
                application_url=f.get("application_url"),
                contact_phone=f.get("contact_phone"),
                notes=f.get("notes"),
                is_active=True,
            ))
        db.commit()
        logger.info(f"Financial funds seeded: {len(FINANCIAL_FUNDS)} funds")
    except Exception as e:
        db.rollback()
        logger.error(f"Financial funds seed error: {e}")
    finally:
        db.close()

seed_financial_funds()



def seed_journey_workflows():
    """Idempotent: ensure every patient has an active journey workflow instance."""
    db = SessionLocal()
    try:
        if db.query(models.Patient).count() == 0:
            return  # quick-exit if no patients
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
            creator_id = patient.manager_id
            if creator_id is None:
                fallback = db.query(models.User).filter(
                    models.User.is_admin == True,
                    models.User.is_active == True,
                ).first()
                if not fallback:
                    logger.warning(f"seed_journey_workflows: patient {patient.id} ({getattr(patient, 'full_name', 'unknown')}) has no manager_id and no active admin found — skipping")
                    continue
                creator_id = fallback.id
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


_INTAKE_PATCH_FLAG = "/data/.intake_step_patched_v1" if os.path.isdir("/data") else "./.intake_step_patched_v1"
if not os.path.exists(_INTAKE_PATCH_FLAG):
    patch_journey_intake_step()
    open(_INTAKE_PATCH_FLAG, "w").close()


@app.get("/api/health")
def health():
    db_status = "ok"
    try:
        with engine.connect() as conn:
            conn.execute(sqlalchemy.text("SELECT 1"))
    except Exception as e:
        db_status = "error"
        logger.error("Health check DB failure: %s", e)
    return {"status": "ok", "db": db_status}


@app.post("/api/admin/backup")
def trigger_backup(current_user=Depends(auth_module.require_admin)):
    from backup import run_backup
    result = run_backup()
    return result


# Serve React frontend (production build)
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "../frontend/dist")

if os.path.exists(FRONTEND_DIST):
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str, request: Request):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
            # Hashed assets (JS/CSS with content hash in filename) — cache 1 year
            if "/assets/" in full_path and (full_path.endswith(".js") or full_path.endswith(".css")):
                return FileResponse(file_path, headers={"Cache-Control": "public, max-age=31536000, immutable"})
            return FileResponse(file_path)
        # SPA fallback — always revalidate so new deploys take effect immediately
        return FileResponse(
            os.path.join(FRONTEND_DIST, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"}
        )

    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

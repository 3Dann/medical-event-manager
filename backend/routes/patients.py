from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models
import auth as auth_utils
from data.seed_data import HMO_COVERAGES
from data.hmo_plans_data import HMO_PLANS, get_plan_coverages, get_plan_label
import os, base64, json
from datetime import datetime, timezone

router = APIRouter(prefix="/api/patients", tags=["patients"])

SIGNATURES_DIR = os.environ.get("SIGNATURES_DIR", "/data/signatures")


class PatientCreate(BaseModel):
    # Core
    full_name: str
    id_number: Optional[str] = None
    diagnosis_status: str = "no"
    diagnosis_details: Optional[str] = None
    notes: Optional[str] = None
    hmo_name: Optional[str] = None
    hmo_level: Optional[str] = None
    condition_tags: Optional[str] = None
    medical_stage: Optional[str] = None
    # Demographics
    phone_prefix: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[str] = None
    marital_status: Optional[str] = None
    num_children: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    # Address
    city: Optional[str] = None
    city_code: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = None
    entrance: Optional[str] = None
    floor: Optional[str] = None
    apartment: Optional[str] = None
    postal_code: Optional[str] = None
    # Emergency contact
    ec_name: Optional[str] = None
    ec_phone_prefix: Optional[str] = None
    ec_phone: Optional[str] = None
    ec_relation: Optional[str] = None
    # Medications
    medications: Optional[str] = None   # JSON string
    # Assessments
    adl_answers: Optional[str] = None
    iadl_answers: Optional[str] = None
    mmse_answers: Optional[str] = None
    adl_score: Optional[int] = None
    iadl_score: Optional[int] = None
    mmse_score: Optional[int] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    id_number: Optional[str] = None
    diagnosis_status: Optional[str] = None
    diagnosis_details: Optional[str] = None
    notes: Optional[str] = None
    hmo_name: Optional[str] = None
    hmo_level: Optional[str] = None
    condition_tags: Optional[str] = None
    medical_stage: Optional[str] = None
    phone_prefix: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    birth_date: Optional[str] = None
    marital_status: Optional[str] = None
    num_children: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    city: Optional[str] = None
    city_code: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = None
    entrance: Optional[str] = None
    floor: Optional[str] = None
    apartment: Optional[str] = None
    postal_code: Optional[str] = None
    ec_name: Optional[str] = None
    ec_phone_prefix: Optional[str] = None
    ec_phone: Optional[str] = None
    ec_relation: Optional[str] = None
    medications: Optional[str] = None
    adl_answers: Optional[str] = None
    iadl_answers: Optional[str] = None
    mmse_answers: Optional[str] = None
    adl_score: Optional[int] = None
    iadl_score: Optional[int] = None
    mmse_score: Optional[int] = None


class SignaturesIn(BaseModel):
    consent_agreed: bool = False
    consent_signature_b64: Optional[str] = None   # base64 PNG data URL
    poa_agreed: bool = False
    poa_signature_b64: Optional[str] = None


class NodeCreate(BaseModel):
    node_type: str
    description: str
    planned_date: Optional[str] = None
    status: str = "future"
    notes: Optional[str] = None
    stage_order: Optional[int] = None


class NodeUpdate(BaseModel):
    node_type: Optional[str] = None
    description: Optional[str] = None
    planned_date: Optional[str] = None
    actual_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    stage_order: Optional[int] = None


def patient_to_dict(p):
    return {
        "id": p.id,
        "full_name": p.full_name,
        "id_number": p.id_number,
        "diagnosis_status": p.diagnosis_status,
        "diagnosis_details": p.diagnosis_details,
        "notes": p.notes,
        "hmo_name": p.hmo_name,
        "hmo_level": p.hmo_level,
        "condition_tags": p.condition_tags,
        "medical_stage": p.medical_stage,
        "manager_id": p.manager_id,
        "created_at": str(p.created_at) if p.created_at else None,
        # Demographics
        "phone_prefix": p.phone_prefix,
        "phone": p.phone,
        "gender": p.gender,
        "birth_date": p.birth_date,
        "marital_status": p.marital_status,
        "num_children": p.num_children,
        "height_cm": p.height_cm,
        "weight_kg": p.weight_kg,
        # Address
        "city": p.city,
        "city_code": p.city_code,
        "street": p.street,
        "house_number": p.house_number,
        "entrance": p.entrance,
        "floor": p.floor,
        "apartment": p.apartment,
        "postal_code": p.postal_code,
        # Emergency contact
        "ec_name": p.ec_name,
        "ec_phone_prefix": p.ec_phone_prefix,
        "ec_phone": p.ec_phone,
        "ec_relation": p.ec_relation,
        # Medications & assessments
        "medications": json.loads(p.medications) if p.medications else [],
        "adl_score": p.adl_score,
        "iadl_score": p.iadl_score,
        "mmse_score": p.mmse_score,
        # Intake status
        "consent_agreed": p.consent_agreed,
        "poa_agreed": p.poa_agreed,
        "intake_completed": p.intake_completed,
    }


def node_to_dict(n):
    return {
        "id": n.id,
        "patient_id": n.patient_id,
        "node_type": n.node_type,
        "description": n.description,
        "planned_date": n.planned_date,
        "actual_date": n.actual_date,
        "status": n.status,
        "notes": n.notes,
        "stage_order": n.stage_order,
        "created_at": str(n.created_at) if n.created_at else None,
    }


# ── HMO plans lookup ──────────────────────────────────────

@router.get("/hmo-plans/{hmo_name}")
def get_hmo_plans(hmo_name: str):
    from data.hmo_plans_data import HMO_PLANS
    plans = HMO_PLANS.get(hmo_name, {})
    return [{"key": k, "label": v["label"]} for k, v in plans.items()]


# ── Patients ──────────────────────────────────────────────

@router.get("")
def list_patients(db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    if current_user.role == "manager":
        own = db.query(models.Patient).filter(models.Patient.manager_id == current_user.id).all()
        # Also include patients the admin explicitly shared with this manager
        permitted_ids = [
            r.patient_id for r in db.query(models.PatientPermission).filter(
                models.PatientPermission.manager_id == current_user.id
            ).all()
        ]
        shared = []
        if permitted_ids:
            seen = {p.id for p in own}
            shared = [p for p in db.query(models.Patient).filter(models.Patient.id.in_(permitted_ids)).all()
                      if p.id not in seen]
        patients = own + shared
    elif current_user.is_admin:
        patients = db.query(models.Patient).all()
    else:
        patients = db.query(models.Patient).filter(models.Patient.patient_user_id == current_user.id).all()
    return [patient_to_dict(p) for p in patients]


def _import_hmo_plan(db, patient_id, hmo_name, plan_key, plan_label, coverages):
    """Import a single HMO plan if not already present."""
    already = db.query(models.InsuranceSource).filter(
        models.InsuranceSource.patient_id == patient_id,
        models.InsuranceSource.source_type == "kupat_holim",
        models.InsuranceSource.hmo_name == hmo_name,
        models.InsuranceSource.hmo_level == plan_key,
    ).first()
    if already:
        return False
    source = models.InsuranceSource(
        patient_id=patient_id, source_type="kupat_holim",
        hmo_name=hmo_name, hmo_level=plan_key,
        notes=f"יובא אוטומטית — {plan_label}",
    )
    db.add(source)
    db.flush()
    for category, cov in coverages.items():
        db.add(models.Coverage(
            insurance_source_id=source.id, category=category,
            is_covered=cov.get("is_covered", False),
            coverage_percentage=cov.get("coverage_percentage"),
            coverage_amount=cov.get("coverage_amount"),
            copay=cov.get("copay"), annual_limit=cov.get("annual_limit"),
            conditions=cov.get("conditions"),
            abroad_covered=cov.get("abroad_covered", False),
            notes=cov.get("notes"),
        ))
    return True


def _auto_import_hmo(db, patient_id, hmo_name, plan_key):
    """Auto-import the selected HMO plan (skips if already exists)."""
    if not hmo_name or hmo_name not in HMO_PLANS:
        return
    plans = HMO_PLANS[hmo_name]
    if plan_key and plan_key in plans:
        plan = plans[plan_key]
        _import_hmo_plan(db, patient_id, hmo_name, plan_key, plan["label"], plan["coverages"])
    elif plans:
        # Fallback: import first available plan
        first_key = next(iter(plans))
        plan = plans[first_key]
        _import_hmo_plan(db, patient_id, hmo_name, first_key, plan["label"], plan["coverages"])


_JOURNEY_STAGES = [
    {"description": "גילוי ואבחון",  "stage_order": 10},
    {"description": "תכנון הטיפול",  "stage_order": 20},
    {"description": "שלב הטיפולים",  "stage_order": 30},
    {"description": "החלמה ושיקום",  "stage_order": 40},
    {"description": "מעקב",          "stage_order": 50},
]


@router.post("")
def create_patient(data: PatientCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    patient = models.Patient(**data.model_dump(), manager_id=current_user.id)
    db.add(patient)
    db.flush()
    if patient.hmo_name:
        _auto_import_hmo(db, patient.id, patient.hmo_name, patient.hmo_level)
    for stage in _JOURNEY_STAGES:
        db.add(models.Node(
            patient_id=patient.id,
            node_type="stage",
            description=stage["description"],
            stage_order=stage["stage_order"],
            status="future",
        ))
    db.commit()
    db.refresh(patient)

    # Auto-create journey workflow instance
    try:
        journey_tmpl = db.query(models.WorkflowTemplate).filter(
            models.WorkflowTemplate.is_journey == True,
            models.WorkflowTemplate.is_active == True,
        ).first()
        if journey_tmpl:
            from flow_engine import FlowEngine
            FlowEngine.create_instance(
                db=db,
                template_id=journey_tmpl.id,
                patient_id=patient.id,
                created_by=current_user.id,
                title="מסע המטופל",
            )
    except Exception:
        pass  # journey workflow is advisory — never block patient creation

    return patient_to_dict(patient)


@router.post("/{patient_id}/signatures")
def save_signatures(
    patient_id: int,
    data: SignaturesIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    patient = auth_utils.get_patient_with_access(patient_id, current_user, db)

    def _save_sig(b64_data_url: str, filename: str) -> str:
        sig_dir = os.path.join(SIGNATURES_DIR, str(patient_id))
        os.makedirs(sig_dir, exist_ok=True)
        # Strip data URL prefix: "data:image/png;base64,<data>"
        if "," in b64_data_url:
            b64_data_url = b64_data_url.split(",", 1)[1]
        img_bytes = base64.b64decode(b64_data_url)
        path = os.path.join(sig_dir, filename)
        with open(path, "wb") as f:
            f.write(img_bytes)
        return path

    now = datetime.now(timezone.utc)

    patient.consent_agreed = data.consent_agreed
    if data.consent_agreed and data.consent_signature_b64:
        patient.consent_signature_path = _save_sig(data.consent_signature_b64, "consent.png")
        patient.consent_signed_at = now

    patient.poa_agreed = data.poa_agreed
    if data.poa_agreed and data.poa_signature_b64:
        patient.poa_signature_path = _save_sig(data.poa_signature_b64, "poa.png")
        patient.poa_signed_at = now

    patient.intake_completed = True
    patient.intake_completed_at = now

    db.commit()
    return {"ok": True, "intake_completed": True}


@router.get("/{patient_id}")
def get_patient(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    patient = auth_utils.get_patient_with_access(patient_id, current_user, db)
    return patient_to_dict(patient)


@router.put("/{patient_id}")
def update_patient(patient_id: int, data: PatientUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    patient = auth_utils.get_patient_with_access(patient_id, current_user, db)
    old_hmo = patient.hmo_name
    old_level = patient.hmo_level
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(patient, field, value)
    # Auto-import if HMO was just set or changed
    if patient.hmo_name and (patient.hmo_name != old_hmo or patient.hmo_level != old_level):
        _auto_import_hmo(db, patient_id, patient.hmo_name, patient.hmo_level)
    db.commit()
    db.refresh(patient)
    return patient_to_dict(patient)


@router.delete("/{patient_id}")
def delete_patient(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    patient = auth_utils.get_patient_with_access(patient_id, current_user, db)
    db.delete(patient)
    db.commit()
    return {"message": "Patient deleted"}


# ── Nodes ──────────────────────────────────────────────────

@router.get("/{patient_id}/nodes")
def list_nodes(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    nodes = db.query(models.Node).filter(models.Node.patient_id == patient_id).all()
    return [node_to_dict(n) for n in nodes]


@router.post("/{patient_id}/nodes")
def create_node(patient_id: int, data: NodeCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    node = models.Node(**data.model_dump(), patient_id=patient_id)
    db.add(node)
    db.commit()
    db.refresh(node)
    return node_to_dict(node)


@router.put("/{patient_id}/nodes/{node_id}")
def update_node(patient_id: int, node_id: int, data: NodeUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    node = db.query(models.Node).filter(models.Node.id == node_id, models.Node.patient_id == patient_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(node, field, value)
    db.commit()
    db.refresh(node)
    return node_to_dict(node)


@router.delete("/{patient_id}/nodes/{node_id}")
def delete_node(patient_id: int, node_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    auth_utils.get_patient_with_access(patient_id, current_user, db)
    node = db.query(models.Node).filter(models.Node.id == node_id, models.Node.patient_id == patient_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    db.delete(node)
    db.commit()
    return {"message": "Node deleted"}

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/patients", tags=["patients"])


class PatientCreate(BaseModel):
    full_name: str
    id_number: Optional[str] = None
    diagnosis_status: str = "no"
    diagnosis_details: Optional[str] = None
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    id_number: Optional[str] = None
    diagnosis_status: Optional[str] = None
    diagnosis_details: Optional[str] = None
    notes: Optional[str] = None


class NodeCreate(BaseModel):
    node_type: str
    description: str
    planned_date: Optional[str] = None
    status: str = "future"
    notes: Optional[str] = None


class NodeUpdate(BaseModel):
    node_type: Optional[str] = None
    description: Optional[str] = None
    planned_date: Optional[str] = None
    actual_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


def patient_to_dict(p):
    return {
        "id": p.id,
        "full_name": p.full_name,
        "id_number": p.id_number,
        "diagnosis_status": p.diagnosis_status,
        "diagnosis_details": p.diagnosis_details,
        "notes": p.notes,
        "manager_id": p.manager_id,
        "created_at": str(p.created_at) if p.created_at else None,
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
        "created_at": str(n.created_at) if n.created_at else None,
    }


# ── Patients ──────────────────────────────────────────────

@router.get("")
def list_patients(db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    if current_user.role == "manager":
        patients = db.query(models.Patient).filter(models.Patient.manager_id == current_user.id).all()
    else:
        patients = db.query(models.Patient).filter(models.Patient.patient_user_id == current_user.id).all()
    return [patient_to_dict(p) for p in patients]


@router.post("")
def create_patient(data: PatientCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    patient = models.Patient(**data.model_dump(), manager_id=current_user.id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient_to_dict(patient)


@router.get("/{patient_id}")
def get_patient(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if current_user.role == "manager" and patient.manager_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if current_user.role == "patient" and patient.patient_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return patient_to_dict(patient)


@router.put("/{patient_id}")
def update_patient(patient_id: int, data: PatientUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id, models.Patient.manager_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient_to_dict(patient)


@router.delete("/{patient_id}")
def delete_patient(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id, models.Patient.manager_id == current_user.id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(patient)
    db.commit()
    return {"message": "Patient deleted"}


# ── Nodes ──────────────────────────────────────────────────

@router.get("/{patient_id}/nodes")
def list_nodes(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.get_current_user)):
    nodes = db.query(models.Node).filter(models.Node.patient_id == patient_id).all()
    return [node_to_dict(n) for n in nodes]


@router.post("/{patient_id}/nodes")
def create_node(patient_id: int, data: NodeCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
    node = models.Node(**data.model_dump(), patient_id=patient_id)
    db.add(node)
    db.commit()
    db.refresh(node)
    return node_to_dict(node)


@router.put("/{patient_id}/nodes/{node_id}")
def update_node(patient_id: int, node_id: int, data: NodeUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth_utils.require_manager)):
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
    node = db.query(models.Node).filter(models.Node.id == node_id, models.Node.patient_id == patient_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    db.delete(node)
    db.commit()
    return {"message": "Node deleted"}

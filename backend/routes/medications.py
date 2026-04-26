from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import requests as http_requests
from database import get_db
import models
import auth as auth_utils

router = APIRouter(tags=["medications"])

# Israeli MOH drug registry on data.gov.il (CKAN)
_MOH_RESOURCE_ID = "fc8ada28-7b38-4b4f-8a32-8e47d9d10bca"
_CKAN_SEARCH_URL = "https://data.gov.il/api/3/action/datastore_search"


class MedicationCreate(BaseModel):
    name: str
    generic_name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    generic_name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


def med_to_dict(m):
    return {
        "id": m.id,
        "patient_id": m.patient_id,
        "name": m.name,
        "generic_name": m.generic_name,
        "dosage": m.dosage,
        "frequency": m.frequency,
        "start_date": m.start_date,
        "end_date": m.end_date,
        "notes": m.notes,
        "is_active": m.is_active,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


# ── Patient medication CRUD ───────────────────────────────────────────────────

@router.get("/api/patients/{patient_id}/medications")
def list_medications(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="מטופל לא נמצא")
    meds = (
        db.query(models.PatientMedication)
        .filter(models.PatientMedication.patient_id == patient_id)
        .order_by(models.PatientMedication.is_active.desc(), models.PatientMedication.created_at.desc())
        .all()
    )
    return [med_to_dict(m) for m in meds]


@router.post("/api/patients/{patient_id}/medications")
def add_medication(
    patient_id: int,
    body: MedicationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="מטופל לא נמצא")
    med = models.PatientMedication(patient_id=patient_id, **body.dict())
    db.add(med)
    db.commit()
    db.refresh(med)
    return med_to_dict(med)


@router.put("/api/patients/{patient_id}/medications/{med_id}")
def update_medication(
    patient_id: int,
    med_id: int,
    body: MedicationUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    med = (
        db.query(models.PatientMedication)
        .filter(models.PatientMedication.id == med_id, models.PatientMedication.patient_id == patient_id)
        .first()
    )
    if not med:
        raise HTTPException(status_code=404, detail="תרופה לא נמצאה")
    for field, val in body.dict(exclude_unset=True).items():
        setattr(med, field, val)
    db.commit()
    db.refresh(med)
    return med_to_dict(med)


@router.delete("/api/patients/{patient_id}/medications/{med_id}")
def delete_medication(
    patient_id: int,
    med_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    med = (
        db.query(models.PatientMedication)
        .filter(models.PatientMedication.id == med_id, models.PatientMedication.patient_id == patient_id)
        .first()
    )
    if not med:
        raise HTTPException(status_code=404, detail="תרופה לא נמצאה")
    db.delete(med)
    db.commit()
    return {"ok": True}


# ── MOH drug search (proxy to data.gov.il) ───────────────────────────────────

@router.get("/api/medications/search")
def search_drugs(
    q: str,
    current_user=Depends(auth_utils.get_current_user),
):
    if len(q.strip()) < 2:
        return []
    try:
        resp = http_requests.get(
            _CKAN_SEARCH_URL,
            params={"resource_id": _MOH_RESOURCE_ID, "q": q.strip(), "limit": 10},
            timeout=5,
        )
        data = resp.json()
        if not data.get("success"):
            return []
        records = data.get("result", {}).get("records", [])
        seen = set()
        results = []
        for r in records:
            name = (r.get("shem_mirkhari") or r.get("shem_mirkhari_en") or "").strip()
            generic = (r.get("shem_klali") or r.get("chomer_peeel") or "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            results.append({
                "name": name,
                "generic_name": generic,
                "dosage_form": (r.get("tzurat_matan") or "").strip(),
                "manufacturer": (r.get("baal_harsha") or "").strip(),
            })
        return results
    except Exception:
        return []

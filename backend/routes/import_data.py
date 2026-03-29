from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
import models
import auth as auth_utils
from data.seed_data import SAL_HABRIUT_COVERAGES
from data.bituch_leumi_data import BITUCH_LEUMI_ENTITLEMENTS

router = APIRouter(prefix="/api/import", tags=["import"])


class ImportSalRequest(BaseModel):
    id_number: str


@router.post("/sal-habriut")
def import_sal_habriut(
    data: ImportSalRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    # Find patient by id_number under this manager
    patient = db.query(models.Patient).filter(
        models.Patient.id_number == data.id_number,
        models.Patient.manager_id == current_user.id,
    ).first()

    if not patient:
        raise HTTPException(status_code=404, detail=f"לא נמצא מטופל עם ת.ז. {data.id_number}")

    # Check if סל הבריאות already exists
    existing = db.query(models.InsuranceSource).filter(
        models.InsuranceSource.patient_id == patient.id,
        models.InsuranceSource.source_type == "sal_habriut",
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"סל הבריאות כבר קיים בתיק {patient.full_name} — לא ניתן להוסיף כפילות"
        )

    # Create source
    source = models.InsuranceSource(
        patient_id=patient.id,
        source_type="sal_habriut",
        notes="יובא אוטומטית מסל הבריאות",
    )
    db.add(source)
    db.flush()

    # Add all 8 coverages
    for category, cov in SAL_HABRIUT_COVERAGES.items():
        coverage = models.Coverage(
            insurance_source_id=source.id,
            category=category,
            is_covered=cov.get("is_covered", True),
            coverage_percentage=cov.get("coverage_percentage"),
            copay=cov.get("copay"),
            annual_limit=cov.get("annual_limit"),
            conditions=cov.get("conditions"),
            abroad_covered=cov.get("abroad_covered", False),
            notes=cov.get("notes"),
        )
        db.add(coverage)

    db.commit()

    return {
        "message": f"סל הבריאות יובא בהצלחה לתיק {patient.full_name}",
        "patient_id": patient.id,
        "patient_name": patient.full_name,
        "coverages_imported": len(SAL_HABRIUT_COVERAGES),
    }


@router.post("/bituch-leumi")
def import_bituch_leumi(
    data: ImportSalRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    # Find patient by id_number under this manager
    patient = db.query(models.Patient).filter(
        models.Patient.id_number == data.id_number,
        models.Patient.manager_id == current_user.id,
    ).first()

    if not patient:
        raise HTTPException(status_code=404, detail=f"לא נמצא מטופל עם ת.ז. {data.id_number}")

    # Check if entitlements already imported
    existing_count = db.query(models.Entitlement).filter(
        models.Entitlement.patient_id == patient.id
    ).count()

    if existing_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"זכאויות ביטוח לאומי כבר קיימות בתיק {patient.full_name} — {existing_count} זכאויות קיימות"
        )

    # Import all default entitlements
    for item in BITUCH_LEUMI_ENTITLEMENTS:
        entitlement = models.Entitlement(
            patient_id=patient.id,
            entitlement_type=item["entitlement_type"],
            title=item["title"],
            description=item.get("description"),
            amount=item.get("amount"),
            is_approved=item.get("is_approved", False),
        )
        db.add(entitlement)

    db.commit()

    return {
        "message": f"ביטוח לאומי יובא בהצלחה לתיק {patient.full_name}",
        "patient_id": patient.id,
        "patient_name": patient.full_name,
        "entitlements_imported": len(BITUCH_LEUMI_ENTITLEMENTS),
    }

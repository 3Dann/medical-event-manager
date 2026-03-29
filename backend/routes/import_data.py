from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
import models
import auth as auth_utils
from data.seed_data import SAL_HABRIUT_COVERAGES
from data.hmo_plans_data import HMO_PLANS, get_plan_label
from data.bituch_leumi_data import BITUCH_LEUMI_ENTITLEMENTS

router = APIRouter(prefix="/api/import", tags=["import"])


class ImportSalRequest(BaseModel):
    id_number: str


class ImportKupatHolimRequest(BaseModel):
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


HMO_NAME_LABELS = {"clalit": "כללית", "maccabi": "מכבי", "meuhedet": "מאוחדת", "leumit": "לאומית"}


@router.post("/kupat-holim")
def import_kupat_holim(
    data: ImportKupatHolimRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.require_manager),
):
    patient = db.query(models.Patient).filter(
        models.Patient.id_number == data.id_number,
        models.Patient.manager_id == current_user.id,
    ).first()

    if not patient:
        raise HTTPException(status_code=404, detail=f"לא נמצא מטופל עם ת.ז. {data.id_number}")

    if not patient.hmo_name or patient.hmo_name not in HMO_PLANS:
        raise HTTPException(status_code=400, detail="לא הוגדרה קופת חולים בתיק המטופל — עדכן תחילה בלשונית פרטים")

    if not patient.hmo_level:
        raise HTTPException(status_code=400, detail="לא הוגדרה תוכנית ביטוח משלים — עדכן תחילה בלשונית פרטים")

    hmo_name = patient.hmo_name
    plan_key = patient.hmo_level
    plans = HMO_PLANS[hmo_name]

    if plan_key not in plans:
        raise HTTPException(status_code=400, detail=f"תוכנית '{plan_key}' לא נמצאה עבור {HMO_NAME_LABELS.get(hmo_name, hmo_name)}")

    plan = plans[plan_key]
    plan_label = plan["label"]

    already = db.query(models.InsuranceSource).filter(
        models.InsuranceSource.patient_id == patient.id,
        models.InsuranceSource.source_type == "kupat_holim",
        models.InsuranceSource.hmo_name == hmo_name,
        models.InsuranceSource.hmo_level == plan_key,
    ).first()
    if already:
        raise HTTPException(status_code=400, detail=f"{plan_label} כבר קיימת בתיק {patient.full_name}")

    source = models.InsuranceSource(
        patient_id=patient.id, source_type="kupat_holim",
        hmo_name=hmo_name, hmo_level=plan_key,
        notes=f"יובא אוטומטית — {plan_label}",
    )
    db.add(source)
    db.flush()

    for category, cov in plan["coverages"].items():
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

    db.commit()
    return {
        "message": f"{plan_label} יובאה בהצלחה לתיק {patient.full_name}",
        "patient_id": patient.id,
        "patient_name": patient.full_name,
        "plan_label": plan_label,
    }

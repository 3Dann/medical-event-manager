"""
routes/specialties.py — Medical Specialties API

Endpoints:
  GET  /api/specialties              — list all (with sub-specialties tree or flat)
  GET  /api/specialties/{id}         — detail for one specialty
  POST /api/specialties/scrape       — trigger fresh scrape (admin only)
  POST /api/specialties/{id}/feedback — learning: confirm / correct / flag a record
  GET  /api/specialties/insights     — learning analytics (confidence distribution, top flagged)
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session, subqueryload
from sqlalchemy import func, or_
from pydantic import BaseModel
from typing import Optional
import json

from database import get_db
import models
from auth import get_current_user

router = APIRouter(prefix="/api/specialties", tags=["specialties"])


# ── Schemas ────────────────────────────────────────────────────────────────

class SpecialtyOut(BaseModel):
    id: int
    name_en: str
    name_he: Optional[str]
    description_en: Optional[str]
    description_he: Optional[str]
    parent_id: Optional[int]
    source_url: Optional[str]
    confidence_score: Optional[float] = 1.0
    feedback_count: Optional[int] = 0
    is_verified: Optional[bool] = False
    is_active: Optional[bool] = True

    class Config:
        from_attributes = True


class SpecialtyWithChildren(SpecialtyOut):
    sub_specialties: list["SpecialtyWithChildren"] = []

    class Config:
        from_attributes = True


SpecialtyWithChildren.model_rebuild()


class FeedbackIn(BaseModel):
    action: str               # "confirm" | "correct" | "flag" | "merge"
    note: Optional[str] = None
    correction: Optional[dict] = None   # e.g. {"name_he": "...", "description_he": "..."}


# ── GET /api/specialties ───────────────────────────────────────────────────

@router.get("", response_model=list[SpecialtyOut])
def list_specialties(
    search: Optional[str] = None,
    parent_id: Optional[int] = None,
    only_top_level: bool = False,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List specialties. Filter by search, parent_id, or only_top_level. Supports pagination."""
    q = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.is_active == True)

    if search:
        term = f"%{search}%"
        q = q.filter(
            models.MedicalSpecialty.name_en.ilike(term) |
            models.MedicalSpecialty.name_he.ilike(term)
        )
    if parent_id is not None:
        q = q.filter(models.MedicalSpecialty.parent_id == parent_id)
    if only_top_level:
        q = q.filter(models.MedicalSpecialty.parent_id == None)

    return q.order_by(models.MedicalSpecialty.name_en).offset(offset).limit(limit).all()


@router.get("/tree", response_model=list[SpecialtyWithChildren])
def get_tree(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return top-level specialties with their sub_specialties nested."""
    top = (
        db.query(models.MedicalSpecialty)
        .options(subqueryload(models.MedicalSpecialty.sub_specialties))
        .filter(
            models.MedicalSpecialty.parent_id == None,
            models.MedicalSpecialty.is_active == True,
        )
        .order_by(models.MedicalSpecialty.name_en)
        .all()
    )
    return top


# ── GET /api/specialties/insights ─────────────────────────────────────────

@router.get("/insights")
def get_insights(
    flagged_limit: int = 10,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Learning analytics: confidence distribution, most flagged, coverage stats."""
    total = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.is_active == True).count()
    verified = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.is_verified == True).count()
    with_hebrew = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.name_he != None).count()

    # Confidence distribution
    high_conf   = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.confidence_score >= 0.8).count()
    medium_conf = db.query(models.MedicalSpecialty).filter(
        models.MedicalSpecialty.confidence_score >= 0.5,
        models.MedicalSpecialty.confidence_score < 0.8
    ).count()
    low_conf    = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.confidence_score < 0.5).count()

    # Most flagged specialties
    flagged = (
        db.query(models.MedicalSpecialtyFeedback, models.MedicalSpecialty)
        .join(models.MedicalSpecialty)
        .filter(models.MedicalSpecialtyFeedback.action == "flag")
        .order_by(models.MedicalSpecialtyFeedback.created_at.desc())
        .limit(flagged_limit)
        .all()
    )

    # Feedback action breakdown
    feedback_counts = (
        db.query(
            models.MedicalSpecialtyFeedback.action,
            func.count(models.MedicalSpecialtyFeedback.id).label("cnt")
        )
        .group_by(models.MedicalSpecialtyFeedback.action)
        .all()
    )

    return {
        "total_specialties": total,
        "verified": verified,
        "with_hebrew_name": with_hebrew,
        "missing_hebrew": total - with_hebrew,
        "confidence": {
            "high": high_conf,
            "medium": medium_conf,
            "low": low_conf,
        },
        "feedback_summary": {r.action: r.cnt for r in feedback_counts},
        "recently_flagged": [
            {
                "specialty_id": sp.id,
                "name_en": sp.name_en,
                "name_he": sp.name_he,
                "note": fb.note,
            }
            for fb, sp in flagged
        ],
    }


# ── GET /api/specialties/{id} ──────────────────────────────────────────────

@router.get("/{specialty_id}", response_model=SpecialtyWithChildren)
def get_specialty(
    specialty_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sp = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.id == specialty_id).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Specialty not found")
    return sp


# ── POST /api/specialties/{id}/feedback ───────────────────────────────────

@router.post("/{specialty_id}/feedback")
def submit_feedback(
    specialty_id: int,
    body: FeedbackIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Learning: manager submits feedback on a specialty record.

    Actions:
      confirm  → confidence_score += 0.05 (max 1.0), is_verified = True
      correct  → apply correction fields to record, confidence stays
      flag     → confidence_score -= 0.1 (min 0.0)
      merge    → just logs the intent (handled manually for now)
    """
    sp = db.query(models.MedicalSpecialty).filter(models.MedicalSpecialty.id == specialty_id).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Specialty not found")

    if body.action not in ("confirm", "correct", "flag", "merge"):
        raise HTTPException(status_code=400, detail="Invalid action")

    # Apply learning delta
    if body.action == "confirm":
        sp.confidence_score = min(1.0, (sp.confidence_score or 0.8) + 0.1)
        sp.is_verified = True
    elif body.action == "flag":
        sp.confidence_score = max(0.0, (sp.confidence_score or 0.8) - 0.1)
        sp.is_verified = False
    elif body.action == "correct" and body.correction:
        allowed_fields = {"name_he", "description_he", "description_en", "name_en"}
        for field, value in body.correction.items():
            if field in allowed_fields and value:
                setattr(sp, field, value)
        # Correction means the record was wrong — reset verification
        sp.is_verified = False
        sp.confidence_score = max(0.0, (sp.confidence_score or 0.8) - 0.05)

    sp.feedback_count = (sp.feedback_count or 0) + 1

    # Log feedback
    fb = models.MedicalSpecialtyFeedback(
        specialty_id=specialty_id,
        user_id=current_user.id,
        action=body.action,
        note=body.note,
        correction=json.dumps(body.correction) if body.correction else None,
    )
    db.add(fb)
    db.commit()

    return {"ok": True, "confidence_score": sp.confidence_score, "feedback_count": sp.feedback_count}


# ── POST /api/specialties/scrape ──────────────────────────────────────────

@router.post("/scrape")
def trigger_scrape(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Trigger a fresh scrape from all sources (runs in background)."""
    if not current_user.is_admin and current_user.role != "manager":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    def _run():
        from database import SessionLocal
        from specialty_scraper import upsert_specialties
        session = SessionLocal()
        try:
            result = upsert_specialties(session)
        except Exception as e:
            import logging
            logging.getLogger("specialties").error("Scrape error: %s", e)
        finally:
            session.close()

    background_tasks.add_task(_run)
    return {"ok": True, "message": "Scrape started in background"}


# ── POST /api/specialties/suggest ─────────────────────────────────────────

# Specific condition → (specialty_he, sub_specialty_he)
_CONDITION_MAP = [
    # Oncology
    (["סרטן שד","שד ממאיר","breast cancer"],                  "אונקולוגיה", "אונקולוגיה שד"),
    (["סרטן ריאה","ריאה ממאירה","lung cancer"],               "אונקולוגיה", "אונקולוגיה ריאתית"),
    (["לוקמיה","leukemia"],                                    "אונקולוגיה", "אונקולוגיה המטולוגית"),
    (["לימפומה","lymphoma"],                                   "אונקולוגיה", "אונקולוגיה המטולוגית"),
    (["מלנומה","melanoma","סרטן עור","skin cancer"],           "עורית",       "אונקולוגיה עורית"),
    (["סרטן מעי","סרטן קולון","colorectal","colon cancer"],   "גסטרואנטרולוגיה", "גסטרואונקולוגיה"),
    (["גליובלסטומה","גידול מוח","brain tumor"],               "נוירולוגיה",  "נוירואונקולוגיה"),
    (["סרטן רחם","סרטן שחלה","סרטן צוואר רחם",
      "ovarian cancer","cervical cancer","endometrial"],       "גינקולוגיה", "אונקולוגיה גינקולוגית"),
    (["סרטן ערמונית","prostate cancer"],                       "אורולוגיה",  "אורולוגיה אונקולוגית"),
    # Neurology
    (["שבץ","אירוע מוחי","stroke","cva","tia"],                "נוירולוגיה",  "נוירולוגיה וסקולרית"),
    (["פרקינסון","parkinson"],                                 "נוירולוגיה",  "הפרעות תנועה"),
    (["אלצהיימר","alzheimer","דמנציה","dementia"],             "נוירולוגיה",  "נוירולוגיה קוגניטיבית"),
    (["אפילפסיה","epilepsy","פרכוסים","seizure"],              "נוירולוגיה",  "אפילפסיה"),
    (["טרשת נפוצה","multiple sclerosis"," ms "],               "נוירולוגיה",  "נוירואימונולוגיה"),
    # Cardiology
    (["אוטם שריר הלב","heart attack","infarction","stemi","nstemi","mi "], "קרדיולוגיה", "קרדיולוגיה פולשנית"),
    (["אי ספיקת לב","heart failure","cardiac failure"],        "קרדיולוגיה",  "אי ספיקת לב"),
    (["הפרעות קצב","arrhythmia","פרפור פרוזדורים","atrial fibrillation","afib"], "קרדיולוגיה", "אלקטרופיזיולוגיה"),
    (["מחלת לב מולדת","congenital heart"],                     "קרדיולוגיה",  "קרדיולוגיה מולדת"),
    # Orthopedics
    (["עמוד שדרה","דיסק","disc herniation","herniated disc","spondyl"], "אורתופדיה", "כירורגיית עמוד שדרה"),
    (["שבר ירך","hip fracture"],                               "אורתופדיה",   "כירורגיית ירך וברך"),
    (["החלפת ברך","החלפת ירך","knee replacement","hip replacement"], "אורתופדיה", "ניתוחי מפרקים"),
    # Gastroenterology
    (["שחמת","cirrhosis","הפטיטיס","hepatitis","כבד שומני","fatty liver"], "גסטרואנטרולוגיה", "הפטולוגיה"),
    (["קרוהן","crohn","קוליטיס כיבית","ulcerative colitis","ibd"],        "גסטרואנטרולוגיה", "מחלות מעי דלקתיות"),
    (["פנקראטיטיס","pancreatitis","לבלב"],                    "גסטרואנטרולוגיה", "לבלב ומרה"),
    # Endocrinology
    (["סוכרת סוג 1","סוכרת נעורים","type 1 diabetes","t1dm"],  "אנדוקרינולוגיה", "סוכרת"),
    (["סוכרת סוג 2","type 2 diabetes","t2dm"],                 "אנדוקרינולוגיה", "סוכרת"),
    (["בלוטת התריס","תירואיד","thyroid","hashimoto","graves"],  "אנדוקרינולוגיה", "בלוטת התריס"),
    (["אוסטיאופורוזיס","osteoporosis"],                        "אנדוקרינולוגיה", "מטבוליזם עצם"),
    # Pulmonology
    (["סי-או-פי-די","copd","אמפיזמה","emphysema","ברונכיטיס כרונית"],    "ריאות", "מחלות חסימתיות"),
    (["אסטמה","asthma","אסטמה סימפונות"],                     "ריאות",       "אסטמה"),
    (["סרקואידוזיס","sarcoidosis","ריאות בינוניות","interstitial lung"], "ריאות", "מחלות ריאה בינוניות"),
    # Psychiatry
    (["דיכאון קשה","major depression","mdd"],                  "פסיכיאטריה",  "פסיכיאטריה מבוגרים"),
    (["ביפולרי","bipolar","מאניה","mania"],                    "פסיכיאטריה",  "הפרעות מצב רוח"),
    (["סכיזופרניה","schizophrenia","פסיכוזה","psychosis"],      "פסיכיאטריה",  "פסיכיאטריה כללית"),
    # Rheumatology
    (["לופוס","lupus","sle"],                                  "ראומטולוגיה", "מחלות אוטואימוניות"),
    (["ארתריטיס ראומטואידי","rheumatoid arthritis","ra "],     "ראומטולוגיה", "דלקת מפרקים שגרונית"),
    (["פיברומיאלגיה","fibromyalgia"],                          "ראומטולוגיה", "פיברומיאלגיה"),
]

# Keyword fallback map: Hebrew/English diagnosis keywords → specialty name_en
_KEYWORD_MAP = [
    # Oncology
    (["סרטן","גידול","אונקול","ממאיר","לוקמיה","לימפומה","מלנומה","מטסטז",
      "cancer","tumor","oncol","leukemia","lymphoma","melanoma","metasta"], "oncology"),
    # Cardiology
    (["לב","קרדיו","עורקים","אוטם","הפרעות קצב","כלילי","אנגינה",
      "heart","cardio","coronary","arrhythmia","angina","myocard"], "cardiology"),
    # Neurology
    (["מוח","עצב","נוירו","שבץ","אפילפסיה","פרקינסון","טרשת","דמנציה","אלצהיימר",
      "brain","neuro","stroke","epilepsy","parkinson","sclerosis","dementia","alzheimer"], "neurology"),
    # Orthopedics
    (["עצם","מפרק","עמוד שדרה","ברך","ירך","שבר","ארתריטיס","אוסטיאו",
      "bone","joint","spine","knee","hip","fracture","arthrit","orthop"], "orthopedics"),
    # Gastroenterology
    (["קיבה","מעי","כבד","לבלב","קרוהן","קוליטיס","גסטרו","כיב",
      "gastro","stomach","intestin","liver","pancreas","crohn","colitis","ulcer"], "gastroenterology"),
    # Pulmonology
    (["ריאה","נשימה","אסטמה","סי-או-פי-די","ריאתי","פנאומוניה","ברונכ",
      "lung","pulmon","asthma","copd","pneumonia","bronch","respir"], "pulmonology"),
    # Endocrinology
    (["סוכרת","בלוטת התריס","הורמון","אנדוקרין","תירואיד","אוסטיאופורוזיס",
      "diabetes","thyroid","hormon","endocrin","osteoporosis"], "endocrinology"),
    # Nephrology
    (["כליה","כליות","דיאליזה","נפרו",
      "kidney","renal","nephro","dialysis"], "nephrology"),
    # Hematology
    (["דם","המטו","אנמיה","טסיות","קרישה",
      "blood","hematol","anaemia","anemia","platelet","coagul"], "hematology"),
    # Psychiatry / Neurology
    (["דיכאון","חרדה","פסיכ","סכיזופרניה","ביפולרי",
      "depress","anxiety","psychi","schizophren","bipolar"], "psychiatry"),
    # Gynecology
    (["גינקו","רחם","שחלה","ערמונית","צוואר רחם",
      "gynec","uterus","ovary","cervix","uterine","endometri"], "gynecology"),
    # Urology
    (["שתן","שלפוחית","ערמונית","ורולו",
      "urol","bladder","prostate","urin"], "urology"),
    # Dermatology
    (["עור","עורית","דרמ","פסוריאזיס","אטופיק",
      "skin","dermat","psoriasis","atopic","eczema"], "dermatology"),
    # Ophthalmology
    (["עיניים","עין","ראייה","גלוקומה","קטרקט","רשתית",
      "eye","ophthalm","vision","glaucoma","cataract","retina"], "ophthalmology"),
    # Rheumatology
    (["ראומ","לופוס","פיברומיאלגיה","גאוט","דלקת מפרקים",
      "rheumat","lupus","fibromyalg","gout","arthrit"], "rheumatology"),
]

class SuggestIn(BaseModel):
    diagnosis: str

@router.post("/suggest")
def suggest_specialty(
    body: SuggestIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Given a free-text diagnosis, return the best matching specialty and sub-specialty."""
    q = body.diagnosis.strip().lower()
    if len(q) < 2:
        return {"specialty": None, "sub_specialty": None}

    # 1. Search DB sub-specialties (leaf nodes)
    sub_matches = (
        db.query(models.MedicalSpecialty)
        .filter(
            models.MedicalSpecialty.is_active == True,
            models.MedicalSpecialty.parent_id != None,
            or_(
                func.lower(models.MedicalSpecialty.name_he).contains(q),
                func.lower(models.MedicalSpecialty.name_en).contains(q),
                func.lower(models.MedicalSpecialty.description_he).contains(q),
            )
        )
        .order_by(models.MedicalSpecialty.confidence_score.desc())
        .limit(3)
        .all()
    )
    if sub_matches:
        sub = sub_matches[0]
        parent = db.get(models.MedicalSpecialty, sub.parent_id)
        return {
            "specialty": parent.name_he or parent.name_en if parent else None,
            "sub_specialty": sub.name_he or sub.name_en,
        }

    # 2. Search DB top-level specialties
    top_matches = (
        db.query(models.MedicalSpecialty)
        .filter(
            models.MedicalSpecialty.is_active == True,
            models.MedicalSpecialty.parent_id == None,
            or_(
                func.lower(models.MedicalSpecialty.name_he).contains(q),
                func.lower(models.MedicalSpecialty.name_en).contains(q),
                func.lower(models.MedicalSpecialty.description_he).contains(q),
            )
        )
        .order_by(models.MedicalSpecialty.confidence_score.desc())
        .first()
    )
    if top_matches:
        return {"specialty": top_matches.name_he or top_matches.name_en, "sub_specialty": None}

    # 3. Specific condition map — returns both specialty + sub_specialty
    for keywords, specialty_he, sub_specialty_he in _CONDITION_MAP:
        if any(kw in q for kw in keywords):
            return {"specialty": specialty_he, "sub_specialty": sub_specialty_he}

    # 4. Generic keyword fallback — specialty only
    for keywords, specialty_en in _KEYWORD_MAP:
        if any(kw in q for kw in keywords):
            sp = db.query(models.MedicalSpecialty).filter(
                models.MedicalSpecialty.is_active == True,
                models.MedicalSpecialty.parent_id == None,
                func.lower(models.MedicalSpecialty.name_en).contains(specialty_en),
            ).first()
            if sp:
                return {"specialty": sp.name_he or sp.name_en, "sub_specialty": None}
            tag = db.query(models.MedicalConditionTag).filter(
                models.MedicalConditionTag.category == specialty_en,
                models.MedicalConditionTag.is_active == True,
            ).first()
            if tag:
                return {"specialty": tag.category_he or tag.category, "sub_specialty": None}

    return {"specialty": None, "sub_specialty": None}

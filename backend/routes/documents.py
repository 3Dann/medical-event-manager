import os
import uuid
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from slowapi import Limiter
from slowapi.util import get_ipaddr
import models
import auth as auth_utils
from field_encrypt import _fernet as _file_fernet
import intake_extractor

limiter = Limiter(key_func=get_ipaddr)

_ENC_PREFIX = b"ENCV1:"


def _encrypt_content(data: bytes) -> bytes:
    if _file_fernet is None:
        return data
    return _ENC_PREFIX + _file_fernet.encrypt(data)


def _decrypt_content(data: bytes) -> bytes:
    if not data.startswith(_ENC_PREFIX):
        return data  # legacy unencrypted file
    if _file_fernet is None:
        return data[len(_ENC_PREFIX):]
    try:
        return _file_fernet.decrypt(data[len(_ENC_PREFIX):])
    except Exception:
        return data

def _cleanup_view_tokens(db: Session):
    db.query(models.DocumentViewToken).filter(
        models.DocumentViewToken.expires_at < datetime.now(timezone.utc)
    ).delete()
    db.commit()

router = APIRouter(prefix="/api/patients", tags=["documents"])

# /data קיים → Railway volume mounted → שמור שם. אחרת → local fallback.
def _resolve_upload_dir():
    if os.environ.get("UPLOAD_DIR"):
        return os.environ["UPLOAD_DIR"]
    if os.path.isdir("/data"):
        return "/data/uploads"
    return os.path.join(os.path.dirname(__file__), "../../uploads")

UPLOAD_DIR = _resolve_upload_dir()
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_TYPES = {
    "application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
MAX_SIZE = 20 * 1024 * 1024  # 20 MB

_ALLOWED_EXTS = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".doc", ".docx", ".xls", ".xlsx"}

# Magic bytes לולידציה של תוכן קובץ (לא רק Content-Type)
_MAGIC = [
    (b'%PDF',       'application/pdf'),
    (b'\xFF\xD8\xFF', 'image/jpeg'),
    (b'\x89PNG',    'image/png'),
    (b'GIF87a',     'image/gif'),
    (b'GIF89a',     'image/gif'),
    (b'RIFF',       'image/webp'),
    (b'PK\x03\x04', None),  # ZIP — docx / xlsx
    (b'\xD0\xCF\x11\xE0', None),  # OLE — doc / xls ישן
]

def _validate_magic(content: bytes) -> bool:
    for magic, _ in _MAGIC:
        if content[:len(magic)] == magic:
            return True
    return False


def _get_patient_or_403(patient_id: int, user, db: Session):
    return auth_utils.get_patient_with_access(patient_id, user, db)


@router.get("/{patient_id}/documents")
def list_documents(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    _get_patient_or_403(patient_id, current_user, db)
    docs = (
        db.query(models.PatientDocument)
        .filter(models.PatientDocument.patient_id == patient_id)
        .order_by(models.PatientDocument.created_at.desc())
        .all()
    )
    return [
        {
            "id": d.id,
            "original_name": d.original_name,
            "file_type": d.file_type,
            "file_size": d.file_size,
            "category": d.category,
            "notes": d.notes,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "uploaded_by_name": d.uploader.full_name if d.uploader else "",
        }
        for d in docs
    ]


@router.post("/{patient_id}/documents")
@limiter.limit("20/minute")
async def upload_document(
    request: Request,
    patient_id: int,
    file: UploadFile = File(...),
    category: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    _get_patient_or_403(patient_id, current_user, db)

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")
    if not file.content_type:
        raise HTTPException(status_code=400, detail="סוג הקובץ חסר — לא ניתן להעלות")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="File type not allowed")
    if not _validate_magic(content):
        raise HTTPException(status_code=415, detail="סוג הקובץ אינו נתמך")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXTS:
        ext = ""
    stored_name = f"{uuid.uuid4().hex}{ext}"
    patient_dir = os.path.join(UPLOAD_DIR, str(patient_id))
    os.makedirs(patient_dir, exist_ok=True)
    file_path = os.path.join(patient_dir, stored_name)

    with open(file_path, "wb") as f:
        f.write(_encrypt_content(content))

    doc = models.PatientDocument(
        patient_id=patient_id,
        uploaded_by=current_user.id,
        filename=stored_name,
        original_name=file.filename or stored_name,
        file_type=file.content_type,
        file_size=len(content),
        category=category,
        notes=notes,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {"id": doc.id, "original_name": doc.original_name, "created_at": doc.created_at.isoformat()}


@router.get("/{patient_id}/documents/{doc_id}/download")
def download_document(
    patient_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    if not auth_utils.has_permission(current_user, "download_docs"):
        raise HTTPException(403, "אין הרשאה להוריד מסמכים")
    _get_patient_or_403(patient_id, current_user, db)
    doc = db.query(models.PatientDocument).filter(
        models.PatientDocument.id == doc_id,
        models.PatientDocument.patient_id == patient_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = os.path.join(UPLOAD_DIR, str(patient_id), doc.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    with open(file_path, "rb") as f:
        raw = f.read()
    content = _decrypt_content(raw)
    return Response(
        content=content,
        media_type=doc.file_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.original_name}"'},
    )


@router.post("/{patient_id}/documents/{doc_id}/view-token")
def create_view_token(
    patient_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    """מייצר view token חד-פעמי עם TTL של 300 שניות לצפייה במסמך."""
    _get_patient_or_403(patient_id, current_user, db)
    doc = db.query(models.PatientDocument).filter(
        models.PatientDocument.id == doc_id,
        models.PatientDocument.patient_id == patient_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404)
    _cleanup_view_tokens(db)
    vt = secrets.token_urlsafe(32)
    db.add(models.DocumentViewToken(
        token=vt,
        patient_id=patient_id,
        doc_id=doc_id,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=300),
        created_by=current_user.id,
    ))
    db.commit()
    return {"view_token": vt}


@router.get("/{patient_id}/documents/{doc_id}/view")
def view_document_inline(
    patient_id: int,
    doc_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """הגשת מסמך inline. מקבל view_token קצר-חיים (300 שניות) במקום JWT."""
    entry = db.query(models.DocumentViewToken).filter(
        models.DocumentViewToken.token == token,
        models.DocumentViewToken.is_used == False,
    ).first()
    if not entry:
        raise HTTPException(status_code=401, detail="קישור לא תקין או פג תוקף")
    expires_at = entry.expires_at.replace(tzinfo=timezone.utc) if entry.expires_at.tzinfo is None else entry.expires_at
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=401, detail="קישור פג תוקף")
    if entry.patient_id != patient_id or entry.doc_id != doc_id:
        raise HTTPException(status_code=403)
    entry.is_used = True
    db.commit()

    doc = db.query(models.PatientDocument).filter(
        models.PatientDocument.id == doc_id,
        models.PatientDocument.patient_id == patient_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = os.path.join(UPLOAD_DIR, str(patient_id), doc.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    with open(file_path, "rb") as f:
        raw = f.read()
    content = _decrypt_content(raw)

    media_type = doc.file_type or "application/octet-stream"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": "inline"},
    )


@router.delete("/{patient_id}/documents/{doc_id}")
def delete_document(
    patient_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.get_current_user),
):
    _get_patient_or_403(patient_id, current_user, db)
    doc = db.query(models.PatientDocument).filter(
        models.PatientDocument.id == doc_id,
        models.PatientDocument.patient_id == patient_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = os.path.join(UPLOAD_DIR, str(patient_id), doc.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    db.delete(doc)
    db.commit()
    return {"ok": True}


@router.post("/{patient_id}/documents/intake-extract")
@limiter.limit("20/minute")
async def intake_extract_document(
    request: Request,
    patient_id: int,
    file: UploadFile = File(...),
    category: str = Form("medical"),   # "medical" | "insurance"
    db: Session = Depends(get_db),
    current_user=Depends(auth_utils.require_manager),
):
    """Upload a document during intake and extract functional assessment data."""
    _get_patient_or_403(patient_id, current_user, db)

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")
    if not file.content_type:
        raise HTTPException(status_code=400, detail="סוג הקובץ חסר")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="File type not allowed")
    if not _validate_magic(content):
        raise HTTPException(status_code=415, detail="סוג הקובץ אינו נתמך")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXTS:
        ext = ""
    stored_name = f"{uuid.uuid4().hex}{ext}"
    patient_dir = os.path.join(UPLOAD_DIR, str(patient_id))
    os.makedirs(patient_dir, exist_ok=True)
    file_path = os.path.join(patient_dir, stored_name)

    with open(file_path, "wb") as f:
        f.write(_encrypt_content(content))

    doc = models.PatientDocument(
        patient_id=patient_id,
        uploaded_by=current_user.id,
        filename=stored_name,
        original_name=file.filename or stored_name,
        file_type=file.content_type,
        file_size=len(content),
        category=category,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Extract text and parse functional data (only for medical docs)
    functional = None
    if category == "medical":
        try:
            text = intake_extractor.extract_text(content, file.content_type or "", file.filename or "")
            if text:
                functional = intake_extractor.parse_functional_data(text)
        except Exception:
            pass  # extraction is best-effort

    return {
        "id":            doc.id,
        "original_name": doc.original_name,
        "file_type":     doc.file_type,
        "file_size":     doc.file_size,
        "category":      category,
        "created_at":    doc.created_at.isoformat(),
        "functional":    functional,
    }

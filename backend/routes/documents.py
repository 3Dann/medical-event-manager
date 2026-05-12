import os
import uuid
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
import models
import auth as auth_utils

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
async def upload_document(
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
    if file.content_type and file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="File type not allowed")
    if not _validate_magic(content):
        raise HTTPException(status_code=415, detail="סוג הקובץ אינו נתמך")

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    patient_dir = os.path.join(UPLOAD_DIR, str(patient_id))
    os.makedirs(patient_dir, exist_ok=True)
    file_path = os.path.join(patient_dir, stored_name)

    with open(file_path, "wb") as f:
        f.write(content)

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

    return FileResponse(
        file_path,
        media_type=doc.file_type or "application/octet-stream",
        filename=doc.original_name,
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
    _cleanup_view_tokens()
    vt = secrets.token_urlsafe(32)
    _VIEW_TOKENS[vt] = (
        datetime.now(timezone.utc) + timedelta(seconds=300),
        patient_id,
        doc_id,
    )
    return {"view_token": vt}


@router.get("/{patient_id}/documents/{doc_id}/view")
def view_document_inline(
    patient_id: int,
    doc_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """הגשת מסמך inline. מקבל view_token קצר-חיים (300 שניות) במקום JWT."""
    _cleanup_view_tokens()
    entry = _VIEW_TOKENS.get(token)
    if not entry:
        raise HTTPException(status_code=401, detail="קישור לא תקין או פג תוקף")
    expires_at, allowed_patient, allowed_doc = entry
    if datetime.now(timezone.utc) > expires_at:
        del _VIEW_TOKENS[token]
        raise HTTPException(status_code=401, detail="קישור פג תוקף")
    if allowed_patient != patient_id or allowed_doc != doc_id:
        raise HTTPException(status_code=403)
    del _VIEW_TOKENS[token]  # one-time use

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
        content = f.read()

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

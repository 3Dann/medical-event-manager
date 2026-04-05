import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/patients", tags=["documents"])

# Storage directory — persistent on Railway via /data volume
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "../../uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_TYPES = {
    "application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
MAX_SIZE = 20 * 1024 * 1024  # 20 MB


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

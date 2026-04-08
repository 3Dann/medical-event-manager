"""
WebAuthn / Passkey routes — platform biometric login (Face ID, Touch ID, Windows Hello)
RP_ID  env: WEBAUTHN_RP_ID    (default: localhost)
Origin env: WEBAUTHN_ORIGIN   (default: http://localhost:5173)
"""
import os
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

import webauthn
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorAttachment,
    ResidentKeyRequirement,
    UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
)
from webauthn.helpers.cose import COSEAlgorithmIdentifier

from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/auth/webauthn", tags=["webauthn"])

RP_ID  = os.getenv("WEBAUTHN_RP_ID",   "localhost")
RP_NAME = "Orly Medical"
ORIGIN = os.getenv("WEBAUTHN_ORIGIN",  "http://localhost:5173")

# ── in-memory challenge store (single-instance Railway deployment) ─────────────
_reg_challenges:  dict[int, bytes] = {}   # user_id  → challenge
_auth_challenges: dict[str, bytes] = {}   # email    → challenge
_anon_challenge:  dict[str, bytes] = {}   # "anon"   → challenge (discoverable login)


# ── helpers ────────────────────────────────────────────────────────────────────

class RegisterCompleteRequest(BaseModel):
    credential: dict
    device_name: str = "מכשיר"


class LoginBeginRequest(BaseModel):
    email: str = ""   # empty = discoverable (resident key) flow


class LoginCompleteRequest(BaseModel):
    credential: dict
    email: str = ""


class DeleteCredentialRequest(BaseModel):
    pass


# ── Registration ───────────────────────────────────────────────────────────────

@router.post("/register/begin")
def register_begin(
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(models.WebAuthnCredential).filter_by(user_id=current_user.id).all()
    exclude = [
        PublicKeyCredentialDescriptor(id=bytes.fromhex(c.credential_id))
        for c in existing
    ]
    options = webauthn.generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_id=str(current_user.id).encode(),
        user_name=current_user.email,
        user_display_name=current_user.full_name,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=exclude,
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )
    _reg_challenges[current_user.id] = options.challenge
    return json.loads(webauthn.options_to_json(options))


@router.post("/register/complete")
def register_complete(
    data: RegisterCompleteRequest,
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    challenge = _reg_challenges.pop(current_user.id, None)
    if not challenge:
        raise HTTPException(400, "אין challenge פעיל — נסה שוב")
    try:
        result = webauthn.verify_registration_response(
            credential=webauthn.helpers.parse_registration_credential_json(
                json.dumps(data.credential)
            ),
            expected_challenge=challenge,
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            require_user_verification=True,
        )
    except Exception as e:
        raise HTTPException(400, f"רישום נכשל: {e}")

    cred = models.WebAuthnCredential(
        user_id=current_user.id,
        credential_id=result.credential_id.hex(),
        public_key=result.credential_public_key.hex(),
        sign_count=result.sign_count,
        device_name=data.device_name,
    )
    db.add(cred)
    db.commit()
    return {"ok": True, "device_name": data.device_name}


# ── Authentication ─────────────────────────────────────────────────────────────

@router.post("/login/begin")
def login_begin(data: LoginBeginRequest, db: Session = Depends(get_db)):
    allow: list[PublicKeyCredentialDescriptor] = []

    if data.email:
        user = db.query(models.User).filter_by(email=data.email).first()
        if user:
            allow = [
                PublicKeyCredentialDescriptor(id=bytes.fromhex(c.credential_id))
                for c in db.query(models.WebAuthnCredential).filter_by(user_id=user.id).all()
            ]

    options = webauthn.generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    key = data.email or "anon"
    _auth_challenges[key] = options.challenge
    return json.loads(webauthn.options_to_json(options))


@router.post("/login/complete")
def login_complete(data: LoginCompleteRequest, db: Session = Depends(get_db)):
    key = data.email or "anon"
    challenge = _auth_challenges.pop(key, None)
    if not challenge:
        raise HTTPException(400, "אין challenge פעיל — נסה שוב")

    parsed = webauthn.helpers.parse_authentication_credential_json(json.dumps(data.credential))

    # Resolve user — from email or from userHandle (discoverable credentials)
    user: models.User | None = None
    if data.email:
        user = db.query(models.User).filter_by(email=data.email).first()
    if not user and parsed.response.user_handle:
        try:
            uid = int(parsed.response.user_handle.decode())
            user = db.query(models.User).filter_by(id=uid).first()
        except Exception:
            pass
    if not user:
        raise HTTPException(401, "משתמש לא נמצא")

    # Find matching stored credential
    cred_id_hex = parsed.raw_id.hex()
    stored = db.query(models.WebAuthnCredential).filter_by(
        user_id=user.id, credential_id=cred_id_hex
    ).first()
    if not stored:
        raise HTTPException(401, "Passkey לא נמצא — ייתכן שנמחק")

    try:
        result = webauthn.verify_authentication_response(
            credential=parsed,
            expected_challenge=challenge,
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            credential_public_key=bytes.fromhex(stored.public_key),
            credential_current_sign_count=stored.sign_count,
            require_user_verification=True,
        )
    except Exception as e:
        raise HTTPException(401, f"אימות נכשל: {e}")

    stored.sign_count = result.new_sign_count
    stored.last_used = datetime.now(timezone.utc)
    db.commit()

    token = auth_utils.create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "full_name": user.full_name,
        "role": user.role,
        "is_admin": user.is_admin,
    }


# ── Manage credentials ─────────────────────────────────────────────────────────

@router.get("/credentials")
def list_credentials(
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    creds = db.query(models.WebAuthnCredential).filter_by(user_id=current_user.id).all()
    return [
        {
            "id": c.id,
            "device_name": c.device_name,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "last_used": c.last_used.isoformat() if c.last_used else None,
        }
        for c in creds
    ]


@router.delete("/credentials/{cred_id}")
def delete_credential(
    cred_id: int,
    current_user: models.User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    cred = db.query(models.WebAuthnCredential).filter_by(
        id=cred_id, user_id=current_user.id
    ).first()
    if not cred:
        raise HTTPException(404, "Passkey לא נמצא")
    db.delete(cred)
    db.commit()
    return {"ok": True}

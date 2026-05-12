"""
Symmetric field-level encryption using Fernet (AES-128-CBC + HMAC-SHA256).
Used for sensitive fields: totp_secret, reset_token, email_2fa_code.

Required env var: FIELD_ENCRYPTION_KEY — generate with:
    python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

If the key is not set, encrypt/decrypt are no-ops (returns plain text).
This allows a gradual rollout without breaking existing deployments.
"""
import os
import logging

logger = logging.getLogger("field_encrypt")

_KEY = os.environ.get("FIELD_ENCRYPTION_KEY", "")
_fernet = None

if _KEY:
    try:
        from cryptography.fernet import Fernet
        _fernet = Fernet(_KEY.encode())
        logger.info("Field encryption: active")
    except Exception as e:
        logger.error("Field encryption: invalid key — %s. Falling back to plaintext.", e)
else:
    logger.warning("Field encryption: FIELD_ENCRYPTION_KEY not set — sensitive fields stored in plaintext")


def encrypt(value: str) -> str:
    if not value or not _fernet:
        return value
    try:
        return "enc:" + _fernet.encrypt(value.encode()).decode()
    except Exception:
        return value


def decrypt(value: str) -> str:
    if not value or not _fernet:
        return value
    if not value.startswith("enc:"):
        return value  # legacy plaintext value
    try:
        return _fernet.decrypt(value[4:].encode()).decode()
    except Exception:
        logger.error("Field decryption failed — returning empty string")
        return ""

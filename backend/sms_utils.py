"""
SMS utility — sends OTP codes via Twilio.
Required env vars:
  TWILIO_ACCOUNT_SID   — Twilio account SID
  TWILIO_AUTH_TOKEN    — Twilio auth token
  TWILIO_PHONE_NUMBER  — Twilio sender number (e.g. +12025551234)
If env vars are missing, falls back to dev-mode (prints code to logs).
"""
import os
import logging

logger = logging.getLogger("sms_utils")

_SID   = os.getenv("TWILIO_ACCOUNT_SID")
_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
_FROM  = os.getenv("TWILIO_PHONE_NUMBER")
_CONFIGURED = bool(_SID and _TOKEN and _FROM)


def send_2fa_sms(phone: str, code: str) -> bool:
    """
    Send a 2FA OTP code via SMS.
    Returns True if sent successfully, False on failure or dev-mode.
    """
    if not _CONFIGURED:
        logger.warning("[DEV] SMS 2FA code sent (phone masked): %s", phone[-4:] if phone else "??")
        return False
    try:
        from twilio.rest import Client
        client = Client(_SID, _TOKEN)
        client.messages.create(
            body=f"קוד האימות שלך ל-Orly Medical: {code}\nתקף ל-10 דקות.",
            from_=_FROM,
            to=phone,
        )
        logger.info("SMS 2FA sent to %s", phone)
        return True
    except Exception as e:
        logger.error("SMS send failed to %s: %s", phone, e)
        return False


def normalize_il_phone(prefix: str, number: str) -> str:
    """Combine Israeli prefix + number into E.164 format (+972...)."""
    # prefix: "050", "052" etc.  number: "1234567"
    prefix = (prefix or "").strip().lstrip("+")
    number = (number or "").strip()
    # Remove leading zero from prefix for E.164
    if prefix.startswith("0"):
        prefix = prefix[1:]
    return f"+972{prefix}{number}"

import os
import logging

logger = logging.getLogger("email_utils")

RESEND_API_KEY = os.getenv("SMTP_PASS", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@ormed.co.il")


def is_email_configured() -> bool:
    return bool(RESEND_API_KEY and RESEND_API_KEY.startswith("re_"))


def send_email(to: str, subject: str, body_html: str) -> bool:
    if not is_email_configured():
        logger.warning("Resend API key not configured — email not sent")
        return False
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({
            "from": EMAIL_FROM,
            "to": [to],
            "subject": subject,
            "html": body_html,
        })
        logger.info(f"Email sent to {to}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


def send_2fa_code(to: str, code: str) -> bool:
    subject = "קוד אימות — מנהל האירוע הרפואי"
    body = f"""
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: #2563eb; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
          <span style="font-size: 24px;">🔐</span>
        </div>
        <h2 style="color: #1e3a5f; margin: 0;">קוד האימות שלך</h2>
      </div>
      <div style="background: white; border-radius: 10px; padding: 24px; text-align: center; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <p style="color: #64748b; font-size: 14px; margin: 0 0 12px;">השתמש בקוד הבא להתחברות:</p>
        <div style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #1e3a5f; background: #eff6ff; padding: 16px; border-radius: 8px;">
          {code}
        </div>
        <p style="color: #94a3b8; font-size: 12px; margin: 12px 0 0;">תוקף הקוד: 10 דקות</p>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">אם לא ביקשת קוד זה, התעלם מהודעה זו.</p>
    </div>
    """
    return send_email(to, subject, body)


def send_reset_code(to: str, code: str) -> bool:
    subject = "איפוס סיסמה — מנהל האירוע הרפואי"
    body = f"""
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #1e3a5f; margin: 0;">איפוס סיסמה</h2>
      </div>
      <div style="background: white; border-radius: 10px; padding: 24px; text-align: center; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <p style="color: #64748b; font-size: 14px; margin: 0 0 12px;">קוד איפוס הסיסמה שלך:</p>
        <div style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #1e3a5f; background: #eff6ff; padding: 16px; border-radius: 8px;">
          {code}
        </div>
        <p style="color: #94a3b8; font-size: 12px; margin: 12px 0 0;">תוקף: שעה אחת</p>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">אם לא ביקשת איפוס סיסמה, התעלם מהודעה זו.</p>
    </div>
    """
    return send_email(to, subject, body)

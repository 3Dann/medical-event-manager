import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

logger = logging.getLogger("email_utils")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", SMTP_USER)


def is_email_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS)


def send_email(to: str, subject: str, body_html: str) -> bool:
    """Send an email. Returns True on success, False on failure."""
    if not is_email_configured():
        logger.warning("SMTP not configured — email not sent")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = EMAIL_FROM
        msg["To"] = to
        msg.attach(MIMEText(body_html, "html", "utf-8"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(EMAIL_FROM, [to], msg.as_string())
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

import re
import asyncio
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("audit")

SECRET_KEY = "medical-event-manager-secret-key-poc-2026"
ALGORITHM = "HS256"

# (method, pattern, action_type, resource_type, resource_id_group)
_ROUTES = [
    ("POST",   r"^/api/auth/login$",                                 "login",             None,        None),
    ("GET",    r"^/api/patients/(\d+)$",                             "view_patient",      "patient",   1),
    ("POST",   r"^/api/patients$",                                   "create_patient",    "patient",   None),
    ("PUT",    r"^/api/patients/(\d+)$",                             "edit_patient",      "patient",   1),
    ("DELETE", r"^/api/patients/(\d+)$",                             "delete_patient",    "patient",   1),
    ("GET",    r"^/api/patients/\d+/documents/(\d+)/download",       "download_document", "document",  1),
    ("POST",   r"^/api/patients/\d+/documents$",                     "upload_document",   "document",  None),
    ("DELETE", r"^/api/patients/\d+/documents/(\d+)$",               "delete_document",   "document",  1),
    ("POST",   r"^/api/patients/\d+/claims$",                        "create_claim",      "claim",     None),
    ("PUT",    r"^/api/patients/\d+/claims/(\d+)$",                  "edit_claim",        "claim",     1),
    ("DELETE", r"^/api/patients/\d+/claims/(\d+)$",                  "delete_claim",      "claim",     1),
    ("POST",   r"^/api/patients/\d+/insurance$",                     "add_insurance",     "insurance", None),
    ("PUT",    r"^/api/admin/users/(\d+)/role$",                     "admin_change_role", "user",      1),
    ("POST",   r"^/api/admin/users/(\d+)/reset$",                    "admin_reset_user",  "user",      1),
    ("POST",   r"^/api/admin/users/(\d+)/delete-data$",              "admin_delete_data", "user",      1),
    ("GET",    r"^/api/admin/activity",                              "view_activity_log", None,        None),
]

COMPILED_ROUTES = [
    (method, re.compile(pattern), action, resource, id_group)
    for method, pattern, action, resource, id_group in _ROUTES
]


def _get_ip(request: Request):
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _decode_user_id(token: str):
    try:
        from jose import jwt
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        return int(sub) if sub else None
    except Exception:
        return None


def _match(method: str, path: str):
    for m, pattern, action, resource, id_group in COMPILED_ROUTES:
        if m != method:
            continue
        hit = pattern.match(path)
        if hit:
            resource_id = None
            if id_group is not None:
                try:
                    resource_id = hit.group(id_group)
                except IndexError:
                    pass
            return action, resource, resource_id
    return None, None, None


def _write_log(user_id, action_type, resource_type, resource_id, ip, user_agent, status_code):
    try:
        from database import SessionLocal
        import models
        db = SessionLocal()
        try:
            user_name = None
            if user_id:
                user = db.query(models.User).filter(models.User.id == user_id).first()
                if user:
                    user_name = user.full_name
            entry = models.UserActivityLog(
                user_id=user_id,
                user_name=user_name,
                action_type=action_type,
                resource_type=resource_type,
                resource_id=resource_id,
                ip_address=ip,
                user_agent=(user_agent or "")[:200],
                status_code=status_code,
            )
            db.add(entry)
            db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning("Audit log write failed: %s", e)


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        action_type, resource_type, resource_id = _match(request.method, request.url.path)
        if action_type is None:
            return response

        user_id = None
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            user_id = _decode_user_id(auth[7:])

        await asyncio.to_thread(
            _write_log,
            user_id, action_type, resource_type, resource_id,
            _get_ip(request), request.headers.get("User-Agent"), response.status_code,
        )

        return response

"""
Daily backup — SQLite → gzip → Cloudflare R2 (S3-compatible).

Required env vars (set in Railway):
  R2_ENDPOINT_URL      https://<account_id>.r2.cloudflarestorage.com
  R2_ACCESS_KEY_ID     R2 API token Access Key ID
  R2_SECRET_ACCESS_KEY R2 API token Secret Access Key
  R2_BUCKET_NAME       bucket name (e.g. orly-medical-backups)

If any of the above is missing, backup is saved locally only (/data/backups/).
Local backups: last 7 kept. Cloud backups: retained by R2 lifecycle policy.
"""
import os
import gzip
import shutil
import sqlite3
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("backup")

DB_PATH = os.getenv(
    "DATABASE_URL",
    "sqlite:////data/medical_event_manager.db" if os.path.isdir("/data")
    else "sqlite:///./medical_event_manager.db"
).replace("sqlite:///", "")

LOCAL_BACKUP_DIR = Path("/data/backups") if os.path.isdir("/data") else Path("./backups")
MAX_LOCAL_BACKUPS = 7


def _db_snapshot(dest_path: str) -> None:
    """Consistent hot-backup using sqlite3.backup() — safe while DB is in use."""
    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(dest_path)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()


def _compress(src: str, dst: str) -> None:
    with open(src, "rb") as f_in, gzip.open(dst, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)


def _upload_to_r2(file_path: str, object_key: str) -> bool:
    endpoint  = os.getenv("R2_ENDPOINT_URL", "")
    key_id    = os.getenv("R2_ACCESS_KEY_ID", "")
    secret    = os.getenv("R2_SECRET_ACCESS_KEY", "")
    bucket    = os.getenv("R2_BUCKET_NAME", "")

    if not all([endpoint, key_id, secret, bucket]):
        return False

    import boto3
    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        region_name="auto",
    )
    s3.upload_file(file_path, bucket, object_key, ExtraArgs={"ServerSideEncryption": "AES256"})
    return True


def _prune_local(backup_dir: Path) -> None:
    files = sorted(backup_dir.glob("*.db.gz"), key=lambda f: f.stat().st_mtime)
    for old in files[:-MAX_LOCAL_BACKUPS]:
        old.unlink()
        logger.info(f"Pruned old local backup: {old.name}")


def run_backup() -> dict:
    stamp     = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    snap_path = f"/tmp/backup_{stamp}.db"
    gz_path   = f"/tmp/backup_{stamp}.db.gz"
    object_key = f"backups/medical_event_manager_{stamp}.db.gz"

    LOCAL_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    local_gz = LOCAL_BACKUP_DIR / f"medical_event_manager_{stamp}.db.gz"

    result = {"timestamp": stamp, "local": False, "cloud": False, "error": None}

    try:
        logger.info(f"Backup started — source: {DB_PATH}")

        _db_snapshot(snap_path)
        _compress(snap_path, gz_path)
        os.unlink(snap_path)

        # Local copy (always)
        shutil.copy2(gz_path, local_gz)
        _prune_local(LOCAL_BACKUP_DIR)
        result["local"] = True
        logger.info(f"Local backup saved: {local_gz}")

        # Cloud upload (if configured)
        uploaded = _upload_to_r2(gz_path, object_key)
        result["cloud"] = uploaded
        if uploaded:
            logger.info(f"Uploaded to R2: {object_key}")
        else:
            logger.warning("R2 env vars not set — skipping cloud upload")

    except Exception:
        logger.exception("Backup failed")
        result["error"] = "See server logs"
    finally:
        for p in [snap_path, gz_path]:
            try:
                os.unlink(p)
            except FileNotFoundError:
                pass

    return result

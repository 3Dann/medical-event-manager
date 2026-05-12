"""
Safe JSON field helpers — validate and normalize before DB storage.
"""
import json
import logging

logger = logging.getLogger("json_field")


def safe_json_dumps(value) -> str:
    """Serialize a Python object to JSON string. Returns '[]' or '{}' on failure."""
    if value is None:
        return None
    if isinstance(value, str):
        # Already a string — validate it parses correctly
        try:
            json.loads(value)
            return value
        except (json.JSONDecodeError, ValueError):
            logger.warning("Invalid JSON string, resetting to null: %.80s", value)
            return None
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError) as e:
        logger.error("JSON serialization failed: %s", e)
        return None


def safe_json_loads(value, default=None):
    """Deserialize a JSON string. Returns default on failure."""
    if not value:
        return default
    try:
        return json.loads(value)
    except (json.JSONDecodeError, ValueError, TypeError):
        logger.warning("Invalid JSON in DB, returning default: %.80s", value)
        return default

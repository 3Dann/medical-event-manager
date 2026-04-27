from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
import json
import asyncio
import os

from database import get_db
import models
import auth as auth_utils

router = APIRouter(prefix="/api/settings", tags=["settings"])

TARGET_LANGS = [
    {"code": "en", "name": "English"},
    {"code": "ar", "name": "Arabic"},
    {"code": "ru", "name": "Russian"},
    {"code": "fr", "name": "French"},
    {"code": "de", "name": "German"},
    {"code": "es", "name": "Spanish"},
    {"code": "it", "name": "Italian"},
    {"code": "pt", "name": "Portuguese"},
    {"code": "am", "name": "Amharic"},
]


def _extract_translatable(content: dict) -> dict:
    return {
        "heroBadge": content.get("heroBadge", ""),
        "heroTitle": content.get("heroTitle", ""),
        "heroSubtitle": content.get("heroSubtitle", ""),
        "stepsTitle": content.get("stepsTitle", ""),
        "featuresTitle": content.get("featuresTitle", ""),
        "ctaTitle": content.get("ctaTitle", ""),
        "ctaSubtitle": content.get("ctaSubtitle", ""),
        "steps": [{"title": s.get("title", ""), "desc": s.get("desc", "")} for s in content.get("steps", [])],
        "features": [{"title": f.get("title", ""), "desc": f.get("desc", ""), "points": f.get("points", [])} for f in content.get("features", [])],
        "stats_labels": [s.get("label", "") for s in content.get("stats", [])],
    }


def _merge_translation(original: dict, translated: dict) -> dict:
    result = dict(original)
    for field in ["heroBadge", "heroTitle", "heroSubtitle", "stepsTitle", "featuresTitle", "ctaTitle", "ctaSubtitle"]:
        val = translated.get(field)
        if val:
            result[field] = val

    orig_steps = original.get("steps", [])
    trans_steps = translated.get("steps", [])
    result["steps"] = [
        {**orig_steps[i], "title": trans_steps[i].get("title", orig_steps[i].get("title", "")), "desc": trans_steps[i].get("desc", orig_steps[i].get("desc", ""))}
        if i < len(trans_steps) else orig_steps[i]
        for i in range(len(orig_steps))
    ]

    orig_features = original.get("features", [])
    trans_features = translated.get("features", [])
    result["features"] = [
        {**orig_features[i], "title": trans_features[i].get("title", orig_features[i].get("title", "")),
         "desc": trans_features[i].get("desc", orig_features[i].get("desc", "")),
         "points": trans_features[i].get("points", orig_features[i].get("points", []))}
        if i < len(trans_features) else orig_features[i]
        for i in range(len(orig_features))
    ]

    orig_stats = original.get("stats", [])
    trans_labels = translated.get("stats_labels", [])
    result["stats"] = [
        {**orig_stats[i], "label": trans_labels[i] if i < len(trans_labels) else orig_stats[i].get("label", "")}
        for i in range(len(orig_stats))
    ]
    return result


async def _translate_one(client, content_json: str, lang_name: str, lang_code: str, original: dict):
    import anthropic
    try:
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            messages=[{"role": "user", "content": (
                f"Translate this JSON from Hebrew to {lang_name}.\n"
                "Return ONLY valid JSON with the exact same structure.\n"
                "Keep ← unchanged. Keep numeric values like \"370+\", \"5\", \"01\" unchanged.\n"
                f"Translate all Hebrew text naturally to {lang_name}.\n\n"
                f"{content_json}"
            )}]
        )
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        translated = json.loads(text.strip())
        return lang_code, _merge_translation(original, translated)
    except Exception:
        return lang_code, original


def _get(db: Session, key: str):
    row = db.query(models.SiteSetting).filter_by(key=key).first()
    return row.value if row else None


def _set(db: Session, key: str, value: str):
    row = db.query(models.SiteSetting).filter_by(key=key).first()
    if row:
        row.value = value
    else:
        db.add(models.SiteSetting(key=key, value=value))
    db.commit()


@router.get("/landing")
def get_landing(db: Session = Depends(get_db)):
    """Public — returns stored landing page overrides (or empty dict if none)."""
    raw = _get(db, "landing_overrides")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


@router.post("/landing/translate")
async def translate_landing(
    request: Request,
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Translate Hebrew landing content to all 9 other languages in parallel using Claude Haiku."""
    from fastapi import HTTPException
    import anthropic
    if current_user.email != "da.tzalik@gmail.com":
        raise HTTPException(status_code=403, detail="גישה מורשית למפתח בלבד")

    data = await request.json()
    he_content = data.get("content", {})
    translatable = _extract_translatable(he_content)
    content_json = json.dumps(translatable, ensure_ascii=False, indent=2)

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY לא מוגדר בשרת")

    client = anthropic.AsyncAnthropic(api_key=api_key)
    tasks = [_translate_one(client, content_json, lang["name"], lang["code"], he_content) for lang in TARGET_LANGS]
    results = await asyncio.gather(*tasks)

    by_lang = {"he": he_content}
    for lang_code, translated_content in results:
        by_lang[lang_code] = translated_content

    return {"by_lang": by_lang}


@router.put("/landing")
async def save_landing(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    """Admin-only — saves landing page overrides to DB."""
    from fastapi import HTTPException
    if current_user.email != "da.tzalik@gmail.com":
        raise HTTPException(status_code=403, detail="גישה מורשית למפתח בלבד")
    data = await request.json()
    _set(db, "landing_overrides", json.dumps(data))
    return {"ok": True}

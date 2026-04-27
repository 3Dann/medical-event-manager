"""
ממיר קבצים לטקסט גולמי — PDF, Excel, Word, CSV
תומך ב-OCR לקבצים סרוקים דרך Claude Vision (עדיף) או macOS Vision Framework
"""
import io
import base64


def parse_document(filename: str, content: bytes) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "pdf":
        return _parse_pdf(content)
    elif ext in ("xlsx", "xls"):
        return _parse_excel(content)
    elif ext in ("docx", "doc"):
        return _parse_word(content)
    elif ext == "csv":
        return content.decode("utf-8", errors="replace")
    elif ext == "txt":
        return content.decode("utf-8", errors="replace")
    else:
        return content.decode("utf-8", errors="replace")


def _is_garbled(text: str) -> bool:
    """בדוק אם הטקסט שחולץ הוא גיבריש (PDF סרוק שחולץ בצורה שגויה)."""
    if len(text) < 50:
        return True
    import re
    hebrew   = len(re.findall(r'[\u05D0-\u05EA\u05F0-\u05F4\uFB1D-\uFB4E]', text))
    cyrillic = len(re.findall(r'[\u0400-\u04FF]', text))
    # ציריליצ בטקסט שאמור להיות עברי = סריקה גרועה
    if cyrillic > 3:
        return True
    latin    = len(re.findall(r'[a-zA-Z]', text))
    digits   = len(re.findall(r'[0-9]', text))
    spaces   = len(re.findall(r'\s', text))
    meaningful = hebrew + latin + digits + spaces
    ratio = meaningful / max(len(text), 1)
    if ratio < 0.6:
        return True
    # טקסט ארוך ללא עברית כמעט = לא פוליסה ישראלית אמיתית
    if len(text) > 300 and hebrew < 15:
        return True
    # יחס גבוה מדי של לטינית לעברית עלול להצביע על PDF עם קידוד שגוי
    if len(text) > 200 and latin > hebrew * 3:
        return True
    return False


def _parse_pdf(content: bytes) -> str:
    # שלב 1: ניסיון חילוץ טקסט + טבלאות
    text = ""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            parts = []
            for page in pdf.pages:
                # נסה לחלץ טבלאות לפני טקסט חופשי
                tables = page.extract_tables() or []
                for table in tables:
                    for row in table:
                        if row:
                            cells = [str(c).strip() for c in row if c and str(c).strip()]
                            if cells:
                                parts.append(" | ".join(cells))
                page_text = page.extract_text() or ""
                if page_text.strip():
                    parts.append(page_text)
            text = "\n".join(parts).strip()
    except ImportError:
        pass
    except Exception:
        pass

    # שלב 2: ניקוי תווי RTL/LTR גלויים וגיבריש נפוץ
    text = _clean_pdf_text(text)

    # שלב 3: אם הטקסט ריק, קצר, או גיבריש — OCR (PDF סרוק)
    if _is_garbled(text):
        ocr_text = _ocr_pdf(content)
        if ocr_text and not ocr_text.startswith("[OCR_"):
            text = _clean_pdf_text(ocr_text)
        elif not text:
            text = ocr_text or ""

    return text


def _clean_pdf_text(text: str) -> str:
    """נקה תווי בקרה RTL/LTR, תווים בלתי-נראים, ורצפים של ניסות."""
    import re
    # הסר תווי בקרה דו-כיווניים (U+200E/F, U+202A-E, U+2066-2069)
    text = re.sub(r'[\u200e\u200f\u202a-\u202e\u2066-\u2069\u200b\ufeff]', '', text)
    # הסר רצפים של 3+ תווים לא-עבריים/לא-לטיניים שנראים כגיבריש (כגון ‎™., ‎ee‏)
    text = re.sub(r'[^\u05D0-\u05EA\u05F0-\u05F4\uFB1D-\uFB4Ea-zA-Z0-9₪%.,;:/()\-\s\n|"\'״׳]', ' ', text)
    # צמצם רווחים מרובים
    text = re.sub(r' {3,}', '  ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


_claude_ocr_disabled = False  # מושבת אוטומטית כשאין קרדיטים


def _ocr_pdf(content: bytes) -> str:
    """OCR לקבצי PDF סרוקים: Claude Vision → Tesseract."""
    # Claude Vision — מקביל לכל העמודים
    global _claude_ocr_disabled
    if not _claude_ocr_disabled:
        claude_text = _claude_vision_ocr(content)
        if claude_text and not claude_text.startswith("[OCR_"):
            print(f"[OCR] Claude Vision: {len(claude_text)} תווים")
            return claude_text
        if claude_text and any(k in claude_text for k in ("credit", "balance", "quota")):
            _claude_ocr_disabled = True

    # Tesseract — fallback מקומי
    return _macos_vision_ocr(content)


def _gpt_vision_ocr(content: bytes) -> str:
    """OCR דרך GPT-4o Vision — איכות גבוהה לעברית."""
    try:
        import fitz, base64
        from app.config import get_settings
        settings = get_settings()
        if not settings.openai_api_key:
            return ""

        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)

        doc = fitz.open(stream=content, filetype="pdf")
        all_text = []

        for i, page in enumerate(doc):
            if i >= 8:  # מקסימום 8 עמודים
                break
            mat = fitz.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_bytes = pix.tobytes("png")
            b64 = base64.b64encode(img_bytes).decode()

            resp = client.chat.completions.create(
                model="gpt-4o",
                max_tokens=2000,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "חלץ את כל הטקסט מהתמונה הזו של פוליסת ביטוח ישראלית. "
                                "שמור על מבנה הטקסט המקורי ככל הניתן. "
                                "החזר רק את הטקסט, ללא הסבר נוסף."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"},
                        },
                    ],
                }],
            )
            page_text = resp.choices[0].message.content.strip()
            if page_text:
                all_text.append(page_text)

        doc.close()
        return "\n\n".join(all_text)

    except Exception as e:
        print(f"[OCR-GPT] שגיאה: {e}")
        return ""


def _render_pdf_pages(content: bytes):
    """המרת עמודי PDF לתמונות PIL ברזולוציה גבוהה."""
    try:
        import fitz
    except ImportError:
        return None, "[OCR_MISSING_PACKAGES: pip install pymupdf]"

    try:
        from PIL import Image, ImageFilter, ImageEnhance
        doc = fitz.open(stream=content, filetype="pdf")
        images = []
        for page in doc:
            # רזולוציה: 3x = ~216 DPI — אופטימלי ל-Tesseract עברי (4x פוגע בטבלאות)
            mat = fitz.Matrix(3.0, 3.0)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            # שיפור תמונה לפני OCR — ניגודיות מתונה יותר לא לפגוע בטבלאות
            img = img.convert("L")                              # גווני אפור
            img = ImageEnhance.Contrast(img).enhance(1.5)      # ניגודיות x1.5 (לא x2)
            img = ImageEnhance.Sharpness(img).enhance(2.0)     # חדות x2
            img = img.convert("RGB")

            images.append(img)
        doc.close()
        return images, None
    except Exception as e:
        return None, f"[OCR_ERROR converting PDF: {e}]"


def _claude_vision_ocr(content: bytes) -> str:
    """OCR דרך Claude Vision API — עמודים במקביל לביצועים מהירים."""
    try:
        from app.config import get_settings
        settings = get_settings()
        if not settings.anthropic_api_key:
            return ""

        import anthropic
        import fitz
        from concurrent.futures import ThreadPoolExecutor, as_completed

        MAX_PAGES = 3
        OCR_PROMPT = (
            "זהו עמוד מפוליסת ביטוח ישראלית. "
            "חלץ את כל הטקסט בדיוק כפי שמופיע, כולל מספרים, תאריכים ומספרי נספח. "
            "שים לב לזיהוי נכון של מונחי ביטוח עבריים: "
            "טיפולים בטכנולוגיות מתקדמות, אבחון רפואי מהיר, כתב שירות, "
            "תרופות שלא בסל, מחלות קשות, ניתוחים, אשפוז, סיעוד, נכות, "
            "תשריף, נספח, פרמיה, סה\"כ עלות. "
            "החזר טקסט גולמי בלבד ללא הסברים."
        )

        # רנדר כל עמודים לתמונות (מהיר, CPU)
        doc = fitz.open(stream=content, filetype="pdf")
        pages_b64 = []
        for i, page in enumerate(doc):
            if i >= MAX_PAGES:
                break
            mat = fitz.Matrix(3.0, 3.0)  # 3x (~216 DPI) — חיוני לקבצים סרוקים
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_b64 = base64.standard_b64encode(pix.tobytes("png")).decode()
            pages_b64.append((i, img_b64))
        doc.close()

        def _ocr_page(idx_b64):
            idx, img_b64 = idx_b64
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            msg = client.messages.create(
                model="claude-sonnet-4-6",  # Sonnet — דיוק גבוה לעברית סרוקה
                max_tokens=2000,
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": "image/png", "data": img_b64,
                    }},
                    {"type": "text", "text": OCR_PROMPT},
                ]}],
            )
            text = msg.content[0].text.strip()
            print(f"[OCR-Claude] עמוד {idx+1}: {len(text)} תווים")
            return idx, text

        # הרץ כל העמודים במקביל
        results = {}
        with ThreadPoolExecutor(max_workers=min(len(pages_b64), 4)) as ex:
            futures = {ex.submit(_ocr_page, item): item[0] for item in pages_b64}
            for future in as_completed(futures):
                idx, text = future.result()
                results[idx] = text

        parts = [results[i] for i in sorted(results) if results[i]]
        return "\n\n".join(parts)

    except Exception as e:
        print(f"[OCR-Claude] שגיאה: {e}")
        return ""


def _macos_vision_ocr(content: bytes) -> str:
    """OCR דרך macOS Vision Framework — fallback ללא API key."""
    images, err = _render_pdf_pages(content)
    if err:
        return err

    parts = []
    for i, img in enumerate(images):
        page_text = _vision_ocr_image(img)
        print(f"[OCR-Vision] עמוד {i+1}: {len(page_text)} תווים — {page_text[:60]!r}")
        if page_text.startswith("[OCR_"):
            return page_text
        if page_text.strip():
            parts.append(page_text)

    return "\n".join(parts)


def _vision_ocr_image(img) -> str:
    """OCR תמונה בודדת — Tesseract עברית עם מספר ניסיונות PSM."""
    import tempfile, os, subprocess, shutil

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        tmp_path = f.name
        img.save(tmp_path, format="PNG")

    try:
        # ── Tesseract — ניסה PSM 4 ואז PSM 3 (טובים יותר לטבלאות עבריות) ──
        tess = shutil.which("tesseract") or "/usr/local/bin/tesseract"
        if os.path.exists(tess):
            best_text = ""
            best_score = 0
            for psm in ["4", "3", "6"]:
                out_base = tmp_path + f"_out{psm}"
                subprocess.run(
                    [tess, tmp_path, out_base, "-l", "heb+eng", "--psm", psm,
                     "-c", "preserve_interword_spaces=1"],
                    capture_output=True, timeout=30,
                )
                out_file = out_base + ".txt"
                if os.path.exists(out_file):
                    text = open(out_file, encoding="utf-8").read().strip()
                    os.unlink(out_file)
                    # בחר את הגרסה שמצאה הכי הרבה מילות מפתח ביטוחיות
                    import re
                    score = sum(1 for kw in [
                        "ביטוח", "כיסוי", "פוליסה", "תרופ", "ניתוח", "אשפוז",
                        "מחלות", "₪", "000", "פרמיה", "סיעוד", "נכות",
                    ] if kw in text)
                    if score > best_score:
                        best_score = score
                        best_text = text
            if best_text:
                return best_text

        # ── macOS Vision fallback (אנגלית בלבד — לא תומך עברית) ──
        try:
            from ocrmac import ocrmac
            annotations = ocrmac.OCR(tmp_path, recognition_level="accurate").recognize()
            lines = [a[0].strip() for a in annotations if isinstance(a, (list, tuple)) and a[0].strip()]
            if lines:
                return "\n".join(lines)
        except Exception:
            pass

        return "[OCR_NO_TEXT]"

    except Exception as e:
        return f"[OCR_ERROR: {e}]"
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _parse_excel(content: bytes) -> str:
    try:
        import pandas as pd
        dfs = pd.read_excel(io.BytesIO(content), sheet_name=None)
        parts = []
        for sheet_name, df in dfs.items():
            parts.append(f"=== גיליון: {sheet_name} ===")
            parts.append(df.to_string(index=False))
        return "\n".join(parts)
    except ImportError:
        return "[pandas לא מותקן]"
    except Exception as e:
        return f"[שגיאת Excel: {e}]"


def _parse_word(content: bytes) -> str:
    try:
        from docx import Document
        doc = Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        return "[python-docx לא מותקן]"
    except Exception as e:
        return f"[שגיאת Word: {e}]"

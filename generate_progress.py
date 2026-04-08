#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Auto-generate PROGRESS.pdf to Desktop after every commit.
Reads CLAUDE.md for backlog + git log for recent history.
Run manually: python3 generate_progress.py
Triggered automatically via .git/hooks/post-commit
"""
import os
import subprocess
from datetime import datetime
from pdf_builder import build_pdf

DESKTOP   = os.path.expanduser("~/Desktop")
PDF_PATH  = os.path.join(DESKTOP, "PROGRESS.pdf")
TMP_MD    = "_progress_tmp.md"


# ── helpers ───────────────────────────────────────────────────────────────────

def extract_backlog(claude_md: str) -> str:
    lines = claude_md.split("\n")
    in_section = False
    result = []
    for line in lines:
        if "## מה חסר / צעדים הבאים" in line:
            in_section = True
        elif in_section and line.startswith("## ") and "מה חסר" not in line:
            break
        if in_section:
            result.append(line)
    return "\n".join(result)


def git(*args) -> str:
    try:
        r = subprocess.run(["git"] + list(args), capture_output=True, text=True)
        return r.stdout.strip()
    except Exception:
        return ""


def recent_commits(n: int = 20) -> str:
    raw = git("log", "--oneline", f"-{n}", "--no-merges")
    if not raw:
        return "- לא ניתן לקרוא היסטוריית git"
    return "\n".join(f"- {line}" for line in raw.splitlines() if line)


def current_branch() -> str:
    return git("branch", "--show-current") or "main"


def last_commit_msg() -> str:
    return git("log", "-1", "--pretty=%s") or "—"


def commits_total() -> int:
    raw = git("log", "--oneline", "--no-merges")
    return len([l for l in raw.splitlines() if l])


# ── build ─────────────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    claude_path = os.path.join(script_dir, "CLAUDE.md")

    with open(claude_path, "r", encoding="utf-8") as f:
        claude = f.read()

    backlog = extract_backlog(claude)
    commits = recent_commits()
    branch  = current_branch()
    last    = last_commit_msg()
    now     = datetime.now().strftime("%d.%m.%Y | %H:%M")

    # Count backlog items
    todo_lines  = [l for l in backlog.splitlines() if l.strip().startswith("- [ ]")]
    done_lines  = [l for l in backlog.splitlines() if l.strip().startswith("- [x]")]
    todo_count  = len(todo_lines)
    done_count  = len(done_lines)

    md = f"""# Orly Medical — סטטוס פיתוח
## עדכון אוטומטי | {now}

---

## סקירה מהירה

| פרמטר | ערך |
|--------|-----|
| ענף פעיל | {branch} |
| Commit אחרון | {last} |
| משימות פתוחות | {todo_count} |
| משימות שהושלמו | {done_count} |

---

## פעילות אחרונה — 20 Commits אחרונים

{commits}

---

{backlog}

---

*מסמך זה מתעדכן אוטומטית לאחר כל commit — {now}*
"""

    tmp = os.path.join(script_dir, TMP_MD)
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(md)

    if os.path.exists(PDF_PATH):
        os.remove(PDF_PATH)

    build_pdf(
        md_path=tmp,
        pdf_path=PDF_PATH,
        header_text="Orly Medical — סטטוס פיתוח | עדכון אוטומטי",
        title="Orly Medical — סטטוס פיתוח",
        subject="Development Progress — Auto-generated after every commit",
    )

    os.remove(tmp)


if __name__ == "__main__":
    main()

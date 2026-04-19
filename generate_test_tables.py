#!/usr/bin/env python3
import os
from pdf_builder import build_pdf

out = "test_tables.pdf"
if os.path.exists(out):
    os.remove(out)

build_pdf(
    md_path="test_tables.md",
    pdf_path=out,
    header_text="בדיקת טבלאות RTL",
)

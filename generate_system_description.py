#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate SYSTEM_DESCRIPTION.pdf — Orly Medical
Run: python3 generate_system_description.py
"""
import os
from pdf_builder import build_pdf

PDF_PATH = "SYSTEM_DESCRIPTION.pdf"

# Delete old PDF if exists
if os.path.exists(PDF_PATH):
    os.remove(PDF_PATH)
    print(f"🗑️  {PDF_PATH} נמחק")

build_pdf(
    md_path="SYSTEM_DESCRIPTION.md",
    pdf_path=PDF_PATH,
    header_text="Orly Medical — מנהל אירוע רפואי | תיאור מערכת",
    title="Orly Medical — תיאור מערכת",
    subject="System Description — Medical Case Management",
)

#!/usr/bin/env python3
from pdf_builder import build_pdf

build_pdf(
    md_path="SRS.md",
    pdf_path="SRS.pdf",
    header_text="Orly Medical — מנהל אירוע רפואי | מסמך דרישות מערכת",
    title="SRS — Orly Medical",
    subject="Software Requirements Specification",
)

#!/usr/bin/env python3
from pdf_builder import build_pdf

build_pdf(
    md_path="FLOW_ENGINE.md",
    pdf_path="FLOW_ENGINE.pdf",
    header_text="Orly Medical — מנוע זרימת עבודה | תיעוד טכני",
    title="Flow Engine — Orly Medical",
    subject="Flow Engine Technical Documentation",
)

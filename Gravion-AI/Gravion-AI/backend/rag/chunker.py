"""
Section-aware chunker.
Detects numbered/titled sections and attaches section metadata to each chunk.
This lets the retriever boost chunks from relevant sections.
"""
from __future__ import annotations
import re

# Matches: "8. Overall Assessment", "Section 3 — Vibration", "OVERALL ASSESSMENT"
_SECTION_RE = re.compile(
    r"^(?:\d+\.?\s+|section\s+\d+\s*[:\-—]?\s*)?([A-Z][A-Za-z &/\-]{3,60})$",
    re.MULTILINE,
)

# Known section keywords → canonical label used for boosting
_SECTION_KEYWORDS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"overall.{0,10}(assessment|condition|status)", re.I), "overall_assessment"),
    (re.compile(r"findings?.{0,10}(recommendation|summary|conclusion)", re.I), "overall_assessment"),
    (re.compile(r"(satisfactory|flagged|follow.?up).{0,30}(action|item|finding)", re.I), "overall_assessment"),
    (re.compile(r"vibration.{0,15}(analysis|data|measurement)", re.I), "vibration_analysis"),
    (re.compile(r"(recommended|corrective).{0,10}action", re.I), "recommended_actions"),
    (re.compile(r"(operating|inspection).{0,10}(condition|data|finding)", re.I), "operating_condition"),
    (re.compile(r"(bearing|temperature).{0,10}(data|analysis|condition)", re.I), "bearing_data"),
    (re.compile(r"(seal|leakage).{0,10}(data|condition|inspection)", re.I), "seal_data"),
    (re.compile(r"maintenance.{0,10}(work|performed|history)", re.I), "maintenance_work"),
    (re.compile(r"risk.{0,10}(assessment|level|summary)", re.I), "risk_assessment"),
]


def _detect_section(text: str) -> str:
    """Return a canonical section label for the given text block, or empty string."""
    for pattern, label in _SECTION_KEYWORDS:
        if pattern.search(text):
            return label
    return ""


def chunk(pages: list[dict], chunk_size: int = 150, overlap: int = 20) -> list[dict]:
    """
    Splits page text into overlapping word-based chunks.
    Each chunk carries: text, document, page, chunk_index, section.
    """
    chunks = []
    for page in pages:
        text = page["text"]
        words = text.split()
        start = 0
        chunk_index = 0

        while start < len(words):
            end = start + chunk_size
            chunk_text = " ".join(words[start:end])
            section = _detect_section(chunk_text)

            chunks.append({
                "text": chunk_text,
                "document": page["document"],
                "page": page["page"],
                "chunk_index": chunk_index,
                "section": section,
            })
            chunk_index += 1
            start += chunk_size - overlap

    return chunks

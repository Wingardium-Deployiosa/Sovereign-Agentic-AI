"""
Evidence Consistency Checker + Industrial Rule Engine.
Assessment is determined deterministically from evidence rules.
The LLM is only trusted for explanation text, never for the assessment verdict.
"""
from __future__ import annotations
import re

_ALERT_PATTERNS = [
    r"\b(elevated|above.{0,20}(limit|range)|exceed|alert|abnormal|misalign|vibration.{0,30}mm/s)\b",
    r"\b(replace|repair|inspect|attention|recommend|corrective|action required|follow.?up)\b",
    r"\b(critical|failure|failed|fault|emergency|overload)\b",
]

_CRITICAL_PATTERNS = [
    r"\b(critical|emergency|imminent failure|immediate shutdown|catastrophic)\b",
]

# Strong "all-clear" phrases — must be unambiguous, not just "normal range"
_STRONG_OK_PATTERNS = [
    r"\b(no issues? (found|detected|identified)|equipment is (normal|healthy|satisfactory))\b",
    r"\b(no action required|no maintenance required|operating normally with no (concern|issue|fault))\b",
    r"\b(all parameters within (normal|acceptable|specified) (range|limits?))\b",
]


def _matches(text: str, patterns: list[str]) -> bool:
    t = text.lower()
    return any(re.search(p, t) for p in patterns)


def _fmt(v: float) -> str:
    return str(int(v)) if v == int(v) else str(v)


def resolve_explicit_assessment(chunks: list[dict]) -> str | None:
    """
    Search evidence for an explicit overall assessment statement.
    e.g. "Overall Condition: ATTENTION REQUIRED" or "Status: CRITICAL"
    Returns the normalised assessment string, or None if not found.
    """
    for chunk in chunks:
        text = chunk["text"].lower()
        # Direct label match
        m = re.search(
            r"(?:overall\s+)?(?:condition|status|assessment)\s*[:\-]\s*"
            r"(attention required|critical|normal|abnormal|insufficient)",
            text
        )
        if m:
            val = m.group(1).strip().upper()
            if val == "ABNORMAL":
                val = "ATTENTION REQUIRED"
            return val
        # Presence of "attention required" as a two-word verdict phrase
        if re.search(r"\battention\s+required\b", text):
            return "ATTENTION REQUIRED"
        # "satisfactory with items flagged for follow-up" → ATTENTION REQUIRED
        # Must have both "satisfactory" AND explicit follow-up/flagged language
        if re.search(r"satisfactory.{0,60}(flagged|follow.?up)", text):
            return "ATTENTION REQUIRED"
        # "condition was found satisfactory" with no flags → NORMAL
        if re.search(r"(condition|status).{0,20}(satisfactory|normal|acceptable)", text):
            if not re.search(r"(flagged|attention|follow.?up|abnormal|exceeded)", text):
                return "NORMAL"
    return None


def _extract_structured_findings(chunks: list[dict]) -> list[dict]:
    """
    Pull structured findings from evidence text.
    Returns list of {finding, value, reference} dicts.
    """
    findings = []
    seen: set = set()

    for chunk in chunks:
        text = chunk["text"]

        # Range violations: "78°C; normal operating range is 55 - 70°C"
        for m in re.finditer(
            r"(\d+\.?\d*)\s*(\xb0C|mm/s|bar|rpm)"
            r".{0,80}?"
            r"(?:normal|range|limit).{0,30}?"
            r"(\d{2,}\.?\d*)\s*[\u2013\-]\s*(\d{2,}\.?\d*)\s*(\xb0C|mm/s|bar|rpm)",
            text, re.IGNORECASE
        ):
            measured = float(m.group(1))
            unit = m.group(2)
            low = float(m.group(3))
            high = float(m.group(4))
            ref_unit = m.group(5)
            if low >= high or measured <= 0:
                continue
            key = (measured, low, high)
            if key in seen:
                continue
            seen.add(key)
            if measured < low or measured > high:
                label = "above" if measured > high else "below"
                findings.append({
                    "finding": f"Recorded {unit} is {label} the stated normal operating range",
                    "value": f"{_fmt(measured)}{unit}",
                    "reference": f"{_fmt(low)}\u2013{_fmt(high)}{ref_unit}",
                })

        # Limit violations: "5.8 mm/s ... target below 4.5 mm/s"
        for m in re.finditer(
            r"(\d+\.?\d*)\s*(mm/s|\xb0C|bar).{0,120}"
            r"(?:target|below|limit).{0,10}(\d+\.?\d*)\s*(mm/s|\xb0C|bar)",
            text, re.IGNORECASE
        ):
            measured = float(m.group(1))
            unit = m.group(2)
            limit = float(m.group(3))
            key = ("limit", measured, unit, limit)
            if key in seen:
                continue
            seen.add(key)
            if measured > limit:
                findings.append({
                    "finding": f"Measured {unit} value exceeds target limit",
                    "value": f"{_fmt(measured)}{unit}",
                    "reference": f"target < {_fmt(limit)}{unit}",
                })

        # Baseline/limit exceeded: "(4.8 mm/s RMS) exceeded the established baseline of 3.5 mm/s"
        for m in re.finditer(
            r"[\(\[]?(\d+\.?\d*)\s*(mm/s|\xb0C|bar)\s*(?:RMS)?[\)\]]?.{0,60}"
            r"(?:exceeded?|above|over).{0,30}"
            r"(?:baseline|limit|threshold|alert|established)\s+(?:of\s+)?(\d+\.?\d*)\s*(mm/s|\xb0C|bar)",
            text, re.IGNORECASE
        ):
            measured = float(m.group(1))
            unit = m.group(2)
            limit = float(m.group(3))
            key = ("exceeded", measured, unit, limit)
            if key in seen:
                continue
            seen.add(key)
            if measured > limit:
                findings.append({
                    "finding": f"Measured {unit} value exceeds established baseline",
                    "value": f"{_fmt(measured)}{unit} RMS",
                    "reference": f"baseline {_fmt(limit)}{unit} RMS",
                })

        # Action sentences — skip log rows, checklist rows, and header metadata
        for sent in re.split(r"(?<=[.!?])\s+", text):
            sent = sent.strip()
            if len(sent) < 40 or len(sent) > 300:
                continue
            if re.search(r"(Document ID|Revision|Plant|Equipment Tag|Report Date|Operating Hours|Prepared By|Reviewed By|Facility Location)", sent):
                continue
            if re.search(r"\d{2}-[A-Za-z]{3}-\d{4}", sent):  # maintenance log date rows
                continue
            if re.search(r"\b(Pass|Fail|N/A)\b", sent):  # checklist table rows
                continue
            if re.search(
                r"\b(repeat|re-measure|follow.?up|alignment|corrective|inspect|replace|trend|review|recommended|schedule|conduct|cleaning)",
                sent, re.IGNORECASE
            ):
                key = sent[:60]
                if key not in seen:
                    seen.add(key)
                    findings.append({"finding": sent, "value": None, "reference": None})

    return findings[:6]


def determine_assessment(chunks: list[dict]) -> str:
    """
    Deterministic rule engine. Priority:
      1. Explicit document statement (e.g. "Condition: ATTENTION REQUIRED")
      2. CRITICAL language
      3. Numeric threshold violation or alert language
      4. Strong all-clear language
      5. INSUFFICIENT EVIDENCE
    """
    if not chunks:
        return "INSUFFICIENT EVIDENCE"

    # Priority 1: explicit document verdict
    explicit = resolve_explicit_assessment(chunks)
    if explicit:
        return explicit

    evidence_text = " ".join(c["text"] for c in chunks)

    # Priority 2: critical language
    if _matches(evidence_text, _CRITICAL_PATTERNS):
        return "CRITICAL"

    # Priority 3: numeric violation or alert language
    findings = _extract_structured_findings(chunks)
    has_numeric_violation = any(f["value"] is not None for f in findings)
    if has_numeric_violation or _matches(evidence_text, _ALERT_PATTERNS):
        return "ATTENTION REQUIRED"

    # Priority 4: strong all-clear
    if _matches(evidence_text, _STRONG_OK_PATTERNS):
        return "NORMAL"

    return "INSUFFICIENT EVIDENCE"


def _build_evidence_summary(chunks: list[dict]) -> str:
    """Build a bullet-point summary of key evidence values for the correction prompt."""
    findings = _extract_structured_findings(chunks)
    lines = []
    for f in findings[:5]:
        if f["value"] and f["reference"]:
            lines.append(f"- {f['finding']}: {f['value']} (normal: {f['reference']})")
        elif f["value"]:
            lines.append(f"- {f['finding']}: {f['value']}")
        else:
            lines.append(f"- {f['finding']}")
    return "\n".join(lines) if lines else "- Alert/attention indicators present in evidence"


def check(answer: str, assessment: str, chunks: list[dict]) -> dict:
    """
    Checks whether the answer TEXT contradicts the evidence.
    Only fires on strong unambiguous all-clear phrases, not on
    technical uses of 'normal' (e.g. 'normal operating range').
    """
    evidence_text = " ".join(c["text"] for c in chunks)
    evidence_has_alert = _matches(evidence_text, _ALERT_PATTERNS)

    # Only flag if the answer uses strong all-clear language
    answer_claims_ok = _matches(answer, _STRONG_OK_PATTERNS)

    if evidence_has_alert and answer_claims_ok:
        evidence_summary = _build_evidence_summary(chunks)
        return {
            "consistent": False,
            "contradiction": (
                "The answer describes the equipment as normal/healthy but the evidence "
                "contains alert indicators. Correct the answer using these evidence values:\n"
                + evidence_summary
            ),
            "forced_assessment": "ATTENTION REQUIRED",
        }
    return {"consistent": True, "contradiction": None, "forced_assessment": None}


# Split on row-number boundaries: lookahead for "N Word" where N is 1-2 digits
_ROW_SPLIT_RE = re.compile(r'(?<!\d)(?=\d{1,2}\s+[A-Z][a-z])')
_STATUS_ROW_RE = re.compile(
    r'^\d{0,2}\s*(.*?)\s+(Pass|Fail|Attention|N/A)\s*(.*?)$',
    re.IGNORECASE | re.DOTALL,
)


def _is_checklist_chunk(text: str) -> bool:
    return len(re.findall(r'\b(Pass|Fail|Attention|N/A)\b', text, re.I)) >= 2


def extract_checklist_items(chunks: list[dict]) -> list[dict]:
    """
    Parse inspection checklist rows from evidence chunks.
    Handles PDF-extracted text where rows are concatenated on a single line.
    Returns list of {point, status, remark} dicts.
    """
    items: list[dict] = []
    seen: set[str] = set()
    for chunk in chunks:
        text = chunk["text"]
        if not _is_checklist_chunk(text):
            continue
        # Start from the first row-number boundary
        m_first = re.search(r'(?<!\d)\d{1,2}\s+[A-Z][a-z]', text)
        region = text[m_first.start():] if m_first else text
        # Trim maintenance history section
        m_end = re.search(r'\bMaintenance History\b', region, re.I)
        if m_end:
            region = region[:m_end.start()]
        for seg in _ROW_SPLIT_RE.split(region):
            seg = seg.strip()
            if not seg:
                continue
            m = _STATUS_ROW_RE.match(seg)
            if not m:
                continue
            point  = m.group(1).strip().strip(" -")
            status = m.group(2).strip().capitalize()
            remark = m.group(3).strip()
            if len(point) < 5 or re.search(r'\d{2}-[A-Za-z]{3}-\d{4}', point):
                continue
            key = point[:40].lower()
            if key in seen:
                continue
            seen.add(key)
            items.append({"point": point, "status": status, "remark": remark or None})
    return items


def build_grounded_answer(chunks: list[dict]) -> str:
    """
    Build a grounded answer from structured findings.
    Used when the LLM answer is rejected after max retries.
    """
    findings = _extract_structured_findings(chunks)
    explicit = resolve_explicit_assessment(chunks)

    numeric = [f for f in findings if f.get("value")]
    actions = [f for f in findings if not f.get("value")]

    parts = []
    if explicit:
        parts.append(f"The overall condition is {explicit}.")
    if numeric:
        vals = "; ".join(
            f"{f['value']} (normal: {f['reference']})" if f.get("reference") else f["value"]
            for f in numeric[:3]
        )
        parts.append(f"Out-of-range readings: {vals}.")
    if actions:
        acts = "; ".join(f["finding"] for f in actions[:2])
        parts.append(f"Recommended actions: {acts}.")

    if not parts:
        for c in chunks[:2]:
            for s in re.split(r"(?<=[.!?])\s+", c["text"]):
                if len(s.strip()) > 40:
                    parts.append(s.strip())
                    break

    if not parts:
        return "Evidence indicates issues requiring attention. Please review the source documents."

    return " ".join(parts) + " Further inspection is recommended."

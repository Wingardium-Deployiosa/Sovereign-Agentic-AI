"""
VisionCore analyzer — two-step pipeline:
  Step 1: llava-llama3:8b  → plain-text description of the image
  Step 2: qwen2.5:7b       → structured JSON extraction from description
Assessment (NORMAL / ATTENTION / CRITICAL) is always determined by rule engine.
"""
from __future__ import annotations
import re
import json
import base64
import io
import httpx
from PIL import Image
from .schemas import VisionResult, VisualObservation

_GEN_URL    = "http://localhost:11434/api/generate"
_VISION_MODEL = "llava:latest"
_REASON_MODEL = "qwen2.5:7b-instruct-q4_K_M"

_VISION_PROMPT = """You are a strict industrial equipment inspector. Answer ONLY these 5 questions about the image.
Be extremely conservative - only answer YES if you are absolutely certain.

1. Equipment: What type of industrial equipment or component is visible? (e.g. centrifugal pump, gate valve, heat exchanger, pressure vessel, pipeline, motor, compressor, flange, etc. Be specific.)
2. Fluid/liquid: Is there clearly visible pooling liquid, active dripping, or wet stains with defined edges? (yes/no)
3. Cracks: Are there clearly visible cracks, fractures, or broken structural parts? (yes/no)
4. Rust: Is there clearly visible orange/brown rust or pitting on metal surfaces? (yes/no)
5. Surface: Describe the general surface condition in one sentence.

IMPORTANT: Shadows, concrete texture, paint marks, and dry stains are NOT liquid. Answer no if uncertain."""

_REASON_PROMPT = """You are an industrial inspection JSON extractor.
Based on the visual description below, extract structured observations.

RULES:
- "equipment_guess": Extract the equipment type from question 1 of the description. Be specific (e.g. "Centrifugal Pump", "Gate Valve", "Heat Exchanger"). Never return null — if unsure, make a best guess from visible features.
- Only include observations for defects EXPLICITLY mentioned in the description.
- If description says equipment is clean/intact/no defects -> observations: [], all flags false.
- Do NOT add observations not mentioned in the description.
- visible_leak=true ONLY if question 2 answer was yes AND fluid/drips/puddles are explicitly confirmed.
- visible_damage=true ONLY if question 3 answer was yes AND cracks/fractures are explicitly confirmed.
- visible_corrosion=true ONLY if question 4 answer was yes AND rust is explicitly confirmed.
- severity: high=only if a large active leak, complete fracture, or broken-off part is visible. medium=visible crack, confirmed corrosion patch, or moderate defect. low=minor surface issue, small mark, early-stage wear.
- "type" must be exactly ONE word from: corrosion, leakage, damage, discoloration, fouling, other.
- "Wear and tear", paint condition, and labels are NOT defects - do not create observations for them.

Return ONLY valid JSON, no markdown:
{{
  "equipment_guess": "specific equipment name e.g. Centrifugal Pump",
  "observations": [
    {{"type": "corrosion", "severity": "low", "location": "base", "description": "example description"}}
  ],
  "visible_leak": false,
  "visible_damage": false,
  "visible_corrosion": false,
  "raw_description": "1-2 sentence summary"
}}

VISUAL DESCRIPTION:
{description}

JSON:"""


async def _ollama_reachable() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            await c.get("http://localhost:11434/api/tags")
        return True
    except Exception as e:
        print(f"[analyzer] Ollama not reachable: {e}")
        return False


def _to_base64(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


async def _describe(image: Image.Image, model: str) -> str:
    """Step 1: VLM describes the image in plain text."""
    payload = {
        "model": model,
        "prompt": _VISION_PROMPT,
        "images": [_to_base64(image)],
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 300},
    }
    print(f"[analyzer] Sending image to {model}...")
    async with httpx.AsyncClient(timeout=600) as c:
        resp = await c.post(_GEN_URL, json=payload)
        resp.raise_for_status()
    text = resp.json().get("response", "").strip()
    print(f"[analyzer] VLM description: {text[:200]}")
    return text


async def _extract_json(description: str, model: str) -> str:
    """Step 2: Text LLM extracts structured JSON from description."""
    payload = {
        "model": model,
        "prompt": _REASON_PROMPT.format(description=description),
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 500},
    }
    async with httpx.AsyncClient(timeout=300) as c:
        resp = await c.post(_GEN_URL, json=payload)
        resp.raise_for_status()
    raw = resp.json().get("response", "").strip()
    print(f"[analyzer] JSON extraction raw: {raw[:400]}")
    return raw


def _parse(raw: str) -> dict | None:
    cleaned = re.sub(r'```(?:json)?\s*', '', raw).strip()
    m = re.search(r'\{.*\}', cleaned, re.DOTALL)
    if not m:
        print(f"[analyzer] No JSON found in: {raw[:200]}")
        return None
    try:
        data = json.loads(m.group())
        if not isinstance(data.get("observations"), list):
            return None
        return data
    except json.JSONDecodeError as e:
        print(f"[analyzer] JSON parse error: {e}")
        return None


def _rule_based_fallback(image: Image.Image) -> VisionResult:
    import numpy as np
    arr = np.array(image, dtype=float)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    observations: list[VisualObservation] = []

    rust_ratio = ((r > 140) & (g < 120) & (b < 80)).mean()
    if rust_ratio > 0.05:
        sev = "high" if rust_ratio > 0.20 else "medium" if rust_ratio > 0.10 else "low"
        observations.append(VisualObservation(
            type="corrosion", severity=sev, location="visible surface",
            description=f"Reddish-brown discoloration covering ~{rust_ratio*100:.0f}% of visible area",
        ))

    dark_ratio = ((r < 50) & (g < 50) & (b < 50)).mean()
    if dark_ratio > 0.08:
        observations.append(VisualObservation(
            type="fouling", severity="low", location="visible surface",
            description="Dark surface deposits or staining visible",
        ))

    return VisionResult(
        equipment_guess=None,
        observations=observations,
        visible_leak=False,
        visible_damage=False,
        visible_corrosion=any(o.type == "corrosion" for o in observations),
        overall_visual_condition="ATTENTION" if observations else "NORMAL",
        confidence=0.35,
        raw_description="Rule-based analysis (VLM unavailable). Colour heuristics only.",
        fallback_used=True,
    )


_VALID_TYPES = {"corrosion", "leakage", "damage", "discoloration", "fouling", "other"}


def _clean_type(raw: str) -> str:
    t = raw.lower().strip()
    if t in _VALID_TYPES:
        return t
    for word in re.split(r'[|\s,/]+', t):
        if word in _VALID_TYPES:
            return word
    return "other"


def _cap_severity(severity: str, description: str) -> str:
    if severity != "high":
        return severity
    desc_lower = description.lower()
    # Only keep high if description contains truly severe language
    severe_phrases = ["fracture", "broken", "shattered", "collapsed", "burst", "severed", "gushing"]
    if any(p in desc_lower for p in severe_phrases):
        return severity
    # Everything else gets capped at medium
    return "medium"


def _truthy(val) -> bool:
    """Safely coerce LLM flag values — guards against string 'false'/'true'."""
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() == "true"
    return bool(val)


def _determine_condition(has_leak: bool, observations: list) -> str:
    severities = [o.severity for o in observations]
    print(f"[analyzer] condition check — has_leak={has_leak} severities={severities} types={[o.type for o in observations]}")
    if has_leak:
        return "CRITICAL"
    if "high" in severities:
        return "CRITICAL"
    if observations:
        return "ATTENTION"
    return "NORMAL"


_EQUIPMENT_KEYWORDS = [
    "pump", "valve", "compressor", "motor", "turbine", "heat exchanger",
    "pressure vessel", "tank", "pipeline", "pipe", "flange", "boiler",
    "reactor", "separator", "filter", "gauge", "meter", "actuator",
    "coupling", "bearing", "seal", "impeller", "nozzle", "drum",
]

def _extract_equipment_from_description(description: str) -> str:
    """Extract equipment type from raw VLM description as fallback."""
    desc_lower = description.lower()
    for kw in _EQUIPMENT_KEYWORDS:
        if kw in desc_lower:
            # Capitalize properly
            return kw.title()
    # Try to grab the answer to question 1 if present
    m = re.search(r'1\..*?:\s*(.+?)(?:\n|2\.)', description, re.IGNORECASE | re.DOTALL)
    if m:
        answer = m.group(1).strip()[:60]
        if len(answer) > 3:
            return answer
    return "Industrial Equipment"


async def analyze(image: Image.Image, vision_model: str = _VISION_MODEL, reason_model: str = _REASON_MODEL) -> VisionResult:
    if not await _ollama_reachable():
        return _rule_based_fallback(image)

    try:
        description = await _describe(image, vision_model)
        raw_json = await _extract_json(description, reason_model)
        data = _parse(raw_json)
    except Exception as e:
        print(f"[analyzer] Pipeline failed ({type(e).__name__}): {e}")
        return _rule_based_fallback(image)

    if data is None:
        return _rule_based_fallback(image)

    observations = [
        VisualObservation(
            type=_clean_type(o.get("type", "other")),
            severity=_cap_severity(o.get("severity", "low"), o.get("description", "")),
            location=o.get("location", "unknown"),
            description=o.get("description", ""),
        )
        for o in data.get("observations", [])
        if isinstance(o, dict)
    ]

    # Drop low-severity observations that contradict all-false visual flags
    if not any([data.get("visible_leak"), data.get("visible_damage"), data.get("visible_corrosion")]):
        observations = [o for o in observations if o.severity in ("medium", "high")]

    # Derive flags from observations as ground truth (LLM flags can be inconsistent)
    has_leak    = _truthy(data.get("visible_leak", False))
    has_damage  = _truthy(data.get("visible_damage", False)) or any(o.type == "damage" for o in observations)
    has_corr    = _truthy(data.get("visible_corrosion", False)) or any(o.type == "corrosion" for o in observations)

    n_obs = len(observations)
    equipment = data.get("equipment_guess") or _extract_equipment_from_description(description)
    return VisionResult(
        equipment_guess=equipment,
        observations=observations,
        visible_leak=has_leak,
        visible_damage=has_damage,
        visible_corrosion=has_corr,
        overall_visual_condition=_determine_condition(has_leak, observations),
        confidence=round(min(0.55 + n_obs * 0.05, 0.90), 2) if n_obs > 0 else 0.75,
        raw_description=data.get("raw_description", description[:300]),
        fallback_used=False,
    )

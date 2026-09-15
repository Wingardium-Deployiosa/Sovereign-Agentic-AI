"""
Vision result schemas — separate from Pydantic API schemas.
These are plain dataclasses used internally by the vision pipeline.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class VisualObservation:
    type: str                        # corrosion | leakage | damage | discoloration | fouling | other
    severity: str                    # low | medium | high
    location: str                    # e.g. "baseplate", "bearing housing", "seal area"
    description: str                 # factual visual description only — no diagnosis


@dataclass
class VisionResult:
    equipment_guess: Optional[str]   # best-effort equipment identification from image
    observations: list[VisualObservation] = field(default_factory=list)
    visible_leak: bool = False
    visible_damage: bool = False
    visible_corrosion: bool = False
    overall_visual_condition: str = "UNKNOWN"   # NORMAL | ATTENTION | CRITICAL | UNKNOWN
    confidence: float = 0.0
    raw_description: str = ""        # full LLM text output for transparency
    fallback_used: bool = False      # True if rule-based fallback was used instead of VLM

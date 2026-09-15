"""Model setup checker for the Sovereign Voice Assistant.

Reports which local model files are present and which are missing.
Never downloads anything.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from app.config import AppConfig

logger = logging.getLogger(__name__)


@dataclass
class ModelCheck:
    name: str
    expected_path: Path
    present: bool
    detail: str = ""
    required_files: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.present

    def format(self) -> str:
        if self.present:
            return f"[OK] {self.name} -> {self.expected_path} ({self.detail})"
        files = ", ".join(self.required_files) if self.required_files else "(see README)"
        return (
            f"[MISSING] {self.name}: expected at {self.expected_path} "
            f"(files needed: {files})"
        )


def _check_whisper(cfg: AppConfig) -> ModelCheck:
    p = cfg.whisper.model_path
    if not p.exists():
        return ModelCheck(
            name="Whisper",
            expected_path=p,
            present=False,
            required_files=[
                "model.bin",
                "config.json",
                "tokenizer.json",
                "vocabulary.txt",
            ],
        )
    needed = ["model.bin", "config.json", "tokenizer.json"]
    missing = [f for f in needed if not (p / f).exists()]
    if missing:
        return ModelCheck(
            name="Whisper",
            expected_path=p,
            present=False,
            detail=f"missing files: {', '.join(missing)}",
            required_files=needed,
        )
    return ModelCheck(
        name="Whisper",
        expected_path=p,
        present=True,
        detail=f"device={cfg.whisper.device}, compute_type={cfg.whisper.compute_type}",
    )


def _check_silero(cfg: AppConfig) -> ModelCheck:
    p = cfg.vad.model_path or Path("(unset)")
    if cfg.vad.model_path is None:
        return ModelCheck(
            name="Silero VAD",
            expected_path=p,
            present=False,
            required_files=["silero_vad.onnx"],
        )
    onnx = p / "silero_vad.onnx"
    if not onnx.exists():
        return ModelCheck(
            name="Silero VAD",
            expected_path=onnx,
            present=False,
            required_files=["silero_vad.onnx"],
        )
    return ModelCheck(name="Silero VAD", expected_path=onnx, present=True, detail="ONNX")


def _check_piper(cfg: AppConfig) -> ModelCheck:
    p = cfg.piper.model_path or Path("(unset)")
    if cfg.piper.model_path is None:
        return ModelCheck(
            name="Piper TTS",
            expected_path=p,
            present=False,
            required_files=["<voice>.onnx", "<voice>.onnx.json"],
        )
    onnx_files = [
        f
        for f in sorted(p.glob("*.onnx"))
        if not f.name.endswith(".onnx.json")
    ]
    if not onnx_files:
        return ModelCheck(
            name="Piper TTS",
            expected_path=p,
            present=False,
            required_files=["<voice>.onnx", "<voice>.onnx.json"],
        )
    onnx = onnx_files[0]
    cfg_json = onnx.with_suffix(".onnx.json")
    missing = []
    if not cfg_json.exists():
        missing.append(cfg_json.name)
    if missing:
        return ModelCheck(
            name="Piper TTS",
            expected_path=onnx,
            present=False,
            detail=f"missing: {', '.join(missing)}",
            required_files=[onnx.name, cfg_json.name],
        )
    return ModelCheck(
        name="Piper TTS",
        expected_path=onnx,
        present=True,
        detail=f"voice={onnx.stem}, speaker={cfg.piper.speaker}",
    )


def check_all_models(cfg: AppConfig) -> List[ModelCheck]:
    return [_check_whisper(cfg), _check_silero(cfg), _check_piper(cfg)]

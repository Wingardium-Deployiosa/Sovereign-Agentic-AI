from pathlib import Path

import pytest

from app.config import PiperConfig
from app.tts.piper import PiperModelMissingError, TextToSpeech


def test_tts_disabled_does_nothing(tmp_path: Path) -> None:
    cfg = PiperConfig(model_path=tmp_path / "piper", enabled=False)
    tts = TextToSpeech(cfg)
    assert tts.enabled is False
    assert tts.synthesize("hello") is None
    tts.speak("hello")  # must not raise


def test_tts_missing_model_logs_and_returns_none(tmp_path: Path) -> None:
    cfg = PiperConfig(
        model_path=tmp_path / "piper_missing",
        config_path=tmp_path / "piper_missing" / "onnx.json",
        enabled=True,
    )
    tts = TextToSpeech(cfg)
    assert tts.enabled is False
    assert tts.synthesize("hello") is None


def test_tts_empty_text_is_noop(tmp_path: Path) -> None:
    cfg = PiperConfig(model_path=tmp_path / "piper", enabled=True)
    tts = TextToSpeech(cfg)
    assert tts.speak("   ") is None
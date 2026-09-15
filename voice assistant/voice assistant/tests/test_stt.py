from pathlib import Path

import numpy as np
import pytest

from app.stt.whisper import SpeechToText, WhisperModelMissingError
from app.config import WhisperConfig


def _make_config(tmp_path: Path) -> WhisperConfig:
    return WhisperConfig(
        model_path=tmp_path / "whisper",
        device="cpu",
        compute_type="int8",
        language="en",
        beam_size=1,
    )


def test_stt_unavailable_when_model_missing(tmp_path: Path) -> None:
    stt = SpeechToText(_make_config(tmp_path))
    assert stt.is_available is False


def test_stt_raises_when_transcribing_without_model(tmp_path: Path) -> None:
    stt = SpeechToText(_make_config(tmp_path))
    audio = np.zeros(1600, dtype=np.int16)
    with pytest.raises(WhisperModelMissingError):
        stt.transcribe_audio(audio)


def test_stt_transcribe_audio_rejects_non_ndarray(tmp_path: Path) -> None:
    stt = SpeechToText(_make_config(tmp_path))
    with pytest.raises(TypeError):
        stt.transcribe_audio("not-an-array")  # type: ignore[arg-type]
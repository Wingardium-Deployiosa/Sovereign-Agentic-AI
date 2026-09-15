import numpy as np

from app.config import VADConfig
from app.vad.detector import VoiceActivityDetector


def test_vad_stub_returns_true_for_nonempty_audio(tmp_path) -> None:
    config = VADConfig(
        model_path=tmp_path / "silero",
        enabled=True,
        threshold=0.5,
        silence_seconds=0.5,
    )
    vad = VoiceActivityDetector(config)
    assert vad.is_stub is True
    audio = np.zeros(1600, dtype=np.int16)
    assert vad.is_speech(audio, 16000) is True
    assert vad.is_speech(np.zeros((0, 1), dtype=np.int16), 16000) is False


def test_vad_disabled_runs_stub(tmp_path) -> None:
    config = VADConfig(
        model_path=tmp_path / "silero",
        enabled=False,
        threshold=0.5,
        silence_seconds=0.5,
    )
    vad = VoiceActivityDetector(config)
    assert vad.is_stub is True
    assert vad._session is None
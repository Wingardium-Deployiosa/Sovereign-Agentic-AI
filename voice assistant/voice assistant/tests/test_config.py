from pathlib import Path

import pytest

from app.config import AppConfig


def test_from_env_reads_dotenv(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "WHISPER_MODEL_PATH=./models/whisper\n"
        "WHISPER_DEVICE=cpu\n"
        "WHISPER_COMPUTE_TYPE=int8\n"
        "VAD_ENABLED=true\n"
        "VAD_THRESHOLD=0.6\n"
        "VAD_SILENCE_SECONDS=0.8\n"
        "PIPER_MODEL_PATH=./models/piper\n"
        "TTS_ENABLED=false\n"
        "BACKEND_URL=http://127.0.0.1:9000\n"
        "SAMPLE_RATE=16000\n"
        "RECORD_MAX_SECONDS=10\n"
        "SESSION_ID=abc\n"
    )

    cfg = AppConfig.from_env(env_file)

    assert cfg.whisper.device == "cpu"
    assert cfg.whisper.compute_type == "int8"
    assert cfg.vad.threshold == pytest.approx(0.6)
    assert cfg.vad.silence_seconds == pytest.approx(0.8)
    assert cfg.piper.enabled is False
    assert cfg.backend.url == "http://127.0.0.1:9000"
    assert cfg.audio.sample_rate == 16000
    assert cfg.audio.record_max_seconds == pytest.approx(10.0)
    assert cfg.backend.session_id == "abc"


def test_paths_are_resolved_relative_to_cwd(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    cfg = AppConfig.from_env()
    assert cfg.whisper.model_path.is_absolute()
    assert cfg.audio.output_dir.is_absolute()


def test_invalid_integer_raises(tmp_path: Path, monkeypatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("SAMPLE_RATE=notanumber\n")
    with pytest.raises(ValueError):
        AppConfig.from_env(env_file)
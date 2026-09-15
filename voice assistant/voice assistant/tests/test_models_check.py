from pathlib import Path

from app.config import AppConfig
from app.models_check import check_all_models


def test_check_models_reports_missing(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    cfg = AppConfig.from_env()
    cfg.audio.output_dir = tmp_path / "audio"
    cfg.whisper.model_path = tmp_path / "whisper"
    cfg.vad.model_path = tmp_path / "silero"
    cfg.piper.model_path = tmp_path / "piper"
    cfg.audio.ensure_output_dir()
    checks = check_all_models(cfg)
    by_name = {c.name: c for c in checks}
    assert by_name["Whisper"].ok is False
    assert by_name["Silero VAD"].ok is False
    assert by_name["Piper TTS"].ok is False


def test_check_models_reports_present_piper(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    cfg = AppConfig.from_env()
    piper_dir = tmp_path / "piper"
    piper_dir.mkdir()
    (piper_dir / "en_US-test.onnx").write_bytes(b"")
    (piper_dir / "en_US-test.onnx.json").write_text("{}")
    cfg.piper.model_path = piper_dir
    cfg.audio.output_dir = tmp_path / "audio"
    cfg.audio.ensure_output_dir()
    checks = check_all_models(cfg)
    by_name = {c.name: c for c in checks}
    assert by_name["Piper TTS"].ok is True
    assert by_name["Piper TTS"].detail.startswith("voice=")

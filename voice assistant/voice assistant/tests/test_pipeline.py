import httpx
import numpy as np
import pytest
import threading

from app.audio.recorder import AudioRecorder
from app.config import AppConfig
from app.pipeline import VoiceAssistantPipeline


@pytest.fixture
def config(tmp_path, monkeypatch) -> AppConfig:
    monkeypatch.setenv("VAD_ENABLED", "true")
    monkeypatch.setenv("TTS_ENABLED", "false")
    cfg = AppConfig.from_env()
    return cfg


def test_pipeline_text_mode_calls_backend(config: AppConfig) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"response": "ok", "sources": [], "artifacts": []},
        )

    transport = httpx.MockTransport(handler)
    config.backend.url = "http://test"
    pipeline = VoiceAssistantPipeline(config)
    pipeline.backend._client.close()
    pipeline.backend._client = httpx.Client(transport=transport, timeout=5)

    result = pipeline.run_text("hello")
    assert result.transcript == "hello"
    assert result.response == "ok"
    pipeline.close()


def test_pipeline_handles_backend_error(config: AppConfig) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="down")

    transport = httpx.MockTransport(handler)
    config.backend.url = "http://test"
    pipeline = VoiceAssistantPipeline(config)
    pipeline.backend._client.close()
    pipeline.backend._client = httpx.Client(transport=transport, timeout=5)

    result = pipeline.run_text("hello")
    assert result.transcript == "hello"
    assert "Backend error" in result.response
    pipeline.close()


def test_audio_recorder_save_wav(tmp_path, config: AppConfig) -> None:
    config.audio.output_dir = tmp_path / "out"
    config.audio.ensure_output_dir()
    recorder = AudioRecorder(config.audio)
    audio = np.zeros(1600, dtype=np.int16)
    path = recorder.save_wav(audio)
    assert path.exists()
    assert path.stat().st_size > 0


def test_vad_recording_accepts_stop_event(config: AppConfig) -> None:
    pipeline = VoiceAssistantPipeline(config)
    stop_event = threading.Event()
    captured = {}

    def record_until_silence(vad, max_seconds, stop_event=None):
        captured["stop_event"] = stop_event
        return np.zeros((0, config.audio.channels), dtype=np.int16)

    pipeline.recorder.record_until_silence = record_until_silence
    pipeline.vad._stub = False
    assert pipeline.run_once(mode="vad", stop_event=stop_event) is None
    assert captured["stop_event"] is stop_event
    pipeline.close()
"""Configuration loader for the Sovereign Voice Assistant.

Reads settings from environment / .env file. No hard-coded machine paths.
All values used elsewhere in the project should be loaded through this module.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from dotenv import dotenv_values

logger = logging.getLogger(__name__)


def _get_bool(name: str, default: bool = False, get=os.getenv) -> bool:
    raw = get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _get_int(name: str, default: int, get=os.getenv) -> int:
    raw = get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"Invalid integer for {name}: {raw!r}") from exc


def _get_float(name: str, default: float, get=os.getenv) -> float:
    raw = get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"Invalid float for {name}: {raw!r}") from exc


def _get_bool_from(name: str, default: bool, get) -> bool:
    return _get_bool(name, default, get=get)


def _get_int_from(name: str, default: int, get) -> int:
    return _get_int(name, default, get=get)


def _get_float_from(name: str, default: float, get) -> float:
    return _get_float(name, default, get=get)


def _resolve(path_str: str) -> Path:
    p = Path(path_str).expanduser()
    if not p.is_absolute():
        p = (Path.cwd() / p).resolve()
    return p


@dataclass
class WhisperConfig:
    model_path: Path
    device: str = "cpu"
    compute_type: str = "int8"
    language: Optional[str] = "en"
    beam_size: int = 1


@dataclass
class VADConfig:
    model_path: Optional[Path] = None
    enabled: bool = True
    threshold: float = 0.5
    silence_seconds: float = 1.0
    min_speech_seconds: float = 0.25
    max_speech_seconds: float = 30.0


@dataclass
class PiperConfig:
    model_path: Optional[Path] = None
    config_path: Optional[Path] = None
    speaker: int = 0
    length_scale: float = 1.0
    enabled: bool = True


@dataclass
class BackendConfig:
    url: str = "http://127.0.0.1:8000"
    timeout_seconds: float = 60.0
    session_id: str = "session_001"


@dataclass
class AudioConfig:
    sample_rate: int = 16000
    channels: int = 1
    dtype: str = "int16"
    record_max_seconds: float = 30.0
    record_fixed_seconds: float = 5.0
    output_dir: Path = field(default_factory=lambda: Path("audio"))

    def ensure_output_dir(self) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)


@dataclass
class AppConfig:
    whisper: WhisperConfig
    vad: VADConfig
    piper: PiperConfig
    backend: BackendConfig
    audio: AudioConfig
    log_level: str = "INFO"

    @classmethod
    def from_env(cls, env_file: Optional[Path] = None) -> "AppConfig":
        file_values: dict = {}
        if env_file is not None:
            file_values = {k: v for k, v in dotenv_values(env_file).items() if v is not None}
        else:
            try:
                file_values = {
                    k: v
                    for k, v in dotenv_values(".env").items()
                    if v is not None
                }
            except Exception:
                file_values = {}

        def get(name: str, default: Optional[str] = None) -> Optional[str]:
            if name in file_values:
                return file_values[name]
            return os.getenv(name, default)

        whisper = WhisperConfig(
            model_path=_resolve(get("WHISPER_MODEL_PATH", "./models/whisper")),
            device=(get("WHISPER_DEVICE", "cpu") or "cpu").strip().lower(),
            compute_type=(get("WHISPER_COMPUTE_TYPE", "int8") or "int8").strip(),
            language=(get("WHISPER_LANGUAGE", "en") or "en").strip() or None,
            beam_size=_get_int_from("WHISPER_BEAM_SIZE", 1, get),
        )

        vad = VADConfig(
            model_path=_resolve(get("VAD_MODEL_PATH", "./models/silero")),
            enabled=_get_bool_from("VAD_ENABLED", True, get),
            threshold=_get_float_from("VAD_THRESHOLD", 0.5, get),
            silence_seconds=_get_float_from("VAD_SILENCE_SECONDS", 1.0, get),
            min_speech_seconds=_get_float_from("VAD_MIN_SPEECH_SECONDS", 0.25, get),
            max_speech_seconds=_get_float_from("VAD_MAX_SPEECH_SECONDS", 30.0, get),
        )

        piper = PiperConfig(
            model_path=_resolve(get("PIPER_MODEL_PATH", "./models/piper")),
            config_path=(
                _resolve(get("PIPER_CONFIG_PATH", "./models/piper/onnx.json"))
                if get("PIPER_CONFIG_PATH")
                else None
            ),
            speaker=_get_int_from("PIPER_SPEAKER", 0, get),
            length_scale=_get_float_from("PIPER_LENGTH_SCALE", 1.0, get),
            enabled=_get_bool_from("TTS_ENABLED", True, get),
        )
        if piper.config_path is None:
            piper.config_path = piper.model_path / "onnx.json"

        backend = BackendConfig(
            url=(get("BACKEND_URL", "http://127.0.0.1:8000") or "http://127.0.0.1:8000").rstrip("/"),
            timeout_seconds=_get_float_from("BACKEND_TIMEOUT_SECONDS", 60.0, get),
            session_id=get("SESSION_ID", "session_001") or "session_001",
        )

        audio = AudioConfig(
            sample_rate=_get_int_from("SAMPLE_RATE", 16000, get),
            channels=_get_int_from("CHANNELS", 1, get),
            dtype=get("DTYPE", "int16") or "int16",
            record_max_seconds=_get_float_from("RECORD_MAX_SECONDS", 30.0, get),
            record_fixed_seconds=_get_float_from("RECORD_FIXED_SECONDS", 5.0, get),
            output_dir=_resolve(get("AUDIO_OUTPUT_DIR", "./audio")),
        )
        audio.ensure_output_dir()

        log_level = (get("LOG_LEVEL", "INFO") or "INFO").upper()

        return cls(
            whisper=whisper,
            vad=vad,
            piper=piper,
            backend=backend,
            audio=audio,
            log_level=log_level,
        )


def configure_logging(level: str = "INFO") -> None:
    """Apply a basic logging configuration once."""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
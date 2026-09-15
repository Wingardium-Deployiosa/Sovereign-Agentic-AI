"""End-to-end voice assistant pipeline.

Record → VAD → STT → backend → TTS → play.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

from app.audio.recorder import AudioRecorder
from app.assistant.client import AssistantClient, BackendError
from app.config import AppConfig
from app.stt.whisper import SpeechToText, WhisperModelMissingError
from app.tts.piper import TextToSpeech
from app.vad.detector import VoiceActivityDetector

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    transcript: str = ""
    response: str = ""
    audio_path: Optional[Path] = None
    sources: Optional[list] = None
    artifacts: Optional[list] = None


class VoiceAssistantPipeline:
    """Coordinates microphone → STT → backend → TTS."""

    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.recorder = AudioRecorder(config.audio)
        self.vad = VoiceActivityDetector(config.vad)
        self.stt = SpeechToText(config.whisper)
        self.backend = AssistantClient(config.backend)
        self.tts = TextToSpeech(config.piper)

    def run_once(
        self,
        *,
        mode: str = "vad",
        fixed_seconds: Optional[float] = None,
        stop_event: Optional[threading.Event] = None,
    ) -> Optional[PipelineResult]:
        logger.info("[VOICE] Listening...")
        if mode == "fixed":
            audio = self.recorder.record_fixed(fixed_seconds)
        elif mode == "push-to-talk":
            seconds = fixed_seconds or self.config.audio.record_fixed_seconds
            logger.info("[VOICE] Push-to-talk: recording for up to %.1fs", seconds)
            audio = self.recorder.record_fixed(seconds)
        elif mode == "vad":
            if self.vad.is_stub:
                logger.info(
                    "[VAD] No real VAD model; falling back to fixed recording"
                )
                audio = self.recorder.record_fixed(fixed_seconds)
            else:
                logger.info("[VAD] Speech detection active")
                self.vad.reset()
                audio = self.recorder.record_until_silence(
                    self.vad,
                    self.config.audio.record_max_seconds,
                    stop_event=stop_event,
                )
        else:
            raise ValueError(f"Unknown recording mode: {mode}")
        if not self.vad.is_stub:
            logger.info("[VAD] Speech detected")

        if audio.size == 0:
            logger.warning("[VOICE] No audio captured")
            return None

        audio_path = self.recorder.save_wav(audio)
        try:
            text = self._safe_transcribe(audio_path)
        finally:
            try:
                audio_path.unlink(missing_ok=True)
            except Exception:
                pass
        if not text:
            return None

        try:
            data = self.backend.query(text)
        except BackendError as exc:
            logger.error("[BACKEND] %s", exc)
            return PipelineResult(transcript=text, response=str(exc))

        response_text = (data or {}).get("response", "")
        logger.info("[ASSISTANT] %s", response_text)
        logger.info("[TTS] Speaking...")
        self.tts.speak(response_text)
        logger.info("[DONE]")
        return PipelineResult(
            transcript=text,
            response=response_text,
            sources=(data or {}).get("sources", []),
            artifacts=(data or {}).get("artifacts", []),
        )

    def run_text(self, text: str) -> PipelineResult:
        logger.info("[STT] You said: %s", text)
        try:
            data = self.backend.query(text)
        except BackendError as exc:
            logger.error("[BACKEND] %s", exc)
            return PipelineResult(transcript=text, response=str(exc))
        response_text = (data or {}).get("response", "")
        logger.info("[ASSISTANT] %s", response_text)
        logger.info("[TTS] Speaking...")
        self.tts.speak(response_text)
        logger.info("[DONE]")
        return PipelineResult(
            transcript=text,
            response=response_text,
            sources=(data or {}).get("sources", []),
            artifacts=(data or {}).get("artifacts", []),
        )

    def _safe_transcribe(self, path: Path) -> str:
        if not self.stt.is_available:
            logger.warning(
                "[STT] Whisper model not available; using dummy transcript"
            )
            return ""
        try:
            return self.stt.transcribe_file(path)
        except WhisperModelMissingError as exc:
            logger.error("[STT] %s", exc)
            return ""

    def close(self) -> None:
        try:
            self.recorder.cleanup()
        finally:
            self.backend.close()

    def __enter__(self) -> "VoiceAssistantPipeline":
        return self

    def __exit__(self, *exc) -> None:
        self.close()
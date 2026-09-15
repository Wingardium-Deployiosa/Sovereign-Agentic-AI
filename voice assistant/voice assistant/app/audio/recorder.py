"""Microphone audio recording utilities."""

from __future__ import annotations

import logging
import threading
import time
import wave
from pathlib import Path
from typing import Optional

import numpy as np

from app.config import AudioConfig

logger = logging.getLogger(__name__)


class MicrophoneUnavailableError(RuntimeError):
    """Raised when no working microphone input device can be opened."""


class AudioRecorder:
    """Wraps sounddevice.InputStream with a thread-safe recording loop.

    The recorder is intentionally minimal. It does not depend on any
    concrete audio backend library beyond `sounddevice`.
    """

    def __init__(self, config: AudioConfig) -> None:
        self.config = config
        self._stream = None
        self._frames: list[np.ndarray] = []
        self._lock = threading.Lock()
        self._recording = False
        self._overflowed = False

    def _ensure_sounddevice(self):
        try:
            import sounddevice as sd  # type: ignore
        except Exception as exc:  # pragma: no cover - depends on environment
            raise MicrophoneUnavailableError(
                "sounddevice is not available. Install audio dependencies "
                "or run with --text/--demo mode."
            ) from exc
        return sd

    def _callback(self, indata, frames, time_info, status):
        if status:
            self._overflowed = True
            logger.debug("sounddevice status: %s", status)
        with self._lock:
            if self._recording:
                self._frames.append(indata.copy())

    def _open_stream(self):
        sd = self._ensure_sounddevice()
        try:
            self._stream = sd.InputStream(
                samplerate=self.config.sample_rate,
                channels=self.config.channels,
                dtype=self.config.dtype,
                callback=self._callback,
            )
        except Exception as exc:
            raise MicrophoneUnavailableError(
                f"Could not open microphone: {exc}"
            ) from exc

    def start(self) -> None:
        with self._lock:
            self._frames.clear()
            self._overflowed = False
            self._recording = True
        if self._stream is None:
            self._open_stream()
        self._stream.start()
        logger.info("[VOICE] Listening...")

    def stop(self) -> np.ndarray:
        with self._lock:
            self._recording = False
            frames = list(self._frames)
            self._frames.clear()
        try:
            if self._stream is not None:
                self._stream.stop()
                self._stream.close()
        finally:
            self._stream = None
        if not frames:
            return np.zeros((0, self.config.channels), dtype=np.int16)
        audio = np.concatenate(frames, axis=0)
        if audio.dtype != np.int16:
            if np.issubdtype(audio.dtype, np.floating):
                audio = np.clip(audio, -1.0, 1.0)
                audio = (audio * 32767.0).astype(np.int16)
            else:
                audio = audio.astype(np.int16)
        return audio

    def record_fixed(self, seconds: Optional[float] = None) -> np.ndarray:
        """Record for a fixed duration in seconds."""
        seconds = float(seconds if seconds is not None else self.config.record_fixed_seconds)
        self.start()
        time.sleep(seconds)
        return self.stop()

    def record_until_silence(
        self,
        vad,
        max_seconds: Optional[float] = None,
        stop_event: Optional[threading.Event] = None,
    ) -> np.ndarray:
        """Record until VAD signals end of speech or max duration is reached."""
        max_seconds = float(max_seconds or self.config.record_max_seconds)
        self.start()
        try:
            speech_started = False
            silent_chunks = 0
            chunk_seconds = 0.03
            total_chunks = int(max_seconds / chunk_seconds)
            for _ in range(total_chunks):
                if stop_event is not None and stop_event.is_set():
                    break
                time.sleep(chunk_seconds)
                chunk = self._latest_chunk()
                if chunk is None:
                    continue
                is_speech = vad.is_speech(chunk, self.config.sample_rate)
                if is_speech:
                    speech_started = True
                    silent_chunks = 0
                elif speech_started:
                    silent_chunks += 1
                if speech_started and silent_chunks >= int(
                    vad.silence_seconds / chunk_seconds
                ):
                    break
        finally:
            audio = self.stop()
        return audio

    def _latest_chunk(self) -> Optional[np.ndarray]:
        with self._lock:
            if not self._frames:
                return None
            return self._frames[-1]

    def save_wav(self, audio: np.ndarray, path: Optional[Path] = None) -> Path:
        if audio.size == 0:
            raise ValueError("Cannot save empty audio buffer")
        self.config.ensure_output_dir()
        if path is None:
            timestamp = int(time.time() * 1000)
            path = self.config.output_dir / f"recording_{timestamp}.wav"
        path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(self.config.channels)
            wf.setsampwidth(2)
            wf.setframerate(self.config.sample_rate)
            wf.writeframes(audio.tobytes())
        return path

    def cleanup(self) -> None:
        try:
            if self._stream is not None:
                self._stream.stop()
                self._stream.close()
        finally:
            self._stream = None
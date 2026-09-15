"""Faster-Whisper speech-to-text wrapper.

Loads a local CTranslate2 Whisper model. Never downloads anything.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

from app.config import WhisperConfig

logger = logging.getLogger(__name__)


class WhisperModelMissingError(RuntimeError):
    """Raised when the configured Whisper model directory is missing."""


class SpeechToText:
    """Wrapper around the ``faster-whisper`` library."""

    def __init__(self, config: WhisperConfig) -> None:
        self.config = config
        self._model = None
        self._available = False
        self._load_model()

    def _load_model(self) -> None:
        path = self.config.model_path
        if not path.exists():
            logger.warning(
                "[STT] Whisper model directory not found at %s; STT will be "
                "unavailable. Place a faster-whisper model there to enable it.",
                path,
            )
            return
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except Exception as exc:  # pragma: no cover - depends on environment
            logger.warning("[STT] faster-whisper not installed: %s", exc)
            return
        try:
            self._model = WhisperModel(
                str(path),
                device=self.config.device,
                compute_type=self.config.compute_type,
            )
        except Exception as exc:
            logger.warning("[STT] Failed to load model: %s", exc)
            return
        self._available = True
        logger.info(
            "[STT] Loaded Whisper model from %s (device=%s, compute_type=%s)",
            path,
            self.config.device,
            self.config.compute_type,
        )

    @property
    def is_available(self) -> bool:
        return self._available

    def transcribe_file(self, audio_path: Path) -> str:
        if not self._available:
            raise WhisperModelMissingError(
                f"Whisper model not available at {self.config.model_path}"
            )
        logger.info("[STT] Transcribing %s", audio_path)
        segments, info = self._model.transcribe(  # type: ignore[union-attr]
            str(audio_path),
            beam_size=self.config.beam_size,
            language=self.config.language,
            vad_filter=False,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        logger.info("[STT] You said: %s", text)
        return text

    def transcribe_audio(
        self,
        audio: Any,
        sample_rate: int = 16000,
    ) -> str:
        """Transcribe an in-memory numpy audio buffer.

        The buffer is written to a temporary WAV file, then passed to
        ``faster-whisper`` which natively supports WAV paths.
        """
        import numpy as np

        if not isinstance(audio, np.ndarray):
            raise TypeError("audio must be a numpy.ndarray")
        if not self._available:
            raise WhisperModelMissingError(
                f"Whisper model not available at {self.config.model_path}"
            )
        import tempfile
        import scipy.io.wavfile as wavfile  # noqa: F401

        if audio.ndim == 1:
            audio = audio.reshape(-1, 1)
        if audio.dtype != np.int16:
            audio = audio.astype(np.int16)

        with tempfile.NamedTemporaryFile(
            suffix=".wav", delete=False, dir=tempfile.gettempdir()
        ) as tmp:
            tmp_path = Path(tmp.name)
        try:
            wavfile.write(tmp_path, sample_rate, audio)
            return self.transcribe_file(tmp_path)
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:  # pragma: no cover
                pass
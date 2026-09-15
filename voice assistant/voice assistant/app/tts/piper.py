"""Piper TTS wrapper.

Uses local Piper ONNX models only. Never calls any cloud service.
"""

from __future__ import annotations

import logging
import shutil
import tempfile
import wave
from pathlib import Path
from typing import Optional

from app.config import PiperConfig

logger = logging.getLogger(__name__)


class PiperModelMissingError(RuntimeError):
    """Raised when the configured Piper model is missing."""


class TextToSpeech:
    """Local Piper TTS wrapper.

    If the Piper runtime is unavailable or the model is missing, ``speak``
    becomes a no-op and the class returns silently. The voice module can
    therefore always be imported even without a working model.
    """

    def __init__(self, config: PiperConfig) -> None:
        self.config = config
        self._voice = None
        self._enabled = False
        self._available = False
        self._sample_rate = 22050
        self._sample_width = 2
        self._sample_channels = 1
        self._init_voice()

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def is_available(self) -> bool:
        return self._available

    def _init_voice(self) -> None:
        if not self.config.enabled:
            logger.info("[TTS] TTS disabled by configuration")
            return
        model_path = self.config.model_path
        if model_path is None:
            logger.warning("[TTS] No Piper model path configured")
            return
        onnx_file = self._resolve_model_file(model_path)
        if onnx_file is None or not onnx_file.exists():
            logger.warning(
                "[TTS] Piper model not found under %s; TTS disabled", model_path
            )
            return
        config_path = self.config.config_path or onnx_file.with_suffix(".onnx.json")
        try:
            from piper import PiperVoice  # type: ignore
        except Exception as exc:
            logger.warning("[TTS] Piper not installed: %s", exc)
            return
        try:
            self._voice = PiperVoice.load(
                str(onnx_file),
                config_path=(
                    str(config_path) if config_path and config_path.exists() else None
                ),
                use_cuda=False,
            )
        except Exception as exc:
            logger.warning("[TTS] Piper failed to load model: %s", exc)
            return
        try:
            self._sample_rate = int(self._voice.config.sample_rate)
            self._sample_channels = int(self._voice.config.sample_channels)
            self._sample_width = int(self._voice.config.sample_width)
        except Exception:
            pass
        self._enabled = True
        self._available = True
        logger.info(
            "[TTS] Loaded Piper voice from %s (sample_rate=%d, channels=%d)",
            onnx_file,
            self._sample_rate,
            self._sample_channels,
        )

    @staticmethod
    def _resolve_model_file(path: Path) -> Optional[Path]:
        if path.is_file():
            return path
        if path.is_dir():
            for candidate in sorted(path.glob("*.onnx")):
                if not candidate.name.endswith(".onnx.json"):
                    return candidate
        return None

    def _synth_config(self):
        from piper.config import SynthesisConfig  # type: ignore

        return SynthesisConfig(
            speaker_id=self.config.speaker,
            length_scale=self.config.length_scale,
        )

    def synthesize(self, text: str) -> Optional[Path]:
        """Synthesize ``text`` to a temporary WAV file. Returns the path or None."""
        if not self._enabled or not text.strip():
            return None
        out_path = Path(tempfile.gettempdir()) / (
            f"piper_{int(__import__('time').time() * 1000)}.wav"
        )
        try:
            with wave.open(str(out_path), "wb") as wf:
                wf.setnchannels(self._sample_channels)
                wf.setsampwidth(self._sample_width)
                wf.setframerate(self._sample_rate)
                for chunk in self._voice.synthesize(text, self._synth_config()):  # type: ignore[union-attr]
                    wf.writeframes(chunk.audio_int16_bytes)
            return out_path
        except Exception as exc:
            logger.warning("[TTS] Synthesis failed: %s", exc)
            try:
                out_path.unlink(missing_ok=True)
            except Exception:
                pass
            return None

    def speak(self, text: str) -> None:
        """Synthesize then play ``text`` on the default output device."""
        if not self._enabled or not text.strip():
            return
        wav_path = self.synthesize(text)
        if wav_path is None:
            return
        try:
            self._play(wav_path)
        finally:
            try:
                wav_path.unlink(missing_ok=True)
            except Exception:
                pass

    @staticmethod
    def _play(path: Path) -> None:
        try:
            import sounddevice as sd  # type: ignore
            import scipy.io.wavfile as wavfile

            sr, data = wavfile.read(path)
            if hasattr(data, "dtype") and data.dtype != "int16":
                data = data.astype("int16")
            sd.play(data, samplerate=sr)
            sd.wait()
        except Exception as exc:
            logger.warning("[TTS] Audio playback failed: %s", exc)
            if shutil.which("cmd"):
                try:
                    import os

                    os.startfile(str(path))  # type: ignore[attr-defined]
                except Exception:
                    pass

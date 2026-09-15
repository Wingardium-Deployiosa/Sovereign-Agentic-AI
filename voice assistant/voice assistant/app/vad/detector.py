"""Silero VAD wrapper.

Loads the Silero Voice Activity Detection ONNX model from a local path.
Will never download anything from the internet.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np

from app.config import VADConfig

logger = logging.getLogger(__name__)


class VADModelMissingError(RuntimeError):
    """Raised when the configured Silero model cannot be found."""


class VoiceActivityDetector:
    """Wrapper around the Silero VAD ONNX model.

    The implementation supports two modes:

    * Real mode: uses ``onnxruntime`` to load the Silero VAD model from
      ``VADConfig.model_path`` and run inference. The model is never
      downloaded automatically; if it is missing we raise
      :class:`VADModelMissingError`.
    * Stub mode: if no model file is present, ``is_speech`` returns
      ``True`` for any non-empty chunk. This makes the rest of the
      pipeline testable without real model files.
    """

    def __init__(self, config: VADConfig) -> None:
        self.config = config
        self._session = None
        self._stub = True
        self._input_name: Optional[str] = None
        self._sr_name: Optional[str] = None
        self._state_names: list = []
        self._state_shapes: Dict[str, tuple] = {}
        self._output_names: list = []
        self._sample_rate: int = 16000
        self._chunk_size: int = 512  # 32 ms at 16 kHz (silero v4 default)
        self._state: Optional[Dict[str, np.ndarray]] = None
        self.silence_seconds = config.silence_seconds
        self.threshold = config.threshold
        self._session = self._try_load_session()
        self.reset()

    def _try_load_session(self):
        if not self.config.enabled:
            logger.info("[VAD] VAD disabled by configuration")
            return None
        model_path = self.config.model_path
        if model_path is None:
            logger.warning("[VAD] No model path configured; running in stub mode")
            return None
        onnx_file = model_path / "silero_vad.onnx"
        if not onnx_file.exists():
            logger.warning(
                "[VAD] Model file not found at %s; running in stub mode",
                onnx_file,
            )
            return None
        try:
            import onnxruntime as ort  # type: ignore
        except Exception as exc:  # pragma: no cover
            logger.warning(
                "[VAD] onnxruntime unavailable (%s); running in stub mode", exc
            )
            return None
        try:
            session = ort.InferenceSession(
                str(onnx_file),
                providers=["CPUExecutionProvider"],
            )
        except Exception as exc:
            logger.warning("[VAD] Failed to load ONNX model: %s", exc)
            return None

        # Inspect inputs / outputs to map names.
        try:
            inputs = session.get_inputs()
            outputs = session.get_outputs()
        except Exception:
            inputs = []
            outputs = []

        input_names = {i.name.lower(): i.name for i in inputs}
        self._input_name = (
            input_names.get("input")
            or input_names.get("x")
            or (inputs[0].name if inputs else None)
        )
        self._sr_name = next(
            (i.name for i in inputs if "sr" in i.name.lower()),
            None,
        )
        self._state_names = [
            i.name
            for i in inputs
            if i.name != self._input_name and i.name != self._sr_name
        ]
        self._output_names = [o.name for o in outputs]

        # Determine chunk size from input shape (e.g. [seq_len, 512] or [batch, 576]).
        for inp in inputs:
            if inp.name == self._input_name:
                dims = list(inp.shape)
                for d in dims:
                    try:
                        v = int(d)
                        if v > 0:
                            self._chunk_size = v
                    except Exception:
                        continue

        # Record state shapes for proper zero-initialisation.
        for inp in inputs:
            if inp.name in (self._input_name, self._sr_name):
                continue
            shape = []
            for d in inp.shape:
                if isinstance(d, int):
                    shape.append(d)
                elif d is None or d == "?":
                    shape.append(1)
                else:
                    try:
                        shape.append(int(d))
                    except Exception:
                        shape.append(1)
            self._state_shapes[inp.name] = tuple(shape)

        self._stub = False
        logger.info("[VAD] Loaded Silero VAD model from %s", onnx_file)
        return session

    def reset(self) -> None:
        """Reset the recurrent state of the VAD."""
        if self._session is None:
            self._state = None
            return
        state: Dict[str, np.ndarray] = {}
        for name in self._state_names:
            shape = self._state_shapes.get(name) or (1, 1, 128)
            state[name] = np.zeros(shape, dtype=np.float32)
        self._state = state

    @property
    def chunk_size(self) -> int:
        return self._chunk_size

    @property
    def is_stub(self) -> bool:
        return self._stub

    def is_speech(self, audio_chunk: np.ndarray, sample_rate: int) -> bool:
        """Return ``True`` if speech is detected in ``audio_chunk``."""
        if audio_chunk is None or len(audio_chunk) == 0:
            return False
        if self._session is None:
            return True  # stub: assume speech so tests work
        try:
            # Process the chunk in fixed-size windows of `chunk_size` samples.
            prob = 0.0
            n = len(audio_chunk)
            step = self._chunk_size
            for start in range(0, n, step):
                window = audio_chunk[start : start + step]
                if len(window) < step:
                    # pad with zeros if remainder
                    pad = np.zeros(step - len(window), dtype=audio_chunk.dtype)
                    window = np.concatenate([window, pad])
                p = self._infer(window, sample_rate)
                prob = max(prob, p)
            return prob >= self.threshold
        except Exception as exc:  # pragma: no cover - depends on model
            logger.debug("[VAD] inference error: %s", exc)
            return False

    def _infer(self, audio_chunk: np.ndarray, sample_rate: int) -> float:
        if audio_chunk.dtype != np.float32:
            if audio_chunk.dtype == np.int16:
                chunk = audio_chunk.astype(np.float32) / 32768.0
            else:
                chunk = audio_chunk.astype(np.float32)
        else:
            chunk = audio_chunk
        if chunk.ndim > 1:
            chunk = chunk[:, 0]
        # ONNX models vary on input layout: 1D [N], 2D [1, N], 2D [N, 1].
        arr_1d = np.ascontiguousarray(chunk.reshape(-1))
        arr_2d_batch = arr_1d.reshape(1, -1)
        arr_2d_seq = arr_1d.reshape(-1, 1)

        feed: Dict[str, Any] = {}
        for name in self._state_names:
            arr = (self._state or {}).get(name)
            if arr is None:
                shape = self._state_shapes.get(name) or (1, 1, 128)
                arr = np.zeros(shape, dtype=np.float32)
            feed[name] = arr
        if self._sr_name is not None:
            feed[self._sr_name] = np.array(sample_rate, dtype=np.int64)

        # Try a few layouts until the model accepts one.
        last_err: Optional[Exception] = None
        for candidate in (arr_1d, arr_2d_seq, arr_2d_batch):
            feed[self._input_name] = candidate.astype(np.float32)
            try:
                outputs = self._session.run(self._output_names or None, feed)
                break
            except Exception as exc:
                last_err = exc
                continue
        else:
            raise last_err  # type: ignore[misc]

        prob = float(np.asarray(outputs[0]).flatten()[0])
        if self._state is not None and len(outputs) > 1:
            for i, name in enumerate(self._state_names, start=1):
                if i < len(outputs):
                    self._state[name] = np.asarray(outputs[i]).astype(np.float32)
        return prob

# Sovereign Voice Assistant

Standalone, on-premise voice interface for **SIH 2026 PS 26117** —
*Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal
LLMs for Confidential Industrial Work.*

This module owns the **voice layer only**: microphone → VAD →
Faster-Whisper STT → on-premise backend API → Piper TTS → speaker.
It does **not** implement RAG, vector DBs, the main LLM, agent
planner/memory, document parsing, OCR, or report generation. Those
belong to the backend team.

```
Microphone → Silero VAD → Faster-Whisper STT
            → POST /api/v1/assistant/query  (your backend)
            → Piper TTS → Speaker
```

---

## 1. Architecture

```
sovereign-voice/
├── app/
│   ├── audio/recorder.py        # sounddevice recording
│   ├── vad/detector.py          # Silero VAD (local ONNX)
│   ├── stt/whisper.py           # Faster-Whisper STT
│   ├── tts/piper.py             # Piper TTS
│   ├── assistant/client.py      # httpx backend client
│   ├── models_check.py          # --check-models helper
│   ├── pipeline.py              # end-to-end orchestration
│   └── config.py                # .env / dataclass config
├── mock_backend/server.py       # FastAPI mock for local testing
├── tests/                       # pytest, no mic, no GPU, no internet
├── models/
│   ├── whisper/                 # CTranslate2 Whisper model
│   ├── silero/                  # silero_vad.onnx
│   └── piper/                   # <voice>.onnx + <voice>.onnx.json
├── audio/                       # runtime recordings (gitignored)
├── run_voice_assistant.py       # CLI entry point
├── requirements.txt
├── Dockerfile
└── .env.example
```

---

## 2. Installation (Windows PowerShell)

```powershell
# 1. Clone / enter the project folder
cd "C:\Users\HP\Desktop\voice assistant"

# 2. Create and activate a virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 3. Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 4. Copy environment template and edit if needed
copy .env.example .env
```

On Linux/macOS replace the activation line with `source .venv/bin/activate`.

The full list of runtime packages (already in `requirements.txt`):

- `faster-whisper` — local CTranslate2 Whisper inference
- `piper-tts` — local ONNX TTS
- `onnxruntime` — Silero VAD inference
- `sounddevice` — microphone capture and speaker playback
- `scipy` — WAV I/O for TTS
- `numpy` — audio buffers
- `httpx` — backend HTTP client
- `fastapi` + `uvicorn` — mock backend server
- `python-dotenv` — `.env` loading
- `pydantic` — request/response models
- `pytest` — test runner

---

## 3. Local model placement (offline operation)

**The application never downloads models at runtime.** You must place the
files yourself.

| Component   | Folder                  | Required files                                                                                                                              |
|-------------|-------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Whisper STT | `models/whisper/`       | CTranslate2 model: `model.bin`, `config.json`, `tokenizer.json`, `vocabulary.txt`                                                            |
| Silero VAD  | `models/silero/`        | `silero_vad.onnx`                                                                                                                           |
| Piper TTS   | `models/piper/`         | `<voice>.onnx` and matching `<voice>.onnx.json`                                                                                             |

After placement, edit `.env` (or use the defaults) to point to the paths.

### 3a. Whisper (CTranslate2)

Use the **Systran/faster-whisper-*** repos on Hugging Face. They are
CTranslate2-ready out of the box. Place the files directly in
`models/whisper/`:

```text
models/whisper/
├── config.json
├── model.bin
├── tokenizer.json
└── vocabulary.txt
```

A small model such as `Systran/faster-whisper-tiny.en` is recommended
for first-run verification on CPU.

### 3b. Silero VAD

The official Silero VAD ONNX can be obtained from
`snakers4/silero-vad` on Hugging Face. Place it as:

```text
models/silero/
└── silero_vad.onnx
```

### 3c. Piper TTS

Download a Piper voice from `rhasspy/piper-voices` (Hugging Face).
For example `en/en_US/amy/low/` produces `en_US-amy-low.onnx` and
`en_US-amy-low.onnx.json`. Place them flat in `models/piper/`:

```text
models/piper/
├── en_US-amy-low.onnx
└── en_US-amy-low.onnx.json
```

Update `PIPER_MODEL_PATH` / `PIPER_SPEAKER` in `.env` if you pick a
multi-speaker voice.

### CPU vs GPU

* CPU (default): `WHISPER_DEVICE=cpu`, `WHISPER_COMPUTE_TYPE=int8`
* NVIDIA GPU: install CUDA-enabled `onnxruntime` and a CUDA build of
  `faster-whisper`, then set
  `WHISPER_DEVICE=cuda`, `WHISPER_COMPUTE_TYPE=float16`.
* Piper TTS runs on CPU only (`use_cuda=False`).

The code auto-detects and works either way; no GPU is assumed.

---

## 4. Check models

```powershell
python run_voice_assistant.py --check-models
```

Sample output when everything is in place:

```text
[OK] Whisper -> ...\models\whisper (device=cpu, compute_type=int8)
[OK] Silero VAD -> ...\models\silero\silero_vad.onnx (ONNX)
[OK] Piper TTS -> ...\models\piper\en_US-amy-low.onnx (voice=en_US-amy-low, speaker=0)
```

If something is missing, you will see `[MISSING]` with the expected
path and required filenames. Nothing is downloaded.

---

## 5. Run the mock backend

```powershell
python -m uvicorn mock_backend.server:app --host 127.0.0.1 --port 8000
```

Health check:

```powershell
curl http://127.0.0.1:8000/healthz
```

The mock backend returns deterministic demo replies only. **No
external AI is called.**

---

## 6. Run the assistant

```powershell
# Check models first
python run_voice_assistant.py --check-models

# Full microphone pipeline with Silero VAD (auto end on silence)
python run_voice_assistant.py --mode vad

# Push-to-talk: records for a fixed duration (RECORD_FIXED_SECONDS)
python run_voice_assistant.py --mode push-to-talk

# Override duration for push-to-talk
python run_voice_assistant.py --mode push-to-talk --duration 5

# Text-only mode (no microphone, no STT required)
python run_voice_assistant.py --text

# Deterministic demo conversation (no mic, no models, no GPU)
python run_voice_assistant.py --demo

# Process one utterance and exit
python run_voice_assistant.py --once
```

Stage logs look like:

```text
[VOICE] Listening...
[VAD] Speech detection active
[STT] Transcribing recording_xxx.wav
[STT] You said: Summarize the inspection report
[BACKEND] Sending request to http://127.0.0.1:8000/api/v1/assistant/query
[ASSISTANT] The inspection report contains three findings...
[TTS] Speaking...
[DONE]
```

If the Silero model is missing, the pipeline automatically falls back
to a fixed-duration recording so `--mode vad` still works (with a
warning).

---

## 7. API contract for the team backend

The voice module calls exactly one endpoint:

```text
POST {BACKEND_URL}/api/v1/assistant/query
Content-Type: application/json
```

Request body:

```json
{
  "session_id": "session_001",
  "message": "Analyze the inspection report",
  "document_ids": [],
  "source": "voice"
}
```

Response body:

```json
{
  "response": "The inspection report contains three findings.",
  "sources": [],
  "artifacts": []
}
```

* `sources` and `artifacts` are reserved for the backend team and are
  passed through unchanged.
* `source` is always `"voice"` for microphone input. For text mode it
  is still `"voice"` to keep the contract simple.
* Timeouts are configured by `BACKEND_TIMEOUT_SECONDS`.

To integrate: replace `BACKEND_URL` in `.env` with the team's on-premise
backend. No other changes are required.

---

## 8. Tests

```powershell
pytest
```

The test suite runs without microphone, GPU, real models, or
internet access. STT, VAD, TTS, backend client, mock server, the
`--check-models` helper, and the full pipeline are exercised through
mocks and stubs.

---

## 9. Troubleshooting (Windows)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `sounddevice` raises `PortAudioError` | PortAudio DLL missing | `pip install sounddevice` already bundles it on most Python 3.11+ wheels |
| `OSError: [Error 9999]` opening mic | No audio device / wrong default | Run `--text` or `--demo` until a mic is available |
| `[VAD] running in stub mode` | `silero_vad.onnx` missing | Download and place in `models/silero/` |
| `Whisper model directory not found` | CTranslate2 files missing | Download `Systran/faster-whisper-*` and place under `models/whisper/` |
| `Piper model not found` | `<voice>.onnx` missing | Download a Piper voice and place it flat in `models/piper/` |
| `Backend unreachable` | Mock backend not started | `uvicorn mock_backend.server:app --host 127.0.0.1 --port 8000` |
| `onnxruntime` complains about input shape | Silero model expects a different chunk size | The wrapper auto-detects; ensure the ONNX file is the standard Silero VAD |

For confidential industrial deployment:

* Disable network adapters on the host.
* Run the backend and voice module on the same air-gapped machine.
* Use a firewall to block outbound traffic; this module makes none by
  design.

---

## 10. Offline / security guarantees

* No OpenAI, Gemini, Azure Speech, Google Speech, ElevenLabs, or
  Hugging Face Hub downloads at runtime.
* Audio buffers are written under `audio/` and removed after each
  pipeline run.
* No secrets are stored in source. All configuration is loaded from
  `.env` which is git-ignored.
* Default backend URL is `http://127.0.0.1:8000`.
* Production deployment should additionally use network isolation
  (firewall, no default gateway, dedicated VLAN) for true
  air-gapped operation.

---

## 11. Docker

A non-baked Dockerfile is provided for deployment. **Models are not
included in the image.** Mount `models/` and `audio/` as volumes, and
provide your `.env` file.

```powershell
docker build -t sovereign-voice .
docker run --rm -it `
  --network none `
  -v ${PWD}\models:/app/models `
  -v ${PWD}\audio:/app/audio `
  --env-file .env `
  sovereign-voice --demo
```

Direct Windows execution remains the primary development workflow.

---

## 12. Team integration checklist

1. Backend team implements `POST /api/v1/assistant/query` returning
   the documented JSON.
2. Voice team updates `BACKEND_URL` in `.env` to the backend host.
3. Voice team tests text-mode end-to-end first
   (`python run_voice_assistant.py --text`).
4. Then enable microphone + VAD + Whisper + Piper
   (`python run_voice_assistant.py --mode push-to-talk`).
5. Confirm `sources` and `artifacts` flow through unchanged.

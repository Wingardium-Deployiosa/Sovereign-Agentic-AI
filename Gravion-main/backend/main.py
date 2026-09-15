import os
# ── Air-gap enforcement: block all HuggingFace / internet model downloads ──
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_DATASETS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from backend.api.command import router as command_router
from backend.api.documents import router as documents_router
from backend.api.inspection import router as inspection_router
from backend.api.execute import router as execute_router
from backend.api.codegen import router as codegen_router
from backend.api.settings import router as settings_router
from backend.api.telemetry import router as telemetry_router
from backend.api.approvals import router as approvals_router
from backend.api.agents import router as agents_router
from backend.api.voice import router as voice_router
from backend.api.audit import router as audit_router
from backend.core.config import APP_NAME, VERSION

app = FastAPI(title=APP_NAME, version=VERSION)

# ── Restrict CORS to localhost only — no external origins allowed ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=False,
)

app.include_router(command_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(inspection_router, prefix="/api")
app.include_router(execute_router, prefix="/api")
app.include_router(codegen_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(telemetry_router, prefix="/api")
app.include_router(approvals_router, prefix="/api")
app.include_router(agents_router, prefix="/api")
app.include_router(voice_router, prefix="/api")
app.include_router(audit_router, prefix="/api")

@app.get("/")
def serve_ui():
    return FileResponse("frontend/index.html")

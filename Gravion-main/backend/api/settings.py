import json
import os
import shutil
import psutil
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

SETTINGS_FILE = Path(__file__).parent.parent / "data" / "settings.json"
SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)

DEFAULT_SETTINGS = {
    "chunk_size": 512,
    "overlap": 64,
    "top_k": 5,
    "threshold": 0.72,
}


def _load() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text())
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()


class RAGSettings(BaseModel):
    chunk_size: int = 512
    overlap: int = 64
    top_k: int = 5
    threshold: float = 0.72


@router.get("/settings")
def get_settings():
    return _load()


@router.post("/settings")
def save_settings(s: RAGSettings):
    data = s.model_dump()
    SETTINGS_FILE.write_text(json.dumps(data, indent=2))
    return {"status": "saved", **data}


@router.get("/health")
def get_health():
    cpu_pct = psutil.cpu_percent(interval=0.3)
    ram = psutil.virtual_memory()
    _disk_path = os.path.splitdrive(os.getcwd())[0] + os.sep if os.name == 'nt' else "/"
    disk = psutil.disk_usage(_disk_path)

    # Check Ollama process
    ollama_running = any(
        "ollama" in (p.name() or "").lower()
        for p in psutil.process_iter(["name"])
    )

    # Vector store chunk count
    chunks_file = Path(__file__).parent.parent / "data" / "vector_store" / "chunks.json"
    chunk_count = 0
    if chunks_file.exists():
        try:
            chunks = json.loads(chunks_file.read_text())
            chunk_count = len(chunks) if isinstance(chunks, list) else 0
        except Exception:
            pass

    disk_total_gb = round(disk.total / 1024 ** 3, 1)
    disk_used_gb  = round(disk.used  / 1024 ** 3, 1)

    return {
        "cpu": {
            "label": "CPU Usage",
            "value": f"{cpu_pct}%",
            "pct": round(cpu_pct),
            "color": "#22C55E" if cpu_pct < 70 else "#F59E0B" if cpu_pct < 90 else "#EF4444",
        },
        "ram": {
            "label": "RAM",
            "value": f"{round(ram.used/1024**3,1)} / {round(ram.total/1024**3,1)} GB",
            "pct": round(ram.percent),
            "color": "#22C55E" if ram.percent < 70 else "#F59E0B" if ram.percent < 90 else "#EF4444",
        },
        "disk": {
            "label": f"Disk ({_disk_path})",
            "value": f"{disk_used_gb} / {disk_total_gb} GB",
            "pct": round(disk.percent),
            "color": "#22C55E" if disk.percent < 70 else "#F59E0B" if disk.percent < 90 else "#EF4444",
        },
        "vector_store": {
            "label": "Vector Store",
            "value": f"{chunk_count} chunks",
            "pct": min(round(chunk_count / 50 * 100), 100) if chunk_count else 0,
            "color": "#3B82F6",
        },
        "services": {
            "ollama": ollama_running,
            "vector_store": chunks_file.exists(),
            "document_indexer": (Path(__file__).parent.parent / "data" / "uploads").exists(),
        },
    }

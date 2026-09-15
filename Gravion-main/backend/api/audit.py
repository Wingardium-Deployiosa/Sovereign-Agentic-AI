import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Literal
from fastapi import APIRouter

router = APIRouter()
AUDIT_FILE = Path(__file__).parent.parent / "data" / "audit.json"

EventType = Literal["command", "agent", "tool", "approval", "upload", "system"]
StatusType = Literal["ok", "warn", "blocked"]

class AuditLogger:
    @staticmethod
    def _load() -> list[dict]:
        if AUDIT_FILE.exists():
            try:
                return json.loads(AUDIT_FILE.read_text(encoding="utf-8"))
            except Exception:
                pass
        return []

    @staticmethod
    def _save(events: list[dict]):
        AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)
        AUDIT_FILE.write_text(json.dumps(events, indent=2), encoding="utf-8")

    @staticmethod
    def _hash_event(prev_hash: str, ev_data: dict) -> str:
        canonical = json.dumps(ev_data, sort_keys=True)
        raw = f"{prev_hash}{canonical}"
        return hashlib.sha256(raw.encode()).hexdigest()[:8]

    @classmethod
    def log(cls, type: EventType, actor: str, action: str, detail: str, status: StatusType = "ok"):
        events = cls._load()
        prev_hash = events[-1]["hash"] if events else "00000000"
        
        ev_id = f"EVT-{len(events)+1:04d}"
        time_str = datetime.now().strftime("%H:%M:%S")
        
        ev_data = {
            "id": ev_id,
            "time": time_str,
            "type": type,
            "actor": actor,
            "action": action,
            "detail": detail,
            "status": status,
        }
        
        current_hash = cls._hash_event(prev_hash, ev_data)
        ev_data["hash"] = current_hash
        events.append(ev_data)
        cls._save(events)

    @classmethod
    def clear(cls):
        if AUDIT_FILE.exists():
            AUDIT_FILE.write_text("[]", encoding="utf-8")

@router.get("/audit")
def get_audit_events():
    return {"events": AuditLogger._load()}

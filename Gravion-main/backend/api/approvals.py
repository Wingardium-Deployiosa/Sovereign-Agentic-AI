import json
import hashlib
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.api.audit import AuditLogger

router = APIRouter()

APPROVALS_FILE = Path(__file__).parent.parent / "data" / "approvals.json"
APPROVALS_FILE.parent.mkdir(parents=True, exist_ok=True)

INITIAL_ITEMS = [
    {
        "id": "APR-001", "title": "Shutdown Valve V-204 for Maintenance",
        "agent": "Orchestrator", "priority": "critical",
        "description": "VisionCore detected severe corrosion on valve V-204 flange. DocAnalyst cross-referenced with SOP-MNT-07. Recommends immediate isolation and maintenance window scheduling.",
        "evidence": ["Corrosion confidence: 0.91", "SOP-MNT-07 §4.2 triggered", "Last maintenance: 847 days ago", "Pressure rating degraded by est. 18%"],
        "requestedAt": "09:14:22", "status": "pending", "decidedAt": None, "decidedBy": None,
    },
    {
        "id": "APR-002", "title": "Generate Q3 Inspection Report — Board Format",
        "agent": "DocAnalyst", "priority": "high",
        "description": "Agent requests permission to write inspection_report_Q3_board.docx to /shared/reports/. File will contain 14 findings, 3 critical observations, and recommended action items.",
        "evidence": ["Source: inspection_report_Q3.pdf", "Template: board_report_v2.docx", "Output path: /shared/reports/", "Estimated size: 2.4 MB"],
        "requestedAt": "09:18:05", "status": "pending", "decidedAt": None, "decidedBy": None,
    },
    {
        "id": "APR-003", "title": "Execute Pressure Drop Recalculation Script",
        "agent": "CodeRunner", "priority": "medium",
        "description": "CodeRunner requests sandbox execution of pressure_drop_v3.py with updated pipe parameters from engineering change order ECO-2024-118.",
        "evidence": ["Script: pressure_drop_v3.py", "ECO reference: ECO-2024-118", "Sandbox: isolated Python 3.11", "No file write permissions requested"],
        "requestedAt": "09:22:41", "status": "pending", "decidedAt": None, "decidedBy": None,
    },
    {
        "id": "APR-004", "title": "Index New SOP Documents to Knowledge Base",
        "agent": "KnowledgeRAG", "priority": "low",
        "description": "KnowledgeRAG requests indexing of 3 new SOP documents uploaded to /docs/sops/. Documents will be chunked and added to the local vector store.",
        "evidence": ["Files: SOP-OPS-12.pdf, SOP-MNT-09.pdf, SOP-SAF-04.pdf", "Vector store: local FAISS", "No external transmission", "Estimated chunks: 847"],
        "requestedAt": "09:31:17", "status": "approved", "decidedAt": "09:33:02", "decidedBy": "Gravion Admin",
    },
]


def _load() -> list[dict]:
    if APPROVALS_FILE.exists():
        try:
            return json.loads(APPROVALS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    # First run — seed with initial items
    APPROVALS_FILE.write_text(json.dumps(INITIAL_ITEMS, indent=2), encoding="utf-8")
    return INITIAL_ITEMS.copy()


def _save(items: list[dict]):
    APPROVALS_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")


def _make_hash(item_id: str, status: str, decided_at: str) -> str:
    raw = f"{item_id}:{status}:{decided_at}"
    return hashlib.sha256(raw.encode()).hexdigest()[:8]


class DecisionRequest(BaseModel):
    status: str   # approved | rejected | escalated
    decided_by: str = "Gravion Admin"


@router.get("/approvals")
def get_approvals():
    return {"items": _load()}


@router.post("/approvals/{item_id}/decide")
def decide_approval(item_id: str, req: DecisionRequest):
    if req.status not in ("approved", "rejected", "escalated"):
        raise HTTPException(400, "Invalid status")

    items = _load()
    for item in items:
        if item["id"] == item_id:
            if item["status"] != "pending":
                raise HTTPException(400, f"{item_id} is already {item['status']}")
            decided_at = datetime.now().strftime("%H:%M:%S")
            item["status"]     = req.status
            item["decidedAt"]  = decided_at
            item["decidedBy"]  = req.decided_by
            item["hash"]       = _make_hash(item_id, req.status, decided_at)
            _save(items)
            
            AuditLogger.log(
                "approval", 
                req.decided_by, 
                f"Approval {req.status}", 
                f"{item_id}: {item['title']}", 
                "ok" if req.status == "approved" else "warn"
            )
            
            return {"status": "ok", "item": item}

    raise HTTPException(404, f"{item_id} not found")

from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from backend.agents.router import route
import asyncio

router = APIRouter()


class VoiceQueryRequest(BaseModel):
    message: str
    session_id: Optional[str] = "session_001"
    document_ids: Optional[list] = None
    source: Optional[str] = "voice"


@router.post("/v1/assistant/query")
async def voice_query(req: VoiceQueryRequest):
    """Bridge endpoint for the voice assistant pipeline."""
    agents, task_type = route(req.message)
    model = "qwen2.5:7b-instruct-q4_K_M"

    try:
        results = list(await asyncio.gather(*[
            a.execute(req.message, model=model) for a in agents
        ]))
    except Exception as e:
        return {
            "response": f"GRAVION encountered an error: {str(e)}",
            "task_type": "error",
            "sources": [],
            "artifacts": [],
        }

    message = results[0]["message"] if results else "No response available."

    return {
        "response": message,
        "task_type": task_type,
        "sources": [
            {"document": e["document"], "page": e["page"]}
            for r in results for e in r.get("evidence", [])
        ],
        "artifacts": [],
    }

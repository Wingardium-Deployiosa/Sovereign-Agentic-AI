"""Local mock backend used while the team's Agentic AI backend is in
development. Deterministic responses only - no external AI calls.
"""

from __future__ import annotations

from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Sovereign Voice Mock Backend", version="0.1.0")


class QueryRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    document_ids: List[str] = Field(default_factory=list)
    source: str = Field(default="voice")


class QueryResponse(BaseModel):
    response: str
    sources: List[dict] = Field(default_factory=list)
    artifacts: List[dict] = Field(default_factory=list)


def _deterministic_reply(message: str) -> QueryResponse:
    lowered = message.lower().strip()
    if "inspection" in lowered:
        body = (
            "The inspection report contains three findings: "
            "(1) valve corrosion at site A, "
            "(2) pressure drift at site B, "
            "(3) cable wear at site C."
        )
    elif "safety" in lowered:
        body = (
            "Safety protocol acknowledged. Confirm PPE compliance and "
            "log entry before continuing."
        )
    elif "shutdown" in lowered or "stop" in lowered:
        body = "Acknowledged. Initiating controlled shutdown sequence."
    elif "report" in lowered:
        body = (
            "Drafting a structured summary of the latest operational report."
        )
    elif "hello" in lowered or "hi" in lowered:
        body = "Hello. Sovereign Voice Assistant is online and ready."
    else:
        body = (
            f"Mock backend received your message of {len(message)} characters. "
            "Replace this endpoint with the on-premise Agentic AI backend."
        )
    return QueryResponse(response=body, sources=[], artifacts=[])


@app.get("/")
def root() -> dict:
    return {
        "service": "sovereign-voice-mock-backend",
        "status": "ok",
        "endpoint": "/api/v1/assistant/query",
    }


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


@app.post("/api/v1/assistant/query", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")
    return _deterministic_reply(req.message)


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(
        "mock_backend.server:app",
        host="127.0.0.1",
        port=8000,
        reload=False,
    )
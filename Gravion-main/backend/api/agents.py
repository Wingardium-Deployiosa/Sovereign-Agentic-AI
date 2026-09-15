import json
import asyncio
from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from backend.agents.router import route

router = APIRouter()


def _now() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _event(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _stream_workflow(task: str, model: str):
    agents, task_type = route(task)
    agent_names = [a.name for a in agents]

    # Step 1 — Orchestrator planning
    yield _event({"agent": "Orchestrator", "message": f"Received task: {task[:80]}", "type": "info", "time": _now()})
    await asyncio.sleep(0.3)
    yield _event({"agent": "Orchestrator", "message": f"Task type: {task_type} · Routing to: {', '.join(agent_names)}", "type": "info", "time": _now()})
    await asyncio.sleep(0.3)

    results = []
    for agent in agents:
        yield _event({"agent": agent.name, "message": f"Starting {agent.description}…", "type": "info", "time": _now()})
        await asyncio.sleep(0.2)

        # Show tool calls based on agent type
        tool_map = {
            "DocReason":        ("vector_search + synthesize", "Retrieving relevant document chunks…"),
            "VisionCore":       ("image_read + classify",      "No image provided — use Equipment Inspection page"),
            "TelemetryCore":    ("vector_search + llm_reason", "Analysing telemetry context…"),
            "EngineeringAgent": ("formula_lookup + calculate", "Running engineering calculation…"),
            "ReportAgent":      ("vector_search + llm_write",  "Generating structured report…"),
            "CodeAgent":        ("llm_codegen",                "Generating industrial code…"),
            "KnowledgeSearch":  ("vector_search + synthesize", "Searching knowledge base…"),
        }
        tool_call, tool_msg = tool_map.get(agent.name, ("llm_reason", "Processing…"))
        yield _event({"agent": agent.name, "message": f"Tool call: {tool_call}", "type": "tool", "time": _now()})
        await asyncio.sleep(0.2)
        yield _event({"agent": agent.name, "message": tool_msg, "type": "info", "time": _now()})

        # Actually run the agent
        try:
            result = await agent.execute(task, model=model)
            results.append(result)
            preview = result.get("message", "")[:120].replace("\n", " ")
            yield _event({"agent": agent.name, "message": f"✓ {preview}…", "type": "success", "time": _now()})
            if result.get("findings"):
                yield _event({"agent": agent.name, "message": f"{len(result['findings'])} finding(s) extracted", "type": "success", "time": _now()})
            if result.get("evidence"):
                yield _event({"agent": agent.name, "message": f"{len(result['evidence'])} evidence source(s) retrieved", "type": "success", "time": _now()})
        except Exception as e:
            err_msg = str(e) or type(e).__name__
            yield _event({"agent": agent.name, "message": f"Error: {err_msg[:200]}", "type": "error", "time": _now()})

        await asyncio.sleep(0.2)

    # Final summary
    yield _event({"agent": "Orchestrator", "message": f"All {len(agents)} agent(s) complete · Task: {task_type}", "type": "success", "time": _now()})

    # Send full result at end
    final = results[0] if results else {}
    yield _event({"agent": "Orchestrator", "message": "__DONE__", "type": "done", "time": _now(), "result": final, "task_type": task_type})


class RunRequest(BaseModel):
    task: str
    model: str = "qwen2.5:7b-instruct-q4_K_M"


@router.post("/agents/run")
async def run_agents(req: RunRequest):
    return StreamingResponse(
        _stream_workflow(req.task, req.model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/agents/status")
def agents_status():
    """Returns list of available agents with their real models."""
    return {"agents": [
        {"id": "doc",   "name": "DocAnalyst",    "role": "Document Analysis",    "model": "qwen2.5:7b-instruct-q4_K_M", "tools": ["vector_search", "rag", "synthesize"]},
        {"id": "vis",   "name": "VisionCore",    "role": "Visual Inspection",    "model": "llava:latest",               "tools": ["image_read", "classify", "ocr"]},
        {"id": "code",  "name": "CodeRunner",    "role": "Code Execution",       "model": "qwen2.5:7b-instruct-q4_K_M", "tools": ["python_exec", "sandbox", "codegen"]},
        {"id": "rag",   "name": "KnowledgeRAG",  "role": "Knowledge Retrieval",  "model": "qwen2.5:7b-instruct-q4_K_M", "tools": ["vector_search", "doc_fetch", "rerank"]},
        {"id": "tel",   "name": "TelemetryBot",  "role": "Sensor Analysis",      "model": "qwen2.5:7b-instruct-q4_K_M", "tools": ["anomaly_detect", "z_score", "trend"]},
        {"id": "orch",  "name": "Orchestrator",  "role": "Multi-Agent Planner",  "model": "qwen2.5:7b-instruct-q4_K_M", "tools": ["agent_call", "plan", "route"]},
    ]}

import asyncio
import base64
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from backend.models.schemas import CommandRequest, CommandResponse
from backend.agents.router import route, _AGENTS
from backend.agents.doc_reason import _ollama_stream, _normalize_history_messages
from backend.api.audit import AuditLogger

router = APIRouter()

@router.post("/command", response_model=CommandResponse)
async def handle_command(req: CommandRequest):
    image_bytes = b""
    if req.image:
        b64_data = req.image
        if "," in b64_data:
            b64_data = b64_data.split(",", 1)[1]
        try:
            image_bytes = base64.b64decode(b64_data)
        except Exception:
            image_bytes = b""

    if image_bytes:
        vision_model = req.model if req.model else "llava:latest"
        agents = [_AGENTS["VisionCore"]]
        task_type = "visual_inspection"
        try:
            results = [await _AGENTS["VisionCore"].execute(req.message, model=vision_model, image_bytes=image_bytes, history=req.history)]
        except Exception as e:
            err = str(e)
            AuditLogger.log("command", "User", "Command error", f"VisionCore failed: {err}", "warn")
            if "ConnectError" in err or "Connection refused" in err or "11434" in err:
                raise HTTPException(status_code=503, detail="Ollama is not running. Start Ollama and ensure the model is pulled.")
            raise HTTPException(status_code=503, detail=f"Model unavailable: {err}")
    else:
        agents, task_type = route(req.message)
        try:
            results = list(await asyncio.gather(*[
                a.execute(req.message, model=req.model, history=req.history) for a in agents
            ]))
        except Exception as e:
            err = str(e)
            AuditLogger.log("command", "User", "Command error", f"Agents failed: {err}", "warn")
            if "ConnectError" in err or "Connection refused" in err or "11434" in err:
                raise HTTPException(status_code=503, detail="Ollama is not running. Start Ollama and ensure the model is pulled.")
            raise HTTPException(status_code=503, detail=f"Model unavailable: {err}")
    agent_names = [a.name for a in agents]
    
    AuditLogger.log("command", "User", "Command executed", f"{req.message[:50]}... -> {', '.join(agent_names)}", "ok")

    findings = []
    evidence = []
    checklist_items = []
    assessment = None
    contradiction = None
    confidence_breakdown = None
    retries = None
    thought_process = None

    for r in results:
        findings.extend(r.get("findings", []))
        evidence.extend(r.get("evidence", []))
        checklist_items.extend(r.get("checklist_items", []))
        if r.get("assessment"):
            assessment = r["assessment"]
        if r.get("contradiction"):
            contradiction = r["contradiction"]
        if r.get("confidence_breakdown"):
            confidence_breakdown = r["confidence_breakdown"]
        if r.get("retries") is not None:
            retries = r["retries"]
        if r.get("thought_process"):
            thought_process = r["thought_process"]

    confidences = [r["confidence"] for r in results if r.get("confidence")]
    avg_confidence = round(sum(confidences) / len(confidences), 2) if confidences else None

    used_model = None
    for r in results:
        if r.get("model"):
            used_model = r["model"]
            break
    if not used_model:
        used_model = req.model

    return CommandResponse(
        status="success",
        command=req.message,
        task_type=task_type,
        agents=agent_names,
        message=(results[0]["message"] or "I'm sorry, I didn't understand that.") if results and len(agents) == 1
                else f"Multi-agent task assigned to: {', '.join(agent_names)}." if agent_names
                else "No agent available for this request.",
        model=used_model,
        assessment=assessment,
        findings=findings,
        evidence=evidence,
        confidence=avg_confidence,
        confidence_breakdown=confidence_breakdown,
        contradiction=contradiction,
        retries=retries,
        thought_process=thought_process,
        checklist_items=checklist_items,
    )


# ── SSE Streaming Endpoint ────────────────────────────────────────────────────

def _sse_event(event_type: str, data: dict) -> str:
    """Format a Server-Sent Event string."""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_type}\ndata: {payload}\n\n"

_SSE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


@router.post("/command/stream")
async def handle_command_stream(req: CommandRequest):
    """SSE streaming endpoint for live ChatGPT-style token animation."""

    image_bytes = b""
    if req.image:
        b64_data = req.image
        if "," in b64_data:
            b64_data = b64_data.split(",", 1)[1]
        try:
            image_bytes = base64.b64decode(b64_data)
        except Exception:
            image_bytes = b""

    # Vision requests are NOT streamed (they need binary image processing)
    # Fall back to the non-streaming path and send a single complete event
    if image_bytes:
        async def vision_generator():
            try:
                vision_model = req.model if req.model else "llava:latest"
                result = await _AGENTS["VisionCore"].execute(
                    req.message, model=vision_model, image_bytes=image_bytes, history=req.history
                )
                yield _sse_event("complete", {
                    "status": "success",
                    "command": req.message,
                    "task_type": "visual_inspection",
                    "agents": ["VisionCore"],
                    "message": result.get("message", ""),
                    "thought_process": result.get("thought_process", ""),
                    "model": vision_model,
                    "assessment": result.get("assessment"),
                    "findings": result.get("findings", []),
                    "evidence": result.get("evidence", []),
                    "confidence": result.get("confidence"),
                    "confidence_breakdown": result.get("confidence_breakdown"),
                    "contradiction": result.get("contradiction"),
                    "retries": result.get("retries"),
                    "checklist_items": result.get("checklist_items", []),
                })
            except Exception as e:
                yield _sse_event("error", {"message": str(e)})
        return StreamingResponse(vision_generator(), media_type="text/event-stream", headers=_SSE_HEADERS)

    # Route to determine agents
    agents, task_type = route(req.message)
    agent_names = [a.name for a in agents]

    # Determine if this is a "streamable" agent (GeneralAgent = pure text, no JSON needed)
    is_streamable = len(agents) == 1 and agents[0].name == "GeneralAgent"

    if is_streamable:
        agent = agents[0]
        from backend.agents.doc_reason import _is_greeting

        async def stream_general():
            # Send routing metadata immediately
            yield _sse_event("meta", {
                "task_type": task_type,
                "agents": agent_names,
                "model": req.model,
            })

            # Handle greetings instantly (no LLM call needed)
            if _is_greeting(req.message) and not req.history:
                greeting = "Hi! I'm GRAVION, your AI assistant for MRPL (Mangalore Refinery and Petrochemicals Limited). I can help you with document analysis, equipment inspection, telemetry analysis, engineering calculations, report generation, code execution, and knowledge search. How can I assist you today?"
                yield _sse_event("complete", {
                    "status": "success",
                    "command": req.message,
                    "task_type": "general",
                    "agents": ["GeneralAgent"],
                    "message": greeting,
                    "thought_process": "",
                    "model": req.model,
                    "assessment": None, "findings": [], "evidence": [],
                    "confidence": 0.90, "confidence_breakdown": None,
                    "contradiction": None, "retries": 0, "checklist_items": [],
                })
                return

            system = (
                "You are GRAVION, an AI assistant for MRPL (Mangalore Refinery and Petrochemicals Limited). "
                "You possess extensive petrochemical, refinery engineering, operations, and equipment maintenance knowledge. "
                "You are continuing an ongoing conversation. ALWAYS prioritize answering based on the context, documents, telemetry, or inspection findings discussed earlier in the chat history. "
                "Seamlessly recall and reference previous data provided by the assistant instead of giving generic answers. "
                "Answer the user's message directly, accurately, and professionally (3-6 sentences) without unnecessary robotic preambles."
            )

            full_thought = ""
            full_message = ""

            async for event in _ollama_stream(
                req.message, req.model, num_predict=4096,
                system=system, history=req.history
            ):
                etype = event["type"]
                if etype == "thought":
                    full_thought += event["content"]
                    yield _sse_event("thought", {"token": event["content"]})
                elif etype == "message":
                    full_message += event["content"]
                    yield _sse_event("token", {"token": event["content"]})
                elif etype == "done":
                    full_thought = event.get("thought", full_thought)
                    full_message = event.get("message", full_message) or full_message
                elif etype == "error":
                    yield _sse_event("error", {"message": event["content"]})
                    return

            # Send final complete event with full structured payload
            yield _sse_event("complete", {
                "status": "success",
                "command": req.message,
                "task_type": "general",
                "agents": ["GeneralAgent"],
                "message": full_message,
                "thought_process": full_thought,
                "model": req.model,
                "assessment": None, "findings": [], "evidence": [],
                "confidence": 0.90, "confidence_breakdown": None,
                "contradiction": None, "retries": 0, "checklist_items": [],
            })

        return StreamingResponse(stream_general(), media_type="text/event-stream", headers=_SSE_HEADERS)

    # For structured agents (DocReason, Engineering, etc.) — use non-streaming path
    # but wrap in SSE so the frontend always gets the same event format
    async def stream_structured():
        yield _sse_event("meta", {
            "task_type": task_type,
            "agents": agent_names,
            "model": req.model,
        })
        
        try:
            queue = asyncio.Queue()
            
            async def _execute_agent(a):
                return await a.execute(req.message, model=req.model, history=req.history, thought_queue=queue)
                
            task = asyncio.create_task(asyncio.gather(*[_execute_agent(a) for a in agents]))
            
            while not task.done():
                try:
                    token = await asyncio.wait_for(queue.get(), timeout=0.1)
                    if token:
                        yield _sse_event("thought", {"token": token})
                except asyncio.TimeoutError:
                    pass
            
            while not queue.empty():
                token = queue.get_nowait()
                if token:
                    yield _sse_event("thought", {"token": token})
                    
            results = list(task.result())
        except Exception as e:
            yield _sse_event("error", {"message": str(e)})
            return

        AuditLogger.log("command", "User", "Command executed", f"{req.message[:50]}... -> {', '.join(agent_names)}", "ok")

        findings = []
        evidence = []
        checklist_items = []
        assessment = None
        contradiction = None
        confidence_breakdown = None
        retries_val = None
        thought_process = None

        for r in results:
            findings.extend(r.get("findings", []))
            evidence.extend(r.get("evidence", []))
            checklist_items.extend(r.get("checklist_items", []))
            if r.get("assessment"):
                assessment = r["assessment"]
            if r.get("contradiction"):
                contradiction = r["contradiction"]
            if r.get("confidence_breakdown"):
                confidence_breakdown = r["confidence_breakdown"]
            if r.get("retries") is not None:
                retries_val = r["retries"]
            if r.get("thought_process"):
                thought_process = r["thought_process"]

        confidences = [r["confidence"] for r in results if r.get("confidence")]
        avg_confidence = round(sum(confidences) / len(confidences), 2) if confidences else None

        used_model = None
        for r in results:
            if r.get("model"):
                used_model = r["model"]
                break
        if not used_model:
            used_model = req.model

        yield _sse_event("complete", {
            "status": "success",
            "command": req.message,
            "task_type": task_type,
            "agents": agent_names,
            "message": (results[0]["message"] or "I'm sorry, I didn't understand that.") if results and len(agents) == 1
                    else f"Multi-agent task assigned to: {', '.join(agent_names)}." if agent_names
                    else "No agent available for this request.",
            "model": used_model,
            "assessment": assessment,
            "findings": findings,
            "evidence": evidence,
            "confidence": avg_confidence,
            "confidence_breakdown": confidence_breakdown,
            "contradiction": contradiction,
            "retries": retries_val,
            "thought_process": thought_process,
            "checklist_items": checklist_items,
        })

    return StreamingResponse(stream_structured(), media_type="text/event-stream", headers=_SSE_HEADERS)


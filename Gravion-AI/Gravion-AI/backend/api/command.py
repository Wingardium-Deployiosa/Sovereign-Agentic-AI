import asyncio
from fastapi import APIRouter
from backend.models.schemas import CommandRequest, CommandResponse
from backend.agents.router import route

router = APIRouter()

@router.post("/command", response_model=CommandResponse)
async def handle_command(req: CommandRequest):
    agents, task_type = route(req.message)
    results = list(await asyncio.gather(*[
        a.execute(req.message) for a in agents
    ]))
    agent_names = [a.name for a in agents]

    findings = []
    evidence = []
    checklist_items = []
    assessment = None
    contradiction = None
    confidence_breakdown = None
    retries = None

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

    confidences = [r["confidence"] for r in results if r.get("confidence")]
    avg_confidence = round(sum(confidences) / len(confidences), 2) if confidences else None

    return CommandResponse(
        status="success",
        command=req.message,
        task_type=task_type,
        agents=agent_names,
        message=results[0]["message"] if results and len(agents) == 1
                else f"Multi-agent task assigned to: {', '.join(agent_names)}." if agent_names
                else "No agent available for this request.",
        assessment=assessment,
        findings=findings,
        evidence=evidence,
        confidence=avg_confidence,
        confidence_breakdown=confidence_breakdown,
        contradiction=contradiction,
        retries=retries,
        checklist_items=checklist_items,
    )

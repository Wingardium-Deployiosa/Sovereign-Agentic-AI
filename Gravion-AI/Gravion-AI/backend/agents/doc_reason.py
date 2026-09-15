from .base import BaseAgent
from backend.rag.retriever import retrieve
from backend.rag.synthesizer import synthesize
from backend.rag.evidence_consistency import _extract_structured_findings


def _build_rich_answer(answer: str, findings: list[dict], chunks: list[dict]) -> str:
    """
    If the LLM answer is too short or generic, build a useful explanation
    from the structured findings extracted from evidence.
    """
    if len(answer) > 120 and not answer.startswith("Unable to"):
        return answer

    # Build from findings
    numeric = [f for f in findings if f.get("value")]
    actions = [f for f in findings if not f.get("value")]

    parts = []
    if numeric:
        vals = "; ".join(
            f"{f['value']} (normal: {f['reference']})" if f.get("reference") else f["value"]
            for f in numeric[:3]
        )
        parts.append(f"The evidence indicates out-of-range readings: {vals}.")
    if actions:
        acts = "; ".join(f["finding"] for f in actions[:3])
        parts.append(f"Recommended actions from the source: {acts}.")

    if not parts:
        return answer

    return " ".join(parts)


class DocReasonAgent(BaseAgent):
    name = "DocReason"
    description = "Document reasoning and analysis agent"
    capabilities = ["PDF analysis", "Document reasoning", "RAG", "Evidence extraction"]

    async def execute(self, command: str) -> dict:
        chunks = retrieve(command, top_k=5)

        if not chunks:
            return {
                "agent": self.name,
                "task_type": "document_analysis",
                "message": "No documents indexed yet. Please upload documents first.",
                "assessment": "INSUFFICIENT EVIDENCE",
                "findings": [],
                "evidence": [],
                "confidence": 0.0,
                "confidence_breakdown": None,
                "contradiction": None,
                "retries": 0,
            }

        result = await synthesize(command, chunks)

        seen = set()
        evidence = []
        for c in chunks:
            key = (c["document"], c["page"])
            if key not in seen:
                seen.add(key)
                evidence.append({
                    "document": c["document"],
                    "page": c["page"],
                    "score": round(c["score"], 3),
                    "excerpt": c["text"][:300],
                    "section": c.get("section") or None,
                    "vector_score": round(c.get("vector_score", c["score"]), 3),
                    "section_boost": round(c.get("section_boost", 0.0), 3),
                })

        consistency_ok = result.get("consistency", {}).get("consistent", True)
        contradiction = result.get("consistency", {}).get("contradiction")

        # ── Deterministic confidence breakdown ──
        avg_score = sum(c["score"] for c in chunks) / len(chunks)
        source_count = len(evidence)

        retrieval_relevance = round(min(avg_score, 1.0), 2)
        source_coverage = round(min(source_count / 3, 1.0), 2)

        answer_words = set(result["answer"].lower().split())
        evidence_words = set(" ".join(c["text"] for c in chunks).lower().split())
        grounded = len(answer_words & evidence_words) / max(len(answer_words), 1)
        answer_grounding = round(min(grounded, 1.0), 2)

        overall = round(
            retrieval_relevance * 0.4
            + source_coverage * 0.2
            + (0.2 if consistency_ok else 0.0)
            + answer_grounding * 0.2,
            2,
        )

        breakdown = {
            "retrieval_relevance": retrieval_relevance,
            "source_coverage": source_coverage,
            "consistency": consistency_ok,
            "answer_grounding": answer_grounding,
            "overall": min(overall, 0.99),
        }

        # Enrich short answers from findings
        rich_answer = _build_rich_answer(result["answer"], result.get("findings", []), chunks)

        return {
            "agent": self.name,
            "task_type": "document_analysis",
            "message": rich_answer,
            "assessment": result["assessment"],   # always from rule engine
            "findings": result.get("findings", []),
            "checklist_items": result.get("checklist_items", []),
            "evidence": evidence,
            "confidence": min(overall, 0.99),
            "confidence_breakdown": breakdown,
            "contradiction": contradiction,
            "retries": result.get("retries", 0),
        }


class VisionCoreAgent(BaseAgent):
    name = "VisionCore"
    description = "Visual inspection and image analysis agent"
    capabilities = ["Image analysis", "Defect detection", "Visual inspection",
                    "Corrosion detection", "Leakage detection", "Component identification"]

    async def execute(self, command: str, image_bytes: bytes = b"", filename: str = "") -> dict:
        """
        Accepts optional image_bytes for direct image analysis.
        When called from the command router without an image, returns a prompt.
        """
        if not image_bytes:
            return {
                "agent": self.name,
                "task_type": "visual_inspection",
                "message": "Please upload an equipment image on the Inspection page for visual analysis.",
                "assessment": None,
                "findings": [],
                "evidence": [],
                "confidence": 0.0,
                "confidence_breakdown": None,
                "contradiction": None,
                "retries": 0,
                "checklist_items": [],
            }

        from backend.vision.image_loader import load_image, ImageLoadError
        from backend.vision.analyzer import analyze

        try:
            image = load_image(image_bytes, filename or "upload.jpg")
        except ImageLoadError as e:
            return {
                "agent": self.name,
                "task_type": "visual_inspection",
                "message": f"Image load error: {e}",
                "assessment": "INSUFFICIENT EVIDENCE",
                "findings": [],
                "evidence": [],
                "confidence": 0.0,
                "confidence_breakdown": None,
                "contradiction": None,
                "retries": 0,
                "checklist_items": [],
            }

        result = await analyze(image)

        # Convert observations to FindingItem-compatible dicts
        findings = [
            {
                "finding": f"{o.type.capitalize()} at {o.location}: {o.description}",
                "value": o.severity,
                "reference": o.type,
            }
            for o in result.observations
        ]

        # Visual flags as additional findings
        if result.visible_leak:
            findings.append({"finding": "Visible leakage detected in image", "value": "leak", "reference": None})
        if result.visible_damage:
            findings.append({"finding": "Visible structural damage detected", "value": "damage", "reference": None})

        message = result.raw_description or "Visual analysis complete."
        if result.equipment_guess:
            message = f"Equipment identified: {result.equipment_guess}. {message}"

        return {
            "agent": self.name,
            "task_type": "visual_inspection",
            "message": message,
            "assessment": result.overall_visual_condition,
            "findings": findings,
            "evidence": [],
            "confidence": result.confidence,
            "confidence_breakdown": None,
            "contradiction": None,
            "retries": 0,
            "checklist_items": [],
        }


class TelemetryCoreAgent(BaseAgent):
    name = "TelemetryCore"
    description = "Sensor data and telemetry analysis agent"
    capabilities = ["CSV analysis", "Vibration analysis", "Anomaly detection", "Trend analysis"]

    async def execute(self, command: str) -> dict:
        return {
            "agent": self.name,
            "task_type": "telemetry_analysis",
            "message": f"TelemetryCore is analyzing: '{command}'",
            "findings": [],
            "confidence": 0.85,
        }


class EngineeringAgent(BaseAgent):
    name = "EngineeringAgent"
    description = "Engineering calculations and analysis agent"
    capabilities = ["Hydraulic calculations", "Power analysis", "Load calculations"]

    async def execute(self, command: str) -> dict:
        return {
            "agent": self.name,
            "task_type": "engineering_calculation",
            "message": f"EngineeringAgent is processing: '{command}'",
            "findings": [],
            "confidence": 0.93,
        }

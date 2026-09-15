from __future__ import annotations
import re
import json
import httpx
from .base import BaseAgent
from backend.rag.retriever import retrieve
from backend.rag.synthesizer import synthesize
from backend.rag.evidence_consistency import _extract_structured_findings

_OLLAMA_URL  = "http://localhost:11434/api/generate"

# Model assignments per task — only pulled models
_MODEL_RAG    = "qwen2.5:7b-instruct-q4_K_M"       # RAG, reasoning, telemetry, engineering, general
_MODEL_CODE   = "qwen2.5:7b-instruct-q4_K_M"       # Code generation
_MODEL_VISION = "llava:latest"                     # Visual inspection / image analysis


def _normalize_history_messages(history: list | None) -> list[dict]:
    """Convert history objects/dicts to clean native Ollama chat turns."""
    if not history:
        return []
    chat_msgs = []
    for h in history:
        raw_role = getattr(h, "role", "") if hasattr(h, "role") else (h.get("role", "") if isinstance(h, dict) else "")
        role = "user" if str(raw_role).lower() == "user" else "assistant"
        raw_text = getattr(h, "text", "") if hasattr(h, "text") else (h.get("text", "") if isinstance(h, dict) else "")
        if raw_text:
            clean_text = str(raw_text).strip()
            clean_text = re.sub(r"<think>.*?</think>", "", clean_text, flags=re.DOTALL)
            clean_text = re.sub(r"<think>.*$", "", clean_text, flags=re.DOTALL).strip()
            if clean_text:
                if len(clean_text) > 4000:
                    clean_text = clean_text[:4000] + "..."
                chat_msgs.append({"role": role, "content": clean_text})
    # Return all turns provided by the frontend to maintain full context memory
    return chat_msgs


async def _ollama(
    prompt: str,
    model: str,
    num_predict: int = 1000,
    system: str = "",
    history: list = None,
    thought_queue: asyncio.Queue = None,
) -> tuple[str, str]:
    messages = []
    # Dynamically detect model types
    is_reasoning_model = False
    if model:
        lower_model = model.lower()
        is_reasoning_model = any(x in lower_model for x in ["deepseek", "reason", "-r1"])
    
    # Apply anti-hallucination prompt. 
    if not is_reasoning_model:
        constraint = "IMPORTANT: You are a direct answering bot. Reply with the final answer immediately and nothing else."
        if system:
            system += f" {constraint}"
        else:
            system = constraint
            
    if system:
        messages.append({"role": "system", "content": system})
    if history:
        messages.extend(_normalize_history_messages(history))
    messages.append({"role": "user", "content": prompt})

    options = {"num_predict": num_predict, "temperature": 0.2}

    async with httpx.AsyncClient(timeout=180) as c:
        # First try /api/chat with native conversation turns and think=False
        try:
            if not thought_queue:
                resp = await c.post("http://localhost:11434/api/chat", json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "options": options,
                })
                resp.raise_for_status()
                data = resp.json()
                msg = data.get("message", {})
                content = msg.get("content", "").strip()
                
                if not content and msg.get("thinking"):
                    # The model only produced reasoning and no final answer.
                    # If it's a non-reasoning model, it hallucinated a thinking block that Ollama parsed. Treat it as content.
                    if not is_reasoning_model:
                        content = msg.get("thinking").strip()
                    else:
                        raise ValueError("Model only produced thinking block with no content.")
            else:
                content = ""
                in_think = False
                think_done = False
                async with c.stream("POST", "http://localhost:11434/api/chat", json={
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "options": options,
                }) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.strip(): continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        msg = data.get("message", {})
                        token = msg.get("content", "")
                        
                        if not token:
                            thinking_token = msg.get("thinking", "")
                            if thinking_token:
                                content += thinking_token
                                await thought_queue.put(thinking_token)
                            continue
                            
                        content += token
                        
                        if "<think>" in content and not in_think and not think_done:
                            in_think = True
                            continue
                            
                        if in_think and not think_done:
                            if "</think>" in content:
                                think_done = True
                            await thought_queue.put(token)
                            
            if content:
                # Handle models that hallucinate "Thinking Process:" without <think> tags
                hallucinated_thought = ""
                hallucination_match = re.search(r"^(?:Thinking|Thought)\s*Process:\s*(.*?)(?:\n\n(?:Answer|Final Answer):|\n\n\*\*(?:Answer|Final Answer)|\n\n(?=[A-Z])|$)", content, flags=re.IGNORECASE | re.DOTALL)
                
                if hallucination_match:
                    hallucinated_thought = hallucination_match.group(1).strip()
                    content = content[hallucination_match.end():].strip()
                    # Strip any trailing "Answer:" prefix from the remaining content
                    content = re.sub(r"^(?:Answer|Final Answer):\s*", "", content, flags=re.IGNORECASE).strip()
                    # Also strip markdown bold answers like "**Answer:**"
                    content = re.sub(r"^\*\*(?:Answer|Final Answer):\*\*\s*", "", content, flags=re.IGNORECASE).strip()

                # Catch hallucinated asterisks thinking like "*Wait, I should...*" at the beginning
                asterisk_match = re.search(r"^\*([^*]+)\*\s*\n*(.*)", content, flags=re.DOTALL)
                if asterisk_match and len(asterisk_match.group(1).split()) > 5: # Only catch long thoughts, not just a bold word
                    hallucinated_thought = (hallucinated_thought + "\n\n" + asterisk_match.group(1).strip()).strip()
                    content = asterisk_match.group(2).strip()

                clean = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
                clean = re.sub(r"<think>.*$", "", clean, flags=re.DOTALL).strip()
                thought_match = re.search(r"<think>(.*?)(?:</think>|$)", content, flags=re.DOTALL)
                thought = thought_match.group(1).strip() if thought_match else ""
                
                if hallucinated_thought:
                    thought = (thought + "\n\n" + hallucinated_thought).strip()
                    
                if clean or thought:
                    return clean, thought
        except Exception:
            pass

        # Fallback to /api/generate
        try:
            flat_prompt = ""
            for m in messages:
                r = m["role"].capitalize()
                flat_prompt += f"{r}: {m['content']}\n\n"
            flat_prompt += "Assistant: "

            resp = await c.post(_OLLAMA_URL, json={
                "model": model,
                "prompt": flat_prompt,
                "stream": False,
                "options": options,
            })
            resp.raise_for_status()
            data = resp.json()
            ans = data.get("response", "").strip()
            
            if not ans and data.get("thinking"):
                if not is_reasoning_model:
                    ans = data.get("thinking").strip()
            
            if ans:
                # Handle models that hallucinate "Thinking Process:" without <think> tags
                hallucinated_thought = ""
                hallucination_match = re.search(r"^(?:Thinking|Thought)\s*Process:\s*(.*?)(?:\n\n(?:Answer|Final Answer):|\n\n\*\*(?:Answer|Final Answer)|\n\n(?=[A-Z])|$)", ans, flags=re.IGNORECASE | re.DOTALL)
                
                if hallucination_match:
                    hallucinated_thought = hallucination_match.group(1).strip()
                    ans = ans[hallucination_match.end():].strip()
                    # Strip any trailing "Answer:" prefix from the remaining content
                    ans = re.sub(r"^(?:Answer|Final Answer):\s*", "", ans, flags=re.IGNORECASE).strip()
                    # Also strip markdown bold answers like "**Answer:**"
                    ans = re.sub(r"^\*\*(?:Answer|Final Answer):\*\*\s*", "", ans, flags=re.IGNORECASE).strip()

                clean = re.sub(r"<think>.*?</think>", "", ans, flags=re.DOTALL)
                clean = re.sub(r"<think>.*$", "", clean, flags=re.DOTALL).strip()
                thought_match = re.search(r"<think>(.*?)(?:</think>|$)", ans, flags=re.DOTALL)
                thought = thought_match.group(1).strip() if thought_match else ""
                
                if hallucinated_thought:
                    thought = (thought + "\n\n" + hallucinated_thought).strip()
                    
                if clean or thought:
                    return clean, thought
        except Exception as e:
            print(f"Ollama inference error (fallback): {e}")
            
    return "I'm sorry, the model returned an empty response.", ""


async def _ollama_stream(
    prompt: str,
    model: str,
    num_predict: int = 1000,
    system: str = "",
    history: list = None,
):
    """Async generator that yields SSE event dicts as Ollama streams tokens.
    
    Yields dicts with keys:
      - {"type": "thought", "content": "..."} — while inside <think> block
      - {"type": "message", "content": "..."} — the final response token
      - {"type": "done", "content": "", "thought": "...", "message": "..."} — stream finished
    """
    messages = []
    is_reasoning_model = False
    if model:
        lower_model = model.lower()
        is_reasoning_model = any(x in lower_model for x in ["deepseek", "reason", "-r1"])
    
    if not is_reasoning_model:
        constraint = "IMPORTANT: You are a direct answering bot. Reply with the final answer immediately and nothing else."
        if system:
            system += f" {constraint}"
        else:
            system = constraint
    
    if system:
        messages.append({"role": "system", "content": system})
    if history:
        messages.extend(_normalize_history_messages(history))
    messages.append({"role": "user", "content": prompt})
    
    options = {"num_predict": num_predict, "temperature": 0.2}
    
    full_content = ""
    full_thought = ""
    in_think = False
    think_done = False
    
    try:
        async with httpx.AsyncClient(timeout=180) as c:
            async with c.stream("POST", "http://localhost:11434/api/chat", json={
                "model": model,
                "messages": messages,
                "stream": True,
                "options": options,
            }) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    
                    token = data.get("message", {}).get("content", "")
                    if not token:
                        # Check if Ollama gives us a native thinking field
                        thinking_token = data.get("message", {}).get("thinking", "")
                        if thinking_token:
                            full_thought += thinking_token
                            yield {"type": "thought", "content": thinking_token}
                        if data.get("done"):
                            break
                        continue
                    
                    full_content += token
                    
                    # Detect <think> block opening
                    if "<think>" in full_content and not in_think and not think_done:
                        in_think = True
                        # Yield any content before <think> as message
                        before_think = full_content.split("<think>")[0]
                        if before_think.strip():
                            yield {"type": "message", "content": before_think}
                        continue
                    
                    if in_think:
                        # Check if think block is closing
                        if "</think>" in full_content:
                            think_done = True
                            in_think = False
                            # Extract the thought content
                            think_match = re.search(r"<think>(.*?)</think>", full_content, flags=re.DOTALL)
                            if think_match:
                                full_thought = think_match.group(1).strip()
                            # Get remaining content after </think>
                            after_think = full_content.split("</think>", 1)[1]
                            # Reset full_content to only the post-think part
                            full_content = after_think
                            if after_think.strip():
                                yield {"type": "message", "content": after_think.strip()}
                        else:
                            # Still inside think — yield the token as thought
                            yield {"type": "thought", "content": token}
                        continue
                    
                    # Normal content (outside think block)
                    yield {"type": "message", "content": token}
                    
                    if data.get("done"):
                        break
    except Exception as e:
        yield {"type": "error", "content": str(e)}
        return
    
    # Clean the final content of any remaining think tags
    clean_content = re.sub(r"<think>.*?</think>", "", full_content, flags=re.DOTALL)
    clean_content = re.sub(r"<think>.*$", "", clean_content, flags=re.DOTALL).strip()
    
    yield {"type": "done", "content": "", "thought": full_thought, "message": clean_content}


def _clean_meta_preamble(text: str, command: str = "") -> str:
    """
    Strips robotic conversational recaps such as:
    'The conversation earlier focused on the inspection of a centrifugal pump... Regarding career opportunities, ...'
    -> 'Regarding career opportunities, ...'
    """
    if not text:
        return text

    cmd_lower = (command or "").lower()
    if any(k in cmd_lower for k in ["earlier conversation", "what did we discuss", "what did we talk about", "summarize our chat", "repeat what you said"]):
        return text

    pattern = r"^(?:The\s+conversation\s+(?:earlier|previously)\s+(?:focused\s+on|was\s+about|discussed|revolved\s+around)\s+[^.\n]+[\.\n]\s*|In\s+(?:our\s+)?(?:previous|earlier)\s+(?:conversation|discussion|messages?|turn),\s+[^.\n]+[\.\n]\s*|Earlier,\s+we\s+discussed\s+[^.\n]+[\.\n]\s*|Previously,\s+we\s+(?:discussed|talked\s+about|focused\s+on)\s+[^.\n]+[\.\n]\s*)"
    cleaned = re.sub(pattern, "", text.strip(), flags=re.IGNORECASE)
    return cleaned.strip()


def _build_rich_answer(answer: str, findings: list[dict], chunks: list[dict]) -> str:
    if len(answer) > 120 and not answer.startswith("Unable to"):
        return answer
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
    return " ".join(parts) if parts else answer


def _format_history(history: list | None) -> str:
    if not history:
        return ""
    lines = []
    for h in history:
        role = "User" if (getattr(h, "role", "") == "user" or (isinstance(h, dict) and h.get("role") == "user")) else "Assistant"
        txt = getattr(h, "text", "") or (h.get("text", "") if isinstance(h, dict) else "")
        if txt:
            clean_txt = " ".join(txt.split())
            if len(clean_txt) > 400:
                clean_txt = clean_txt[:400] + "..."
            lines.append(f"{role}: {clean_txt}")
    if not lines:
        return ""
    return "\n".join(lines)


# ── 1. Document Analysis ──────────────────────────────────────────────────────

class DocReasonAgent(BaseAgent):
    name = "DocReason"
    description = "Document reasoning and analysis agent"
    capabilities = ["PDF analysis", "Document reasoning", "RAG", "Evidence extraction"]

    async def execute(self, command: str, model: str = _MODEL_RAG, history: list = None, **kwargs) -> dict:
        target_model = model or _MODEL_RAG
        retrieval_query = command
        if history:
            prior_msgs = [getattr(h, "text", "") if hasattr(h, "text") else h.get("text", "") for h in history]
            if prior_msgs and any(p in command.lower() for p in ["it", "this", "that", "the pump", "the equipment", "those", "these", "said earlier", "we discussed", "what about", "why"]):
                retrieval_query = f"{command} {prior_msgs[-1][:200]}"

        chunks = retrieve(retrieval_query, top_k=5)
        if not chunks:
            return {
                "agent": self.name, "task_type": "document_analysis",
                "message": "No documents indexed yet. Please upload documents first via the Knowledge Base page.",
                "thought_process": "",
                "assessment": "INSUFFICIENT EVIDENCE", "findings": [], "evidence": [],
                "confidence": 0.0, "confidence_breakdown": None, "contradiction": None, "retries": 0,
                "model": target_model,
            }

        result = await synthesize(command, chunks, model=target_model, history=history, thought_queue=kwargs.get("thought_queue"))

        seen = set()
        evidence = []
        for c in chunks:
            key = (c["document"], c["page"])
            if key not in seen:
                seen.add(key)
                evidence.append({
                    "document": c["document"], "page": c["page"],
                    "score": round(c["score"], 3), "excerpt": c["text"][:300],
                    "section": c.get("section") or None,
                    "vector_score": round(c.get("vector_score", c["score"]), 3),
                    "section_boost": round(c.get("section_boost", 0.0), 3),
                })

        consistency_ok = result.get("consistency", {}).get("consistent", True)
        contradiction = result.get("consistency", {}).get("contradiction")
        avg_score = sum(c["score"] for c in chunks) / len(chunks)
        source_count = len(evidence)
        retrieval_relevance = round(min(avg_score, 1.0), 2)
        source_coverage = round(min(source_count / 3, 1.0), 2)
        answer_words = set(result["answer"].lower().split())
        evidence_words = set(" ".join(c["text"] for c in chunks).lower().split())
        grounded = len(answer_words & evidence_words) / max(len(answer_words), 1)
        answer_grounding = round(min(grounded, 1.0), 2)
        overall = round(retrieval_relevance * 0.4 + source_coverage * 0.2 + (0.2 if consistency_ok else 0.0) + answer_grounding * 0.2, 2)
        breakdown = {"retrieval_relevance": retrieval_relevance, "source_coverage": source_coverage,
                     "consistency": consistency_ok, "answer_grounding": answer_grounding, "overall": min(overall, 0.99)}
        rich_answer = _build_rich_answer(result["answer"], result.get("findings", []), chunks)

        return {
            "agent": self.name, "task_type": "document_analysis",
            "message": rich_answer, "thought_process": result.get("thought_process", ""),
            "assessment": result["assessment"],
            "findings": result.get("findings", []), "checklist_items": result.get("checklist_items", []),
            "evidence": evidence, "confidence": min(overall, 0.99),
            "confidence_breakdown": breakdown, "contradiction": contradiction, "retries": result.get("retries", 0),
            "model": target_model,
        }


# ── 2. Vision / Inspect Equipment ────────────────────────────────────────────

class VisionCoreAgent(BaseAgent):
    name = "VisionCore"
    description = "Visual inspection and image analysis agent"
    capabilities = ["Image analysis", "Defect detection", "Visual inspection",
                    "Corrosion detection", "Leakage detection", "Component identification"]

    async def execute(self, command: str, model: str = _MODEL_VISION, image_bytes: bytes = b"", filename: str = "", history: list = None, **kwargs) -> dict:
        target_model = model or _MODEL_VISION
        if not image_bytes:
            system = (
                "You are VisionCore, an industrial visual inspection and defect analysis expert for MRPL refinery. "
                "Maintain full conversational context: if equipment, visual defects, corrosion, or damages were inspected or discussed earlier in the chat, directly answer the user's questions about those findings, severity, root causes, and repair steps."
            )
            prompt = f"""The user asked: "{command}"
If previous messages in this conversation contain an inspection report or observed defects, analyze and answer directly using those observations.
If no equipment inspection has been discussed yet in this conversation, explain what visual inspection would look for in this context.
Keep response concise, technical, and actionable."""
            raw_message, thought_process = await _ollama(prompt, target_model, num_predict=4096, system=system, history=history, thought_queue=kwargs.get("thought_queue"))
            message = _clean_meta_preamble(raw_message, command)
            return {
                "agent": self.name, "task_type": "visual_inspection",
                "message": message,
            "thought_process": thought_process,
                "assessment": None, "findings": [], "evidence": [], "confidence": 0.80,
                "confidence_breakdown": None, "contradiction": None, "retries": 0, "checklist_items": [],
                "model": target_model,
            }

        from backend.vision.image_loader import load_image, ImageLoadError
        from backend.vision.analyzer import analyze
        try:
            image = load_image(image_bytes, filename or "upload.jpg")
        except ImageLoadError as e:
            return {"agent": self.name, "task_type": "visual_inspection",
                    "message": f"Image load error: {e}", "assessment": "INSUFFICIENT EVIDENCE",
                    "findings": [], "evidence": [], "confidence": 0.0,
                    "confidence_breakdown": None, "contradiction": None, "retries": 0, "checklist_items": [],
                    "model": target_model}

        result = await analyze(image, vision_model=target_model, reason_model=target_model)
        findings = [{"finding": f"{o.type.capitalize()} at {o.location}: {o.description}", "value": o.severity, "reference": o.type}
                    for o in result.observations]
        if result.visible_leak:
            findings.append({"finding": "Visible leakage detected in image", "value": "leak", "reference": None})
        if result.visible_damage:
            findings.append({"finding": "Visible structural damage detected", "value": "damage", "reference": None})
        status = result.overall_visual_condition
        eq_name = result.equipment_guess or "Industrial Equipment"
        
        header = f"**{eq_name}** | Status: **{status}**"
        summary = f"> {result.raw_description or 'Visual inspection completed.'}"
        
        if status == "NORMAL":
            checks = (
                "- **Structural:** Sound, no cracks.\n"
                "- **Containment:** Normal, no leaks.\n"
                "- **Surface:** Normal, no critical rust."
            )
        else:
            checks = "**Key Observations:**\n" + "\n".join(f"- {f['finding']} (Severity: {f['value']})" for f in findings)
            
        message = f"{header}\n\n{summary}\n\n{checks}"
        return {
            "agent": self.name, "task_type": "visual_inspection", "message": message,
            "thought_process": "",
            "assessment": result.overall_visual_condition, "findings": findings,
            "evidence": [], "confidence": result.confidence,
            "confidence_breakdown": None, "contradiction": None, "retries": 0, "checklist_items": [],
            "model": target_model,
        }


# ── 3. Telemetry Analysis ─────────────────────────────────────────────────────

class TelemetryCoreAgent(BaseAgent):
    name = "TelemetryCore"
    description = "Sensor data and telemetry analysis agent"
    capabilities = ["Vibration analysis", "Anomaly detection", "Trend analysis", "Sensor diagnostics"]

    async def execute(self, command: str, model: str = _MODEL_RAG, history: list = None, **kwargs) -> dict:
        target_model = model or _MODEL_RAG
        chunks = retrieve(command, top_k=4)

        system = (
            "You are TelemetryCore, an industrial sensor data and telemetry analysis agent for MRPL refinery. "
            "You specialize in vibration analysis, bearing diagnostics, temperature, pressure, and sensor telemetry. "
            "Maintain full conversational context: seamlessly recall and use any equipment name, location, units, or sensor readings discussed earlier in the conversation."
        )
        prompt = f"""User query: "{command}"

{"Evidence from indexed documents:" + chr(10) + chr(10).join(f"[Source {i+1}] {c['text'][:400]}" for i, c in enumerate(chunks)) if chunks else ""}

Provide a concise, technical industrial telemetry response:
1. Specifically identify the equipment and readings referenced (recall from previous conversation if the user asks about previously discussed readings or equipment)
2. Normal operating baselines vs observed readings
3. Potential failure modes or anomaly diagnosis
4. Actionable recommendations"""

        raw_message, thought_process = await _ollama(prompt, target_model, num_predict=4096, system=system, history=history, thought_queue=kwargs.get("thought_queue"))
        message = _clean_meta_preamble(raw_message, command)
        findings = _extract_structured_findings(chunks) if chunks else []

        return {
            "agent": self.name, "task_type": "telemetry_analysis",
            "message": message,
            "thought_process": thought_process,
            "assessment": "ATTENTION" if any(w in command.lower() for w in ["anomaly", "alert", "high", "abnormal", "fault"]) else "NORMAL",
            "findings": findings,
            "evidence": [{"document": c["document"], "page": c["page"], "score": round(c["score"], 3),
                          "excerpt": c["text"][:200], "section": c.get("section")} for c in chunks] if chunks else [],
            "confidence": 0.78,
            "confidence_breakdown": None, "contradiction": None, "retries": 0, "checklist_items": [],
            "model": target_model,
        }


# ── 4. Engineering Calculations ───────────────────────────────────────────────

class EngineeringAgent(BaseAgent):
    name = "EngineeringAgent"
    description = "Engineering calculations and analysis agent"
    capabilities = ["Hydraulic calculations", "Power analysis", "Load calculations", "Thermodynamics"]

    async def execute(self, command: str, model: str = _MODEL_RAG, history: list = None, **kwargs) -> dict:
        target_model = model or _MODEL_RAG
        chunks = retrieve(command, top_k=3)

        system = (
            "You are an industrial engineering calculation agent for MRPL refinery. "
            "Maintain full conversational memory: if the user refers to previously discussed equipment or parameters, use them directly in your calculations."
        )
        prompt = f"""Current user query: "{command}"

{"Relevant document context:" + chr(10) + chr(10).join(f"[Source {i+1}] {c['text'][:400]}" for i, c in enumerate(chunks)) if chunks else ""}

Provide a precise engineering response:
1. Identify the calculation or engineering concept requested
2. Show the relevant formula or method. Format standalone formulas in clean LaTeX blocks:
$$
\\text{{Formula}} = \\text{{Expression}}
$$
3. Provide the calculation with step-by-step substitution and units
4. State the result clearly with appropriate engineering units
5. Note any safety margins or standards (API, ASME, IS) that apply"""

        raw_message, thought_process = await _ollama(prompt, target_model, num_predict=4096, system=system, history=history, thought_queue=kwargs.get("thought_queue"))
        message = _clean_meta_preamble(raw_message, command)

        return {
            "agent": self.name, "task_type": "engineering_calculation",
            "message": message,
            "thought_process": thought_process, "assessment": None,
            "findings": [{"finding": f"Engineering query: {command}", "value": None, "reference": "Calculated"}],
            "evidence": [{"document": c["document"], "page": c["page"], "score": round(c["score"], 3),
                          "excerpt": c["text"][:200], "section": c.get("section")} for c in chunks] if chunks else [],
            "confidence": 0.90, "confidence_breakdown": None, "contradiction": None, "retries": 0, "checklist_items": [],
            "model": target_model,
        }


# ── 5. Report Generation ──────────────────────────────────────────────────────

class ReportAgent(BaseAgent):
    name = "ReportAgent"
    description = "Professional industrial report generation agent"
    capabilities = ["Inspection reports", "Maintenance reports", "Incident reports", "Summary reports"]

    async def execute(self, command: str, model: str = _MODEL_RAG, history: list = None, **kwargs) -> dict:
        target_model = model or _MODEL_RAG
        chunks = retrieve(command, top_k=5)

        system = (
            "You are a professional industrial report writer for MRPL (Mangalore Refinery and Petrochemicals Limited). "
            "Generate structured reports using details from prior conversation if the user requests a report on previously discussed equipment, inspections, or findings."
        )
        evidence_text = "\n\n".join(f"[Source {i+1}] Document: {c['document']}, Page: {c['page']}\n{c['text'][:400]}"
                                     for i, c in enumerate(chunks)) if chunks else "No documents indexed."

        prompt = f"""Task: Generate a structured report based on: "{command}"

Available evidence:
{evidence_text}

Write a professional report with these sections:
1. EXECUTIVE SUMMARY (2-3 sentences)
2. FINDINGS (bullet points of key findings)
3. RECOMMENDATIONS (actionable items)
4. CONCLUSION (1-2 sentences)"""

        raw_message, thought_process = await _ollama(prompt, target_model, num_predict=4096, system=system, history=history, thought_queue=kwargs.get("thought_queue"))
        message = _clean_meta_preamble(raw_message, command)
        findings = _extract_structured_findings(chunks) if chunks else []

        return {
            "agent": self.name, "task_type": "report_generation",
            "message": message,
            "thought_process": thought_process, "assessment": None,
            "findings": findings,
            "evidence": [{"document": c["document"], "page": c["page"], "score": round(c["score"], 3),
                          "excerpt": c["text"][:200], "section": c.get("section")} for c in chunks] if chunks else [],
            "confidence": 0.85, "confidence_breakdown": None, "contradiction": None, "retries": 0, "checklist_items": [],
            "model": target_model,
        }


# ── 6. Code Execution / Code Lab ─────────────────────────────────────────────

class CodeAgent(BaseAgent):
    name = "CodeAgent"
    description = "Industrial code generation and debugging agent"
    capabilities = ["Python scripting", "Data processing", "Calculation scripts", "PLC logic", "Code debugging"]

    async def execute(self, command: str, model: str = _MODEL_CODE, history: list = None, **kwargs) -> dict:
        target_model = model or _MODEL_CODE

        system = (
            "You are an industrial automation and data processing code agent for MRPL refinery. "
            "If the user asks to write or debug code for previously discussed data or parameters, use the context from earlier messages."
        )
        prompt = f"""Current User Request: "{command}"

Generate clean, working code to solve this. Focus on:
- Python for data analysis, calculations, or automation scripts
- Include comments explaining each step
- Use standard libraries (numpy, pandas, math) where appropriate
- For industrial calculations, include unit conversions and safety checks
- If it's a PLC/SCADA related request, provide structured logic"""

        raw_message, thought_process = await _ollama(prompt, target_model, num_predict=4096, system=system, history=history, thought_queue=kwargs.get("thought_queue"))
        message = _clean_meta_preamble(raw_message, command)
        return {
            "agent": self.name, "task_type": "code_execution",
            "message": message,
            "thought_process": thought_process, "assessment": None,
            "findings": [{"finding": "Code generated for: " + command[:80], "value": None, "reference": "CodeAgent"}],
            "evidence": [], "confidence": 0.88,
            "confidence_breakdown": None, "contradiction": None, "retries": 0, "checklist_items": [],
            "model": target_model,
        }


# ── 7. Knowledge Search ───────────────────────────────────────────────────────

class KnowledgeSearchAgent(BaseAgent):
    name = "KnowledgeSearch"
    description = "Industrial knowledge base search and retrieval agent"
    capabilities = ["Document search", "Knowledge retrieval", "Cross-document analysis", "Fact extraction"]

    async def execute(self, command: str, model: str = _MODEL_RAG, history: list = None, **kwargs) -> dict:
        target_model = model or _MODEL_RAG
        chunks = retrieve(command, top_k=6)

        if not chunks:
            system = (
                "You are GRAVION, an AI assistant specialized in petrochemical and refinery operations for MRPL (Mangalore Refinery and Petrochemicals Limited). "
                "Maintain full conversational context: if the user's question references previous equipment or findings, seamlessly incorporate that context."
            )
            raw_message, thought_process = await _ollama(command, target_model, num_predict=4096, system=system, history=history, thought_queue=kwargs.get("thought_queue"))
            message = _clean_meta_preamble(raw_message, command)
            return {
                "agent": self.name, "task_type": "knowledge_search",
                "message": message,
            "thought_process": thought_process,
                "assessment": None, "findings": [], "evidence": [],
                "confidence": 0.70, "confidence_breakdown": None, "contradiction": None, "retries": 0, "checklist_items": [],
                "model": target_model,
            }

        result = await synthesize(command, chunks, model=target_model, history=history, thought_queue=kwargs.get("thought_queue"))
        evidence = [{"document": c["document"], "page": c["page"], "score": round(c["score"], 3),
                     "excerpt": c["text"][:300], "section": c.get("section"),
                     "vector_score": round(c.get("vector_score", c["score"]), 3),
                     "section_boost": round(c.get("section_boost", 0.0), 3)} for c in chunks]

        return {
            "agent": self.name, "task_type": "knowledge_search",
            "message": result["answer"], "thought_process": result.get("thought_process", ""),
            "assessment": result["assessment"],
            "findings": result.get("findings", []), "checklist_items": result.get("checklist_items", []),
            "evidence": evidence, "confidence": 0.82,
            "confidence_breakdown": None,
            "contradiction": result.get("consistency", {}).get("contradiction"), "retries": result.get("retries", 0),
            "model": target_model,
        }


# ── 8. General / Conversational ───────────────────────────────────────────────

_GREETING_TRIGGERS = {"hi", "hello", "hey", "howdy", "greetings", "sup", "yo"}

def _is_greeting(command: str) -> bool:
    text = command.lower().strip()
    words = text.split()
    if len(words) > 4:
        return False
    first = words[0] if words else ""
    for trigger in _GREETING_TRIGGERS:
        if first == trigger or (first.startswith(trigger) and len(first) <= len(trigger) + 3):
            return True
    return any(text.startswith(p) for p in ["good morning", "good afternoon", "good evening", "hi there", "hello there", "hey there"])


class GeneralAgent(BaseAgent):
    name = "GeneralAgent"
    description = "Conversational and general petrochemical knowledge agent"
    capabilities = ["Greetings", "General Q&A", "Petrochemical knowledge", "Refinery operations"]

    async def execute(self, command: str, model: str = _MODEL_RAG, history: list = None, **kwargs) -> dict:
        target_model = model or _MODEL_RAG
        is_greeting = _is_greeting(command) and not history
        thought_process = ""

        if is_greeting:
            message = "Hi! I'm GRAVION, your AI assistant for MRPL (Mangalore Refinery and Petrochemicals Limited). I can help you with document analysis, equipment inspection, telemetry analysis, engineering calculations, report generation, code execution, and knowledge search. How can I assist you today?"
        else:
            system = (
                "You are GRAVION, an AI assistant for MRPL (Mangalore Refinery and Petrochemicals Limited). "
                "You possess extensive petrochemical, refinery engineering, operations, and equipment maintenance knowledge. "
                "You are continuing an ongoing conversation. ALWAYS prioritize answering based on the context, documents, telemetry, or inspection findings discussed earlier in the chat history. "
                "Seamlessly recall and reference previous data provided by the assistant instead of giving generic answers. "
                "Answer the user's message directly, accurately, and professionally (3-6 sentences) without unnecessary robotic preambles."
            )
            raw_message, thought_process = await _ollama(command, target_model, num_predict=4096, system=system, history=history)
            message = _clean_meta_preamble(raw_message, command)

        return {
            "agent": self.name, "task_type": "general",
            "message": message,
            "thought_process": thought_process, "assessment": None,
            "findings": [], "evidence": [], "confidence": 0.90,
            "confidence_breakdown": None, "contradiction": None, "retries": 0, "checklist_items": [],
            "model": target_model,
        }

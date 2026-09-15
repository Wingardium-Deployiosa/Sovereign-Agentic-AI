"""
Synthesizer: RAG prompt -> explanation text -> rule-determined assessment.

Architecture:
  Evidence -> Rule Engine  -> Assessment (deterministic, always wins)
  Evidence -> Ollama LLM   -> Explanation text only
  Retry    -> Specific correction prompt with actual evidence values

The LLM is NEVER trusted for the assessment verdict.
"""
from __future__ import annotations
import re
import json
import httpx
import asyncio
from backend.rag import evidence_consistency

MAX_RETRIES = 2

_OLLAMA_URL = "http://localhost:11434/api/generate"
_MODEL_NAME = "qwen2.5:7b-instruct-q4_K_M"


async def _ollama_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            await client.get("http://localhost:11434/api/tags")
        return True
    except Exception:
        return False


def _build_prompt(
    question: str,
    chunks: list[dict],
    rule_assessment: str,
    correction_note: str = "",
) -> str:
    evidence_blocks = "\n\n".join(
        f"[Source {i+1}]\nDocument: {c['document']}\nPage: {c['page']}\n{c['text'][:500]}"
        for i, c in enumerate(chunks[:5])
    )

    # Tell the LLM the assessment has already been determined
    assessment_constraint = (
        f"\nASSESSMENT ALREADY DETERMINED BY EVIDENCE RULES: {rule_assessment}\n"
        "Do NOT change or contradict this assessment in your answer.\n"
    )

    correction_block = ""
    if correction_note:
        correction_block = (
            f"\n\nPREVIOUS ANSWER REJECTED — CORRECTION REQUIRED:\n{correction_note}\n"
            "Rewrite the answer to accurately reflect the evidence above.\n"
            "Do NOT describe the equipment as normal, healthy, or in good condition.\n"
        )

    return f"""You are DocReason, an industrial document analysis agent.

Write a concise 2-3 sentence explanation answering the user's question using ONLY the supplied evidence.

CRITICAL RULES:
1. Never contradict explicit assessment statements in the evidence.
2. If evidence states ATTENTION REQUIRED, ABNORMAL, HIGH risk — preserve that.
3. Mention all elevated readings and their reference values.
4. Do not describe equipment as normal/good if evidence shows alerts.
5. Preserve all numerical values exactly as they appear.
6. Return ONLY valid JSON — no extra text before or after.
{assessment_constraint}
Return this exact JSON structure:
{{
  "answer": "2-3 sentence explanation grounded strictly in the evidence",
  "findings": [
    {{"finding": "description", "value": "measured value or null", "reference": "limit/range or null"}}
  ],
  "evidence_used": [{{"document": "filename.pdf", "page": 1}}]
}}{correction_block}

USER QUESTION:
{question}

EVIDENCE:
{evidence_blocks}

JSON:"""


async def _generate_raw(prompt: str, model: str, history: list = None, thought_queue: asyncio.Queue = None) -> tuple[str, str]:
    messages = []
    if history:
        for h in history:
            role = "user" if (getattr(h, "role", "") == "user" or (isinstance(h, dict) and h.get("role") == "user")) else "assistant"
            txt = getattr(h, "text", "") or (h.get("text", "") if isinstance(h, dict) else "")
            if txt:
                messages.append({"role": role, "content": txt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "stream": True if thought_queue else False,
        "options": {"temperature": 0.1, "num_predict": 500},
    }
    
    if not thought_queue:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post("http://localhost:11434/api/chat", json=payload)
            resp.raise_for_status()
        
        data = resp.json()
        content = data.get("message", {}).get("content", "").strip()
    else:
        content = ""
        in_think = False
        think_done = False
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", "http://localhost:11434/api/chat", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip(): continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    token = data.get("message", {}).get("content", "")
                    
                    if not token:
                        thinking_token = data.get("message", {}).get("thinking", "")
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
                            
                        # If we are inside think block, or just outputting </think>, stream it as thought
                        await thought_queue.put(token)
                        
    clean = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    clean = re.sub(r"<think>.*$", "", clean, flags=re.DOTALL).strip()
    thought_match = re.search(r"<think>(.*?)(?:</think>|$)", content, flags=re.DOTALL)
    thought = thought_match.group(1).strip() if thought_match else ""
    return clean, thought



def _parse(raw: str, chunks: list[dict]) -> dict:
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group())
            if isinstance(data, dict) and isinstance(data.get("answer"), str) and len(data["answer"]) > 10:
                normalised = []
                for f in data.get("findings", []):
                    if isinstance(f, str):
                        normalised.append({"finding": f, "value": None, "reference": None})
                    elif isinstance(f, dict):
                        normalised.append({
                            "finding": f.get("finding", str(f)),
                            "value": f.get("value"),
                            "reference": f.get("reference"),
                        })
                data["findings"] = normalised
                return data
        except json.JSONDecodeError:
            pass
    
    extractive = _extractive_structured(chunks)
    # If the smaller model fails to produce JSON, preserve its raw text as the answer!
    clean_raw = re.sub(r'```json\s*', '', raw)
    clean_raw = re.sub(r'```\s*', '', clean_raw).strip()
    if clean_raw and not clean_raw.startswith("{"):
        extractive["answer"] = clean_raw
        
    return extractive


def _extractive_structured(chunks: list[dict]) -> dict:
    """Build structured output from chunks without LLM."""
    all_sentences: list[tuple[float, str]] = []
    for chunk in chunks:
        for sent in re.split(r'(?<=[.!?])\s+', chunk["text"]):
            sent = sent.strip()
            if len(sent) >= 30:
                all_sentences.append((chunk.get("score", 0.5), sent))

    all_sentences.sort(key=lambda x: x[0], reverse=True)
    top_sents = [s for _, s in all_sentences[:6]]

    structured_findings = evidence_consistency._extract_structured_findings(chunks)
    if not structured_findings:
        structured_findings = [{"finding": s, "value": None, "reference": None} for s in top_sents[:4]]

    evidence_used = list(dict.fromkeys((c["document"], c["page"]) for c in chunks))
    answer = " ".join(top_sents[:2])

    return {
        "answer": answer[:600],
        "findings": structured_findings,
        "evidence_used": [{"document": d, "page": p} for d, p in evidence_used],
    }


async def synthesize(question: str, chunks: list[dict], model: str = _MODEL_NAME, history: list = None, thought_queue: asyncio.Queue = None) -> dict:
    """
    Returns {answer, assessment, findings, evidence_used, consistency, retries}.

    Assessment is ALWAYS from the rule engine — never from the LLM.
    On retry, the correction prompt includes the actual evidence values.
    """
    # ── Step 1: Deterministic assessment (rule engine + explicit document verdict) ──
    rule_assessment = evidence_consistency.determine_assessment(chunks)
    rule_findings = evidence_consistency._extract_structured_findings(chunks)
    checklist_items = evidence_consistency.extract_checklist_items(chunks)

    # ── Step 2: LLM explanation text ──
    if not await _ollama_available():
        result = _extractive_structured(chunks)
        result["retries"] = 0
    else:
        correction_note = ""
        result = _extractive_structured(chunks)
        thought_process = ""
        for attempt in range(MAX_RETRIES + 1):
            prompt = _build_prompt(question, chunks, rule_assessment, correction_note)
            raw, tp = await _generate_raw(prompt, model, history, thought_queue)
            if tp:
                thought_process += tp + "\n"
            result = _parse(raw, chunks)

            check = evidence_consistency.check(result["answer"], rule_assessment, chunks)
            result["retries"] = attempt

            if check["consistent"]:
                break

            # Build a specific correction note with actual evidence values for next attempt
            correction_note = check["contradiction"]
            print(f"[synthesizer] Attempt {attempt + 1} answer rejected.")
        else:
            # All retries exhausted — use deterministic grounded answer
            print(f"[synthesizer] All retries exhausted. Using grounded fallback.")
            result["answer"] = evidence_consistency.build_grounded_answer(chunks)
            result["retries"] = MAX_RETRIES

    # ── Step 3: Rule assessment always wins; merge findings ──
    llm_findings = result.get("findings", [])
    merged_findings = rule_findings[:]
    seen_texts = {f["finding"][:50] for f in rule_findings}
    for f in llm_findings:
        if f["finding"][:50] not in seen_texts:
            merged_findings.append(f)
            seen_texts.add(f["finding"][:50])

    final_consistency = evidence_consistency.check(result["answer"], rule_assessment, chunks)

    return {
        "answer": result["answer"],
        "assessment": rule_assessment,
        "findings": merged_findings[:6],
        "checklist_items": checklist_items,
        "evidence_used": result.get("evidence_used", []),
        "consistency": final_consistency,
        "retries": result.get("retries", 0),
        "thought_process": locals().get("thought_process", "").strip(),
    }

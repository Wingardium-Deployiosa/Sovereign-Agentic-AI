import re
import json
import httpx
import urllib.parse
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

_OLLAMA_URL  = "http://localhost:11434/api/chat"
_MODEL       = "qwen2.5:7b-instruct-q4_K_M"

_SYSTEM = (
    "You are a Python engineer writing industrial calculation scripts for MRPL "
    "(Mangalore Refinery and Petrochemicals Limited).\n"
    "Output ONLY raw Python code — no markdown, no triple backticks, no explanation.\n"
    "Requirements:\n"
    "- Standard library only: math, statistics, itertools, collections, datetime, random\n"
    "- All input values hardcoded as named constants at the top with unit comments\n"
    "- Every variable defined before it is used\n"
    "- Every result printed with print() including units\n"
    "- No user input(), no placeholders, no '...', no TODO\n"
    "- Script runs completely on its own from top to bottom\n"
    "- Start the very first line with 'import' or '#' — never with prose"
)

# Standard library imports to auto-inject if missing
_AUTO_IMPORTS = {
    "math":        "import math",
    "statistics":  "import statistics",
    "itertools":   "import itertools",
    "functools":   "import functools",
    "random":      "import random",
    "collections": "from collections import defaultdict, Counter",
    "datetime":    "from datetime import datetime, timedelta",
    "time":        "import time",
    "re":          "import re",
    "json":        "import json",
    "csv":         "import csv",
}


def _clean(raw: str) -> str:
    """Strip markdown fences and prose, inject missing imports."""
    code = raw.strip()

    # Remove ```python ... ``` or ``` ... ```
    code = re.sub(r"^```(?:python)?\s*\n?", "", code, flags=re.IGNORECASE)
    code = re.sub(r"\n?```\s*$", "", code)
    code = code.strip()

    # If model still prepended prose before the first import/def/#, strip it
    first_code = re.search(r"^(import |from |#|def |class |\w+ ?=)", code, re.MULTILINE)
    if first_code and first_code.start() > 0:
        code = code[first_code.start():]

    # Auto-inject missing imports
    inject = []
    for name, stmt in _AUTO_IMPORTS.items():
        already = re.search(
            rf"^\s*(import {name}|from {name}\b)", code, re.MULTILINE
        )
        if not already and re.search(rf"\b{name}\.", code):
            inject.append(stmt)
    if inject:
        code = "\n".join(inject) + "\n\n" + code

    return code.strip()


async def _generate(prompt: str, model: str) -> str:
    """Call Ollama chat API (non-streaming) and return cleaned code."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user",   "content": prompt},
        ],
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 1500,
            "top_p": 0.9,
            "repeat_penalty": 1.1,
        },
    }
    async with httpx.AsyncClient(timeout=180) as c:
        resp = await c.post(_OLLAMA_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()
        raw = data.get("message", {}).get("content", "")
        return _clean(raw)


async def _stream_response(prompt: str, model: str):
    """
    Stream progress tokens to keep the UI alive, then send the final code.
    We stream the generation token-by-token using Ollama's stream=True,
    accumulate the full response, clean it, and emit __CODE_DONE__ at the end.
    """
    full = ""
    try:
        async with httpx.AsyncClient(timeout=180) as c:
            async with c.stream("POST", _OLLAMA_URL, json={
                "model": model,
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user",   "content": prompt},
                ],
                "stream": True,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 1500,
                    "top_p": 0.9,
                    "repeat_penalty": 1.1,
                },
            }) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except Exception:
                        continue
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        full += token
                        # Stream token to editor (newlines escaped for SSE)
                        yield f"data: {token.replace(chr(10), '__NL__')}\n\n"
                    if chunk.get("done"):
                        break
    except Exception as e:
        yield f"data: __ERROR__:{e}\n\n"
        return

    # Clean the full accumulated code and send final version
    code = _clean(full)
    yield f"data: __CODE_DONE__:{urllib.parse.quote(code)}\n\n"


class GenerateRequest(BaseModel):
    prompt: str
    model: str = _MODEL


@router.post("/generate-code")
async def generate_code(req: GenerateRequest):
    return StreamingResponse(
        _stream_response(req.prompt, req.model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

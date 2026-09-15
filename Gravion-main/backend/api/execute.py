import sys
import time
import subprocess
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

TIMEOUT = 15       # seconds
MAX_CHARS = 50_000
_executor = ThreadPoolExecutor(max_workers=4)


class ExecuteRequest(BaseModel):
    code: str


def _run_code_sync(code: str) -> tuple[list[str], int, float]:
    """Run Python code synchronously in a subprocess. Returns (lines, exit_code, elapsed)."""
    start = time.monotonic()
    lines: list[str] = []
    try:
        proc = subprocess.Popen(
            [sys.executable, "-u", "-c", code],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        total = 0
        try:
            for line in iter(proc.stdout.readline, ""):
                line = line.rstrip("\n")
                total += len(line)
                if total > MAX_CHARS:
                    lines.append(f"[Output truncated at {MAX_CHARS} chars]")
                    proc.kill()
                    break
                lines.append(line)
            proc.stdout.close()
            proc.wait(timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            lines.append("")
            lines.append(f"⏱ Execution timed out after {TIMEOUT}s")
            return lines, -1, round(time.monotonic() - start, 3)
    except Exception as e:
        lines.append(f"❌ Execution error: {e}")
        return lines, -1, round(time.monotonic() - start, 3)

    elapsed = round(time.monotonic() - start, 3)
    return lines, proc.returncode or 0, elapsed


async def _stream_exec(code: str):
    loop = asyncio.get_event_loop()
    lines, exit_code, elapsed = await loop.run_in_executor(
        _executor, _run_code_sync, code
    )
    for line in lines:
        yield f"data: {line}\n\n"
    yield f"data: __DONE__:{exit_code}:{elapsed}\n\n"


@router.post("/execute")
async def execute_code(req: ExecuteRequest):
    return StreamingResponse(
        _stream_exec(req.code),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

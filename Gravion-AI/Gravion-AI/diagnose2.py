import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from backend.rag.evidence_consistency import (
    determine_assessment, resolve_explicit_assessment,
    _extract_structured_findings, build_grounded_answer
)

chunks = json.load(open('backend/data/vector_store/chunks.json'))

print("EXPLICIT:", resolve_explicit_assessment(chunks))
print("RULE:", determine_assessment(chunks))
print()
print("FINDINGS:")
for f in _extract_structured_findings(chunks):
    print(" ", f)
print()
print("GROUNDED ANSWER:")
print(build_grounded_answer(chunks))
print()
print("CHUNK SUMMARIES:")
for i, c in enumerate(chunks):
    print(f"[{i}] p{c['page']} section={c.get('section','')!r}")
    # Print first 200 chars, replacing non-ascii safely
    safe = c['text'][:200].encode('ascii', errors='replace').decode('ascii')
    print(f"    {safe!r}")

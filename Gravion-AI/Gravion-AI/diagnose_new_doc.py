import json
from backend.rag.evidence_consistency import (
    determine_assessment, resolve_explicit_assessment,
    _extract_structured_findings, build_grounded_answer
)
from backend.rag.retriever import retrieve

chunks = json.load(open('backend/data/vector_store/chunks.json'))

print("=== All chunk text ===")
for i, c in enumerate(chunks):
    print(f"\n[{i}] page={c['page']} section={c.get('section','')!r}")
    print(c['text'])

print("\n=== Explicit assessment ===")
print(resolve_explicit_assessment(chunks))

print("\n=== Rule assessment ===")
print(determine_assessment(chunks))

print("\n=== Structured findings ===")
for f in _extract_structured_findings(chunks):
    print(f"  {f}")

print("\n=== Grounded answer ===")
print(build_grounded_answer(chunks))

print("\n=== Retrieved chunks for overall condition query ===")
results = retrieve("What is the overall condition of the pump?", top_k=5)
for r in results:
    print(f"  score={r['score']:.3f} section={r.get('section','')!r} boost={r.get('section_boost',0):.3f}")
    print(f"  {r['text'][:120]!r}")

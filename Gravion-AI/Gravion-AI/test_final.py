import json, urllib.request

req = urllib.request.Request(
    "http://127.0.0.1:8000/api/command",
    data=json.dumps({"message": "What is the overall condition of pump P-204A?"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as r:
    d = json.load(r)

print("ASSESSMENT:", d["assessment"])
print("ANSWER:", d["message"])
print("RETRIES:", d["retries"])
print("CONTRADICTION:", d["contradiction"])
print()
print("EVIDENCE:")
for e in d.get("evidence", []):
    print(f"  p{e['page']} section={e.get('section','')} boost={e.get('section_boost',0)} score={e['score']}")
print()
print("FINDINGS:")
for f in d.get("findings", []):
    print(f"  {f['finding']} | val={f.get('value')} ref={f.get('reference')}")
print()
bd = d.get("confidence_breakdown", {})
if bd:
    print(f"CONFIDENCE: {d['confidence']}")
    print(f"  retrieval_relevance: {bd['retrieval_relevance']}")
    print(f"  source_coverage:     {bd['source_coverage']}")
    print(f"  consistency:         {bd['consistency']}")
    print(f"  answer_grounding:    {bd['answer_grounding']}")

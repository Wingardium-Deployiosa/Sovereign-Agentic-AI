import json

chunks = json.load(open('backend/data/vector_store/chunks.json'))
print(f"{len(chunks)} chunks\n")
for i, c in enumerate(chunks):
    print(f"[{i}] p{c['page']} section={c.get('section','')!r:30} {c['text'][:100]!r}")

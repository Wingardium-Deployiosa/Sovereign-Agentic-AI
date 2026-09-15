from backend.rag.retriever import retrieve
from backend.rag.synthesizer import synthesize

question = "What is the overall condition of pump P-204A and what actions are recommended?"
chunks = retrieve(question, top_k=3)
print(f"Retrieved {len(chunks)} chunks")
for c in chunks:
    print(f"  {c['document']} page {c['page']} score {round(c['score'],3)}")

print("\nSynthesizing answer with Qwen...\n")
answer = synthesize(question, chunks)
print("ANSWER:")
print(answer)

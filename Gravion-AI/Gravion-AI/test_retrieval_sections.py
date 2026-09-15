from backend.rag.retriever import retrieve

queries = [
    "What is the overall condition of pump P-204A?",
    "What are the vibration readings?",
    "What maintenance actions are recommended?",
]

for q in queries:
    print(f"\nQUERY: {q}")
    results = retrieve(q, top_k=5)
    for r in results:
        print(f"  score={r['score']:.3f} vec={r.get('vector_score', r['score']):.3f} "
              f"boost={r.get('section_boost', 0):.3f} section={r.get('section', '')!r:25} "
              f"| {r['text'][:60]!r}")

"""
Section-aware retriever.
Retrieves by vector similarity then re-ranks by section relevance to the query.
"""
from __future__ import annotations
import re
from .embeddings import embed_query
from . import vector_store

# Query intent → section labels to boost
# Each entry: (query pattern, [section labels], boost amount)
_INTENT_BOOSTS: list[tuple[re.Pattern, list[str], float]] = [
    (re.compile(r"overall.{0,20}(condition|status|assessment|health)", re.I),
     ["overall_assessment", "risk_assessment"], 0.15),

    (re.compile(r"(vibration|oscillation|imbalance)", re.I),
     ["vibration_analysis", "overall_assessment"], 0.12),

    (re.compile(r"(temperature|thermal|heat|bearing)", re.I),
     ["bearing_data", "operating_condition"], 0.12),

    (re.compile(r"(seal|leak|leakage|drop)", re.I),
     ["seal_data", "operating_condition"], 0.12),

    (re.compile(r"(recommend|action|should|fix|repair|maintenance)", re.I),
     ["recommended_actions", "maintenance_work"], 0.12),

    (re.compile(r"(risk|danger|critical|urgent|priority)", re.I),
     ["risk_assessment", "overall_assessment"], 0.12),

    (re.compile(r"(what.{0,10}(done|performed|work)|maintenance history)", re.I),
     ["maintenance_work"], 0.12),
]


def _section_boost(query: str, section: str) -> float:
    """Return a score boost for a chunk based on query intent vs chunk section."""
    if not section:
        return 0.0
    for pattern, sections, boost in _INTENT_BOOSTS:
        if pattern.search(query) and section in sections:
            return boost
    return 0.0


def retrieve(query: str, top_k: int = 5) -> list[dict]:
    """
    Retrieve top_k chunks by vector similarity, then re-rank with section boost.
    Returns chunks sorted by (vector_score + section_boost), descending.
    """
    q_vec = embed_query(query)
    # Fetch more candidates so re-ranking has room to promote section matches
    candidates = vector_store.search(q_vec, top_k=min(top_k * 3, 20))

    for chunk in candidates:
        boost = _section_boost(query, chunk.get("section", ""))
        chunk["vector_score"] = chunk["score"]
        chunk["section_boost"] = boost
        chunk["score"] = round(chunk["score"] + boost, 4)

    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates[:top_k]

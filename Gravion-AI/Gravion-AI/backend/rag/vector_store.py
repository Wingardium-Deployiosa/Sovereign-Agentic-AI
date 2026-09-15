"""
FAISS-backed local vector store. Fully sovereign — no cloud, no database server.
Index + metadata stored in backend/data/vector_store/
"""
import json
import numpy as np
import faiss
from pathlib import Path

_STORE_DIR = Path("backend/data/vector_store")
_INDEX_FILE = _STORE_DIR / "index.faiss"
_CHUNKS_FILE = _STORE_DIR / "chunks.json"

_index: faiss.IndexFlatIP | None = None
_chunks: list[dict] = []


def _load():
    global _index, _chunks
    if _index is not None:          # already loaded — skip disk read
        return
    if _INDEX_FILE.exists() and _CHUNKS_FILE.exists():
        _index = faiss.read_index(str(_INDEX_FILE))
        _chunks = json.loads(_CHUNKS_FILE.read_text())
    else:
        _index = None
        _chunks = []


def _save():
    _STORE_DIR.mkdir(parents=True, exist_ok=True)
    faiss.write_index(_index, str(_INDEX_FILE))
    _CHUNKS_FILE.write_text(json.dumps(_chunks))


def add(chunks: list[dict], vectors: np.ndarray) -> None:
    global _index, _chunks
    _load()
    dim = vectors.shape[1]
    if _index is None:
        _index = faiss.IndexFlatIP(dim)  # Inner product = cosine on normalized vecs
    _index.add(vectors.astype(np.float32))
    _chunks.extend(chunks)
    _save()


def delete_document(document_name: str) -> None:
    global _index, _chunks
    _load()
    if not _chunks:
        return
    keep_idx = [i for i, c in enumerate(_chunks) if c["document"] != document_name]
    if not keep_idx:
        _index = None
        _chunks = []
        _INDEX_FILE.unlink(missing_ok=True)
        _CHUNKS_FILE.unlink(missing_ok=True)
        return
    # Rebuild index with kept vectors
    all_vecs = np.vstack([_index.reconstruct(i) for i in keep_idx]).astype(np.float32)
    dim = all_vecs.shape[1]
    _index = faiss.IndexFlatIP(dim)
    _index.add(all_vecs)
    _chunks = [_chunks[i] for i in keep_idx]
    _save()


def search(query_vector: np.ndarray, top_k: int = 5) -> list[dict]:
    global _index, _chunks
    _load()
    if _index is None or _index.ntotal == 0:
        return []
    k = min(top_k, _index.ntotal)
    scores, indices = _index.search(query_vector.reshape(1, -1).astype(np.float32), k)
    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx >= 0:
            results.append({**_chunks[idx], "score": float(score)})
    return results


def list_documents() -> list[str]:
    _load()
    return list({c["document"] for c in _chunks})


def count() -> int:
    _load()
    return len(_chunks)

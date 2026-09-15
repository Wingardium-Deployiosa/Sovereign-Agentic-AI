from sentence_transformers import SentenceTransformer
import numpy as np
from pathlib import Path

# Use local HuggingFace cache — never download from internet
_MODEL_NAME  = "BAAI/bge-small-en-v1.5"
_CACHE_DIR   = Path.home() / ".cache" / "huggingface" / "hub"
_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME, cache_folder=str(_CACHE_DIR))
    return _model


def embed(texts: list[str]) -> np.ndarray:
    return _get_model().encode(texts, convert_to_numpy=True, show_progress_bar=False, normalize_embeddings=True)


def embed_query(text: str) -> np.ndarray:
    return _get_model().encode(
        _QUERY_PREFIX + text,
        convert_to_numpy=True,
        show_progress_bar=False,
        normalize_embeddings=True,
    )

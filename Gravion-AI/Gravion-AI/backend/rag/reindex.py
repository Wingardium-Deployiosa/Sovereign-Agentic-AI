"""
One-time script to re-index all documents in the uploads folder.
Run from project root: python -m backend.rag.reindex
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.rag import loader, chunker, embeddings, vector_store

UPLOAD_DIR = Path("backend/data/uploads")

def main():
    pdfs = list(UPLOAD_DIR.glob("*"))
    if not pdfs:
        print("No files found in uploads/")
        return

    for f in pdfs:
        print(f"Processing: {f.name}")
        try:
            pages = loader.load(str(f))
            print(f"  Pages loaded: {len(pages)}")
            chunks = chunker.chunk(pages)
            print(f"  Chunks created: {len(chunks)}")
            vecs = embeddings.embed([c["text"] for c in chunks])
            print(f"  Embeddings shape: {vecs.shape}")
            vector_store.delete_document(f.name)
            vector_store.add(chunks, vecs)
            print(f"  Indexed OK. Total chunks: {vector_store.count()}")
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback; traceback.print_exc()

if __name__ == "__main__":
    main()

from fastapi import APIRouter, UploadFile, File, HTTPException
from pathlib import Path
from backend.models.schemas import UploadResponse, DocumentsResponse
from backend.rag import loader, chunker, embeddings, vector_store
from backend.api.audit import AuditLogger

router = APIRouter()

# Always resolve relative to this file — works regardless of cwd
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "data" / "uploads"
ALLOWED = {".pdf", ".txt", ".docx"}


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(400, f"Unsupported file type: {suffix}. Allowed: {ALLOWED}")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Save file to disk
    dest = UPLOAD_DIR / file.filename
    file_bytes = await file.read()
    dest.write_bytes(file_bytes)
    AuditLogger.log("upload", "Gravion Admin", "Document uploaded", f"{file.filename} saved to {UPLOAD_DIR.name}/", "ok")
    print(f"[upload] Saved file: {dest} ({len(file_bytes)} bytes)")

    # Remove old index entries for this file
    vector_store.delete_document(file.filename)

    # Load pages
    try:
        pages = loader.load(str(dest))
        print(f"[upload] Loaded {len(pages)} pages from {file.filename}")
    except Exception as e:
        raise HTTPException(500, f"Failed to load document: {e}")

    if not pages:
        raise HTTPException(400, "Document appears to be empty or unreadable.")

    # Chunk
    try:
        chunks = chunker.chunk(pages)
        print(f"[upload] Created {len(chunks)} chunks")
    except Exception as e:
        raise HTTPException(500, f"Failed to chunk document: {e}")

    # Embed
    try:
        texts = [c["text"] for c in chunks]
        vectors = embeddings.embed(texts)
        print(f"[upload] Embedded {len(texts)} chunks, shape: {vectors.shape}")
    except Exception as e:
        raise HTTPException(500, f"Failed to embed document: {e}")

    # Store
    try:
        vector_store.add(chunks, vectors)
        AuditLogger.log("system", "KnowledgeRAG", "Document indexed", f"{file.filename} ({len(chunks)} chunks)", "ok")
        print(f"[upload] Indexed OK. Total chunks in store: {vector_store.count()}")
    except Exception as e:
        AuditLogger.log("system", "KnowledgeRAG", "Document index failed", str(e), "warn")
        raise HTTPException(500, f"Failed to store vectors: {e}")

    return UploadResponse(
        status="success",
        filename=file.filename,
        chunks=len(chunks),
        message=f"Indexed {len(chunks)} chunks from {file.filename}.",
    )


@router.delete("/documents/{filename}")
def delete_document(filename: str):
    vector_store.delete_document(filename)
    dest = UPLOAD_DIR / filename
    if dest.exists():
        dest.unlink()
    return {"status": "success", "message": f"{filename} removed."}


@router.post("/documents/clear")
def clear_all_documents():
    vector_store.clear()
    import shutil
    if UPLOAD_DIR.exists():
        shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    
    AuditLogger.clear()

    return {"status": "success", "message": "All documents, vectors, and logs cleared."}


@router.get("/documents", response_model=DocumentsResponse)
def list_documents():
    docs = vector_store.list_documents()
    total = vector_store.count()
    print(f"[documents] Listing {len(docs)} documents, {total} chunks")
    return DocumentsResponse(documents=docs, total_chunks=total)

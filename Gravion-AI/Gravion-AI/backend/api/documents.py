from fastapi import APIRouter, UploadFile, File, HTTPException
from pathlib import Path
from backend.models.schemas import UploadResponse, DocumentsResponse
from backend.rag import loader, chunker, embeddings, vector_store

router = APIRouter()

UPLOAD_DIR = Path("backend/data/uploads")
ALLOWED = {".pdf", ".txt", ".docx"}


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(400, f"Unsupported file type: {suffix}. Allowed: {ALLOWED}")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Remove existing index entries before writing the new file
    vector_store.delete_document(file.filename)

    dest = UPLOAD_DIR / file.filename
    dest.write_bytes(await file.read())

    # Process
    pages = loader.load(str(dest))
    chunks = chunker.chunk(pages)
    texts = [c["text"] for c in chunks]
    vectors = embeddings.embed(texts)
    vector_store.add(chunks, vectors)

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


@router.get("/documents", response_model=DocumentsResponse)
def list_documents():
    return DocumentsResponse(
        documents=vector_store.list_documents(),
        total_chunks=vector_store.count(),
    )

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from backend.api.command import router as command_router
from backend.api.documents import router as documents_router
from backend.api.inspection import router as inspection_router
from backend.core.config import APP_NAME, VERSION

app = FastAPI(title=APP_NAME, version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=False,
)

app.include_router(command_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(inspection_router, prefix="/api")

@app.get("/")
def serve_ui():
    return FileResponse("frontend/index.html")

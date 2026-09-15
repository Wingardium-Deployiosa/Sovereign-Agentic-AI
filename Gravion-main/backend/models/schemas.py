from pydantic import BaseModel
from typing import List, Optional

class HistoryMessage(BaseModel):
    role: str
    text: str

class CommandRequest(BaseModel):
    message: str
    model: str = 'qwen3:8b'
    image: Optional[str] = None
    history: Optional[List[HistoryMessage]] = None

class EvidenceItem(BaseModel):
    document: str
    page: int
    score: float
    excerpt: str
    section: Optional[str] = None
    vector_score: Optional[float] = None
    section_boost: Optional[float] = None

class FindingItem(BaseModel):
    finding: str
    value: Optional[str] = None
    reference: Optional[str] = None

class ConfidenceBreakdown(BaseModel):
    retrieval_relevance: float
    source_coverage: float
    consistency: bool
    answer_grounding: float
    overall: float

class ChecklistItem(BaseModel):
    point: str
    status: str  # Pass | Attention | Fail | N/A
    remark: Optional[str] = None

class CommandResponse(BaseModel):
    status: str
    command: str
    task_type: str
    agents: List[str]
    message: str
    model: Optional[str] = None
    thought_process: Optional[str] = None
    assessment: Optional[str] = None
    evidence: Optional[List[EvidenceItem]] = None
    findings: Optional[List[FindingItem]] = None
    confidence: Optional[float] = None
    confidence_breakdown: Optional[ConfidenceBreakdown] = None
    contradiction: Optional[str] = None
    retries: Optional[int] = None
    checklist_items: Optional[List[ChecklistItem]] = None

class UploadResponse(BaseModel):
    status: str
    filename: str
    chunks: int
    message: str

class DocumentInfo(BaseModel):
    name: str

class DocumentsResponse(BaseModel):
    documents: List[str]
    total_chunks: int

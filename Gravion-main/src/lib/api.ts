export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api';

export interface EvidenceItem {
  document: string;
  page: number;
  score: number;
  excerpt: string;
  section?: string;
  vector_score?: number;
  section_boost?: number;
}

export interface Finding {
  finding: string;
  value?: string;
  reference?: string;
}

export type ChecklistStatus = 'Pass' | 'Attention' | 'Fail' | 'N/A';

export interface ChecklistItem {
  point: string;
  status: ChecklistStatus;
  remark?: string;
}

export interface ConfidenceBreakdown {
  retrieval_relevance: number;
  source_coverage: number;
  consistency: boolean;
  answer_grounding: number;
  overall: number;
}

export interface CommandResponse {
  status: string;
  command: string;
  task_type: string;
  agents: string[];
  message: string;
  thought_process?: string;
  model?: string;
  assessment?: string;
  evidence?: EvidenceItem[];
  findings?: Finding[];
  confidence?: number;
  confidence_breakdown?: ConfidenceBreakdown;
  contradiction?: string;
  retries?: number;
  checklist_items?: ChecklistItem[];
}

export interface UploadResponse {
  status: string;
  filename: string;
  chunks: number;
  message: string;
}

export interface DocumentsResponse {
  documents: string[];
  total_chunks: number;
}

export interface Observation {
  type: string;
  severity: string;
  location: string;
  description: string;
}

export interface InspectionResponse {
  status: string;
  agent: string;
  equipment_guess?: string;
  observations: Observation[];
  visible_leak: boolean;
  visible_damage: boolean;
  visible_corrosion: boolean;
  overall_visual_condition: string;
  confidence: number;
  raw_description: string;
  fallback_used: boolean;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.message || body?.detail || '';
    } catch {
      // ignore parse failure
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export async function postCommand(
  message: string,
  model = 'qwen3:8b',
  image?: string,
  history?: HistoryMessage[]
): Promise<CommandResponse> {
  const res = await fetch(`${API_BASE_URL}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, model, image, history }),
  });
  return handleResponse<CommandResponse>(res);
}

/** SSE streaming command — calls /command/stream and fires callbacks as tokens arrive. */
export async function streamCommand(
  message: string,
  model: string,
  callbacks: {
    onThought?: (token: string) => void;
    onToken?: (token: string) => void;
    onMeta?: (meta: { task_type: string; agents: string[]; model: string }) => void;
    onComplete?: (data: CommandResponse) => void;
    onError?: (err: string) => void;
  },
  image?: string,
  history?: HistoryMessage[],
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/command/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, model, image, history }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Stream failed (${res.status})`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';

    for (const part of parts) {
      // Parse SSE: "event: <type>\ndata: <json>"
      const eventMatch = part.match(/^event:\s*(\w+)\ndata:\s*(.*)/s);
      if (!eventMatch) continue;
      const [, eventType, rawData] = eventMatch;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawData);
      } catch {
        continue;
      }

      switch (eventType) {
        case 'meta':
          callbacks.onMeta?.(data as { task_type: string; agents: string[]; model: string });
          break;
        case 'thought':
          callbacks.onThought?.(data.token as string);
          break;
        case 'token':
          callbacks.onToken?.(data.token as string);
          break;
        case 'complete':
          callbacks.onComplete?.(data as unknown as CommandResponse);
          break;
        case 'error':
          callbacks.onError?.((data.message as string) || 'Unknown streaming error');
          break;
      }
    }
  }
}

export async function uploadDocument(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: form,
  });
  return handleResponse<UploadResponse>(res);
}

export async function getDocuments(): Promise<DocumentsResponse> {
  const res = await fetch(`${API_BASE_URL}/documents`);
  return handleResponse<DocumentsResponse>(res);
}

export async function deleteDocument(filename: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/documents/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete ${filename}`);
  }
}

export async function postInspection(file: File, visionModel: string = 'llava:latest'): Promise<InspectionResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('vision_model', visionModel);
  const res = await fetch(`${API_BASE_URL}/inspect`, {
    method: 'POST',
    body: form,
  });
  return handleResponse<InspectionResponse>(res);
}

export interface HealthMetric {
  label: string;
  value: string;
  pct: number;
  color: string;
}

export interface HealthResponse {
  cpu: HealthMetric;
  ram: HealthMetric;
  disk: HealthMetric;
  vector_store: HealthMetric;
  services: Record<string, boolean>;
}

export interface RAGSettings {
  chunk_size: number;
  overlap: number;
  top_k: number;
  threshold: number;
}

export interface SensorReading { time: string; value: number; }
export interface SensorData {
  name: string; unit: string;
  readings: SensorReading[];
  min: number; max: number; avg: number;
  anomalies: number[];
}
export interface TelemetryResponse {
  filename: string;
  rows: number;
  sensors: SensorData[];
}

export interface ApprovalItem {
  id: string; title: string; agent: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string; evidence: string[];
  requestedAt: string; status: 'pending' | 'approved' | 'rejected' | 'escalated';
  decidedAt?: string; decidedBy?: string;
}

export async function getApprovals(): Promise<{ items: ApprovalItem[] }> {
  const res = await fetch(`${API_BASE_URL}/approvals`);
  return handleResponse<{ items: ApprovalItem[] }>(res);
}

export async function decideApproval(id: string, status: string): Promise<{ item: ApprovalItem }> {
  const res = await fetch(`${API_BASE_URL}/approvals/${id}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, decided_by: 'Gravion Admin' }),
  });
  return handleResponse<{ item: ApprovalItem }>(res);
}

export async function uploadTelemetry(file: File): Promise<TelemetryResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE_URL}/telemetry/upload`, { method: 'POST', body: form });
  return handleResponse<TelemetryResponse>(res);
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`);
  return handleResponse<HealthResponse>(res);
}

export async function getSettings(): Promise<RAGSettings> {
  const res = await fetch(`${API_BASE_URL}/settings`);
  return handleResponse<RAGSettings>(res);
}

export async function saveSettings(s: RAGSettings): Promise<RAGSettings> {
  const res = await fetch(`${API_BASE_URL}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });
  return handleResponse<RAGSettings>(res);
}

// Streams AI-generated Python code token by token.
// onToken called per token, onDone called with the final clean code string.
export async function generateCode(
  prompt: string,
  model: string,
  onToken: (token: string) => void,
  onDone: (code: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/generate-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Code generation failed (${res.status})`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.startsWith('data: ')) continue;
      const data = part.slice(6);
      if (data.startsWith('__ERROR__:')) throw new Error(data.slice(10));
      if (data.startsWith('__CODE_DONE__:')) {
        onDone(decodeURIComponent(data.slice(14)));
        return;
      }
      // Restore newlines that were escaped for SSE transport
      onToken(data.replace(/__NL__/g, '\n'));
    }
  }
}

// Streams real-time output from the backend Python executor.
// onLine is called for each stdout line, onDone when execution finishes.
export async function executeCode(
  code: string,
  onLine: (line: string) => void,
  onDone: (exitCode: number, elapsed: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Execute failed (${res.status})`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      if (!part.startsWith('data: ')) continue;
      const line = part.slice(6); // strip "data: "
      if (line.startsWith('__DONE__:')) {
        const [, rc, elapsed] = line.split(':');
        onDone(parseInt(rc, 10), parseFloat(elapsed));
        return;
      }
      onLine(line);
    }
  }
}

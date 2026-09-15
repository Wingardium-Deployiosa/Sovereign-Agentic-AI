import { useState, useRef, useCallback, useEffect } from 'react';
import {
  BookOpen, Upload, Trash2, Search, FileText,
  Layers, AlertCircle, CheckCircle2, Loader2, RefreshCw, Database,
} from 'lucide-react';
import {
  uploadDocument, getDocuments, deleteDocument, postCommand,
  type DocumentsResponse, type CommandResponse,
} from '@/lib/api';
import { CommandResponseView } from '@/components/CommandResponseView';

const ACCEPTED = '.pdf,.docx,.txt';
const FILE_ICONS: Record<string, string> = {
  pdf: '📄', docx: '📝', txt: '📃', xlsx: '📊', pptx: '📋',
};
function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICONS[ext] ?? '📄';
}

export function KnowledgePage() {
  const [documents, setDocuments]     = useState<DocumentsResponse | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError]     = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [uploadMsg, setUploadMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [dragging, setDragging]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [query, setQuery]         = useState('');
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searchRes, setSearchRes] = useState<CommandResponse | null>(null);

  const loadDocs = useCallback(async () => {
    setDocsLoading(true); setDocsError(null);
    try { setDocuments(await getDocuments()); }
    catch (e) { setDocsError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setDocsLoading(false); }
  }, []);

  // Auto-load on mount
  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['pdf', 'docx', 'txt'].includes(ext)) {
      setUploadMsg({ ok: false, text: `Unsupported file type: .${ext}. Only PDF, DOCX, TXT are supported.` });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadMsg({ ok: false, text: 'File too large. Maximum size is 50MB.' });
      return;
    }
    setUploading(true); setUploadMsg(null);
    try {
      const r = await uploadDocument(file);
      setUploadMsg({ ok: true, text: `${r.filename} indexed — ${r.chunks} chunks` });
      await loadDocs();
    } catch (e) {
      setUploadMsg({ ok: false, text: e instanceof Error ? e.message : 'Upload failed' });
    } finally { setUploading(false); }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }

  async function handleDelete(name: string) {
    try { await deleteDocument(name); await loadDocs(); }
    catch (e) { setUploadMsg({ ok: false, text: e instanceof Error ? e.message : 'Delete failed' }); }
  }

  async function handleSearch() {
    if (!query.trim() || searching) return;
    setSearching(true); setSearchErr(null); setSearchRes(null);
    try { setSearchRes(await postCommand(query)); }
    catch (e) { setSearchErr(e instanceof Error ? e.message : 'Search failed'); }
    finally { setSearching(false); }
  }

  return (
    <div className="page-content">

      {/* Header */}
      <div className="page-header">
        <div className="page-icon" style={{ background: '#FFF4ED', border: '1px solid rgba(249,115,22,0.20)' }}>
          <BookOpen className="w-5 h-5" style={{ color: '#F97316' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#172B4D' }}>Industrial Knowledge Base</h1>
          <p className="text-xs mt-0.5" style={{ color: '#68758A' }}>
            Upload, index, and query confidential industrial documents — all on-premises
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: FileText, label: 'Documents',   value: documents ? String(documents.documents.length) : '—', color: '#F97316', bg: '#FFF4ED' },
          { icon: Layers,   label: 'Total Chunks', value: documents ? String(documents.total_chunks) : '—',    color: '#3B82F6', bg: '#EFF6FF' },
          { icon: Database, label: 'Vector Store', value: 'FAISS',                                             color: '#22C55E', bg: '#F0FDF4' },
        ].map(s => (
          <div key={s.label} className="action-card flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: '#172B4D' }}>{s.value}</p>
              <p className="text-[11px]" style={{ color: '#8290A3' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Upload */}
      <div className="glass-panel mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: '#172B4D' }}>Upload Documents</h2>
          <span className="text-[11px]" style={{ color: '#8290A3' }}>PDF · DOCX · TXT</span>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className="rounded-xl p-8 cursor-pointer transition-all flex flex-col items-center justify-center text-center"
          style={{
            border: `2px dashed ${dragging ? '#F97316' : 'rgba(249,115,22,0.30)'}`,
            background: dragging ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.40)',
          }}
        >
          <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.20)' }}>
            {uploading
              ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#F97316' }} />
              : <Upload className="w-5 h-5" style={{ color: '#F97316' }} />}
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: '#172B4D' }}>
            {uploading ? 'Uploading & indexing…' : 'Drop documents here or click to browse'}
          </p>
          <p className="text-[11px]" style={{ color: '#8290A3' }}>
            Documents are chunked and indexed into the local vector store
          </p>
        </div>

        {uploadMsg && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl mt-3 text-sm"
            style={{
              background: uploadMsg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${uploadMsg.ok ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)'}`,
              color: uploadMsg.ok ? '#16a34a' : '#dc2626',
            }}>
            {uploadMsg.ok
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {uploadMsg.text}
          </div>
        )}
      </div>

      {/* Document Library */}
      <div className="glass-panel mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: '#172B4D' }}>Document Library</h2>
          <button onClick={loadDocs} disabled={docsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.62)', color: '#68758A', backdropFilter: 'blur(12px)' }}>
            {docsLoading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            {docsLoading ? 'Loading…' : documents ? 'Refresh' : 'Load'}
          </button>
        </div>

        {docsError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', color: '#dc2626' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{docsError}</span>
            <button onClick={loadDocs} className="text-xs underline">Retry</button>
          </div>
        )}

        {!documents && !docsLoading && !docsError && (
          <div className="flex flex-col items-center justify-center py-10 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.35)', border: '1px dashed rgba(200,185,165,0.50)' }}>
            <FileText className="w-8 h-8 mb-2" style={{ color: '#8290A3' }} />
            <p className="text-sm" style={{ color: '#8290A3' }}>Click "Load" to view indexed documents</p>
          </div>
        )}

        {documents && !docsLoading && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-3.5 h-3.5" style={{ color: '#8290A3' }} />
              <span className="text-xs" style={{ color: '#8290A3' }}>
                {documents.documents.length} document{documents.documents.length !== 1 ? 's' : ''} ·{' '}
                <span className="font-mono">{documents.total_chunks}</span> chunks indexed
              </span>
            </div>

            {documents.documents.length === 0 ? (
              <div className="flex flex-col items-center py-10 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.35)', border: '1px dashed rgba(200,185,165,0.50)' }}>
                <p className="text-sm" style={{ color: '#8290A3' }}>No documents uploaded yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.documents.map((doc, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-white/30"
                    style={{ background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.62)' }}>
                    <span className="text-lg flex-shrink-0">{fileIcon(doc)}</span>
                    <span className="font-mono text-xs flex-1 truncate" style={{ color: '#172B4D' }}>{doc}</span>
                    <button onClick={() => handleDelete(doc)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-red-50 flex-shrink-0"
                      style={{ color: '#8290A3' }} title="Remove from index">
                      <Trash2 className="w-3.5 h-3.5 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Knowledge Search */}
      <div className="glass-panel">
        <h2 className="text-sm font-semibold mb-4" style={{ color: '#172B4D' }}>Knowledge Search</h2>

        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(255,255,255,0.70)', backdropFilter: 'blur(16px)' }}>
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: '#8290A3' }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Ask your industrial knowledge base…"
              disabled={searching}
              className="flex-1 bg-transparent text-sm focus:outline-none"
              style={{ color: '#172B4D' }}
            />
          </div>
          <button onClick={handleSearch} disabled={searching || !query.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex-shrink-0 transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#FF9F50,#F97316)', boxShadow: '0 4px 14px rgba(249,115,22,0.30)' }}>
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {searching && (
          <div className="flex items-center gap-3 px-4 py-4 rounded-xl mt-3"
            style={{ background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.60)' }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#F97316' }} />
            <span className="text-sm" style={{ color: '#68758A' }}>Searching knowledge base…</span>
          </div>
        )}

        {searchErr && !searching && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl mt-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', color: '#dc2626' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{searchErr}</span>
            <button onClick={handleSearch} className="text-xs underline">Retry</button>
          </div>
        )}

        {searchRes && !searching && !searchErr && (
          <div className="mt-4 animate-fade-in">
            <CommandResponseView data={searchRes} />
          </div>
        )}
      </div>

      <p className="text-[11px] text-center mt-6" style={{ color: '#8290A3' }}>
        All documents stored and indexed locally · Vector search on-premises · No external API calls
      </p>
    </div>
  );
}

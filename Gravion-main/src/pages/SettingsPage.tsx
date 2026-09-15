import { useState, useEffect, useCallback } from 'react';
import { Settings, Cpu, Database, Users, Activity, CheckCircle2, AlertTriangle, Save, Loader2, RefreshCw } from 'lucide-react';
import { getHealth, getSettings, saveSettings, type HealthResponse } from '@/lib/api';

type Tab = 'models' | 'rag' | 'users' | 'system';

const MODELS_CONFIG = [
  { task: 'Document Analysis', model: 'qwen2.5:7b-instruct-q4_K_M', temp: '0.2', maxTokens: '4096' },
  { task: 'Visual Inspection',  model: 'llava:latest',               temp: '0.1', maxTokens: '2048' },
  { task: 'Code Generation',    model: 'qwen2.5:7b-instruct-q4_K_M', temp: '0.0', maxTokens: '8192' },
  { task: 'Orchestration',      model: 'qwen2.5:7b-instruct-q4_K_M', temp: '0.3', maxTokens: '4096' },
];

const USERS_LIST = [
  { name: 'Gravion Admin', role: 'Administrator', email: 'admin@mrpl.co.in', active: true },
];

const SERVICE_LABELS: Record<string, string> = {
  ollama:           'LLM Inference Server (Ollama)',
  vector_store:     'Vector Store (FAISS)',
  document_indexer: 'Document Indexer',
};

function Field({ label, unit, value, onChange }: {
  label: string; unit?: string; value: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#8290A3' }}>
        {label}{unit ? ` (${unit})` : ''}
      </label>
      <input
        value={value}
        onChange={e => onChange?.(e.target.value)}
        readOnly={!onChange}
        className="w-full px-3 py-2 rounded-xl text-[13px] focus:outline-none"
        style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.60)', color: '#172B4D', backdropFilter: 'blur(12px)' }}
      />
    </div>
  );
}

export function SettingsPage() {
  const [tab, setTab]       = useState<Tab>('models');
  const [saved, setSaved]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // RAG settings
  const [chunkSize,  setChunkSize]  = useState('512');
  const [overlap,    setOverlap]    = useState('64');
  const [topK,       setTopK]       = useState('5');
  const [threshold,  setThreshold]  = useState('0.72');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Health
  const [health,        setHealth]        = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthErr,     setHealthErr]     = useState<string | null>(null);

  // Load RAG settings on mount
  useEffect(() => {
    getSettings().then(s => {
      setChunkSize(String(s.chunk_size));
      setOverlap(String(s.overlap));
      setTopK(String(s.top_k));
      setThreshold(String(s.threshold));
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true); setHealthErr(null);
    try { setHealth(await getHealth()); }
    catch (e) { setHealthErr(e instanceof Error ? e.message : 'Failed to load health'); }
    finally { setHealthLoading(false); }
  }, []);

  // Auto-load health when system tab is opened
  useEffect(() => { if (tab === 'system') loadHealth(); }, [tab, loadHealth]);

  async function save() {
    setSaving(true); setSaveErr(null);
    try {
      await saveSettings({
        chunk_size: parseInt(chunkSize),
        overlap:    parseInt(overlap),
        top_k:      parseInt(topK),
        threshold:  parseFloat(threshold),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'models', label: 'Models',       icon: Cpu },
    { id: 'rag',    label: 'RAG Config',   icon: Database },
    { id: 'users',  label: 'Users',        icon: Users },
    { id: 'system', label: 'System Health',icon: Activity },
  ];

  const healthMetrics = health
    ? [health.cpu, health.ram, health.disk, health.vector_store]
    : [];

  return (
    <div className="max-w-[860px] mx-auto px-4 py-4 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(130,144,163,0.2)' }}>
            <Settings className="w-5 h-5" style={{ color: '#68758A' }} />
          </div>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: '#172B4D' }}>Settings</h1>
            <p className="text-[12px]" style={{ color: '#68758A' }}>
              Model selection · RAG configuration · User management · System diagnostics
            </p>
          </div>
        </div>
        {tab === 'rag' && (
          <button
            onClick={save}
            disabled={saving || !settingsLoaded}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: saved ? '#22C55E' : 'linear-gradient(135deg,#FF9F50,#F97316)', boxShadow: '0 4px 14px rgba(249,115,22,0.30)' }}
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : saved
                ? <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        )}
      </div>

      {saveErr && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px]"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', color: '#dc2626' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {saveErr}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.55)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={tab === t.id
              ? { background: '#F97316', color: '#fff', boxShadow: '0 2px 8px rgba(249,115,22,0.35)' }
              : { color: '#68758A' }}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Models tab */}
      {tab === 'models' && (
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: '#68758A' }}>
            Models currently configured for each task. All run locally via Ollama.
          </p>
          {MODELS_CONFIG.map((m, i) => (
            <div key={i} className="action-card flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between w-full">
                <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#8290A3' }}>{m.task}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>● LOCAL</span>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full">
                <Field label="Model"       value={m.model} />
                <Field label="Temperature" value={m.temp} />
                <Field label="Max Tokens"  value={m.maxTokens} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RAG tab */}
      {tab === 'rag' && (
        <div className="action-card flex flex-col gap-5 p-6">
          <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>RAG Index Configuration</p>
          {!settingsLoaded
            ? <div className="flex items-center gap-2 py-4"><Loader2 className="w-4 h-4 animate-spin" style={{ color: '#F97316' }} /><span className="text-[13px]" style={{ color: '#68758A' }}>Loading settings…</span></div>
            : (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Chunk Size"          unit="tokens" value={chunkSize}  onChange={setChunkSize} />
                <Field label="Chunk Overlap"        unit="tokens" value={overlap}    onChange={setOverlap} />
                <Field label="Top-K Retrieval"      value={topK}       onChange={setTopK} />
                <Field label="Similarity Threshold" value={threshold}  onChange={setThreshold} />
                <Field label="Embedding Model"      value="all-MiniLM-L6-v2 (local)" />
                <Field label="Vector Store"         value="FAISS (local /data/vector_store/)" />
              </div>
            )}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)' }}>
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-[12px] text-success">All RAG operations run locally · No external embedding API</span>
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="action-card flex flex-col gap-4 p-5">
          <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>User & Role Management</p>
          {USERS_LIST.map((u, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.55)' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
                style={{ background: '#DDEBD5', color: '#31543A' }}>
                {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>{u.name}</p>
                <p className="text-[11px]" style={{ color: '#68758A' }}>{u.email}</p>
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(249,115,22,0.10)', color: '#F97316' }}>{u.role}</span>
              <span className="text-[10px] font-bold" style={{ color: u.active ? '#22C55E' : '#8290A3' }}>
                ● {u.active ? 'active' : 'inactive'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* System Health tab */}
      {tab === 'system' && (
        <div className="space-y-4">

          <div className="flex justify-end">
            <button onClick={loadHealth} disabled={healthLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.60)', color: '#68758A' }}>
              {healthLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              {healthLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {healthErr && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-[13px]"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', color: '#dc2626' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {healthErr}
            </div>
          )}

          {/* Resource bars */}
          <div className="action-card flex flex-col gap-4 p-5">
            <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>System Resource Usage</p>
            {healthLoading && !health && (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#F97316' }} />
                <span className="text-[13px]" style={{ color: '#68758A' }}>Fetching live stats…</span>
              </div>
            )}
            {healthMetrics.map((h, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-[12px]">
                  <span style={{ color: '#68758A' }}>{h.label}</span>
                  <span className="font-semibold" style={{ color: '#172B4D' }}>{h.value}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.40)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${h.pct}%`, background: h.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Service status */}
          {health && (
            <div className="action-card flex flex-col gap-3 p-5">
              <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>Service Status</p>
              {Object.entries(health.services).map(([key, running]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[12px]" style={{ color: '#68758A' }}>
                    {SERVICE_LABELS[key] ?? key}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {running
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                    <span className={`text-[11px] font-semibold ${running ? 'text-success' : 'text-warning'}`}>
                      {running ? 'Running' : 'Not detected'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

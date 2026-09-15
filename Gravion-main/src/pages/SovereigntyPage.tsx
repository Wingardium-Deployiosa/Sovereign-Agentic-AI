import { Shield, WifiOff, CheckCircle2, XCircle, Server, Lock, Eye, Database, Cpu, Globe } from 'lucide-react';

const BLOCKED_CALLS = [
  { time: '09:10:55', destination: 'api.openai.com',         port: 443, reason: 'External AI API — blocked by policy' },
  { time: '08:52:11', destination: 'huggingface.co',         port: 443, reason: 'Model download attempt — blocked' },
  { time: '08:45:03', destination: 'telemetry.microsoft.com',port: 443, reason: 'Telemetry — blocked by policy' },
];

const LOCAL_MODELS = [
  { name: 'Mistral-7B-Instruct-v0.3',  task: 'Document Analysis / RAG',  hash: 'sha256:a3f9c2d1' },
  { name: 'LLaVA-13B-v1.6',            task: 'Visual Inspection',         hash: 'sha256:b7e4a8f2' },
  { name: 'CodeLlama-13B-Instruct',    task: 'Code Generation',           hash: 'sha256:c1d5b3e9' },
  { name: 'Mixtral-8x7B-Instruct',     task: 'Orchestration / Planning',  hash: 'sha256:d8f2c7a4' },
  { name: 'Phi-3-mini-4k-instruct',    task: 'Telemetry / Fast Tasks',    hash: 'sha256:e5a9d1b6' },
];

const DATA_CLASSES = [
  { label: 'P&ID Drawings',       classification: 'CONFIDENTIAL', location: 'On-premises /docs/pid/' },
  { label: 'Inspection Reports',  classification: 'INTERNAL',     location: 'On-premises /docs/reports/' },
  { label: 'Financial Data',      classification: 'RESTRICTED',   location: 'On-premises /docs/finance/' },
  { label: 'SOPs & Manuals',      classification: 'INTERNAL',     location: 'On-premises /docs/sops/' },
  { label: 'Vendor Negotiations', classification: 'CONFIDENTIAL', location: 'On-premises /docs/vendor/' },
];

const CLASS_CFG: Record<string, { color: string; bg: string }> = {
  CONFIDENTIAL: { color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
  RESTRICTED:   { color: '#F97316', bg: 'rgba(249,115,22,0.10)' },
  INTERNAL:     { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
};

export function SovereigntyPage() {
  return (
    <div className="max-w-[960px] mx-auto px-4 py-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F0FDF4', border: '1px solid rgba(34,197,94,0.2)' }}>
          <Shield className="w-5 h-5 text-success" />
        </div>
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: '#172B4D' }}>Sovereignty Dashboard</h1>
          <p className="text-[12px]" style={{ color: '#68758A' }}>Network isolation · Data residency · Model provenance · Air-gap verification</p>
        </div>
      </div>

      {/* Status KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Network Status', value: 'AIR-GAPPED',   icon: WifiOff, color: '#22C55E', bg: '#F0FDF4', sub: 'No external egress' },
          { label: 'Data Residency', value: 'ON-PREMISES',  icon: Server,  color: '#3B82F6', bg: '#EFF6FF', sub: 'All data local' },
          { label: 'Encryption',     value: 'AES-256',      icon: Lock,    color: '#8B5CF6', bg: '#F5F3FF', sub: 'At rest & in transit' },
          { label: 'Blocked Calls',  value: String(BLOCKED_CALLS.length), icon: Globe, color: '#EF4444', bg: '#FEF2F2', sub: 'Today' },
        ].map(s => (
          <div key={s.label} className="action-card flex flex-col items-start gap-2 p-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: s.bg }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-[15px] font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[11px] font-semibold" style={{ color: '#172B4D' }}>{s.label}</p>
              <p className="text-[10px]" style={{ color: '#8290A3' }}>{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Blocked egress */}
      <div>
        <h2 className="text-[13px] font-semibold mb-3 flex items-center gap-2" style={{ color: '#172B4D' }}>
          <XCircle className="w-4 h-4 text-danger" /> Blocked Egress Attempts
        </h2>
        <div className="space-y-2">
          {BLOCKED_CALLS.map((c, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(254,242,242,0.70)', border: '1px solid rgba(239,68,68,0.20)', backdropFilter: 'blur(12px)' }}>
              <WifiOff className="w-4 h-4 text-danger flex-shrink-0" />
              <span className="text-[11px] font-mono flex-shrink-0" style={{ color: '#8290A3' }}>{c.time}</span>
              <span className="text-[13px] font-semibold flex-shrink-0" style={{ color: '#EF4444' }}>{c.destination}</span>
              <span className="text-[11px] flex-shrink-0" style={{ color: '#8290A3' }}>:{c.port}</span>
              <span className="text-[12px] flex-1" style={{ color: '#68758A' }}>{c.reason}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>BLOCKED</span>
            </div>
          ))}
        </div>
      </div>

      {/* Model provenance */}
      <div>
        <h2 className="text-[13px] font-semibold mb-3 flex items-center gap-2" style={{ color: '#172B4D' }}>
          <Cpu className="w-4 h-4" style={{ color: '#F97316' }} /> Model Provenance & Integrity
        </h2>
        <div className="space-y-2">
          {LOCAL_MODELS.map((m, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.60)', backdropFilter: 'blur(12px)' }}>
              <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: '#172B4D' }}>{m.name}</p>
                <p className="text-[11px]" style={{ color: '#68758A' }}>{m.task}</p>
              </div>
              <span className="text-[11px] font-mono hidden sm:block" style={{ color: '#8290A3' }}>{m.hash}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>LOCAL</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data classification */}
      <div>
        <h2 className="text-[13px] font-semibold mb-3 flex items-center gap-2" style={{ color: '#172B4D' }}>
          <Database className="w-4 h-4 text-info" /> Data Residency & Classification
        </h2>
        <div className="space-y-2">
          {DATA_CLASSES.map((d, i) => {
            const cfg = CLASS_CFG[d.classification] ?? { color: '#68758A', bg: 'rgba(104,117,138,0.10)' };
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.60)', backdropFilter: 'blur(12px)' }}>
                <Eye className="w-4 h-4 flex-shrink-0" style={{ color: cfg.color }} />
                <span className="text-[13px] font-semibold flex-1" style={{ color: '#172B4D' }}>{d.label}</span>
                <span className="text-[11px] hidden sm:block" style={{ color: '#8290A3' }}>{d.location}</span>
                <Lock className="w-3.5 h-3.5 text-success flex-shrink-0" />
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{d.classification}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Verified banner */}
      <div className="px-5 py-4 rounded-xl text-center" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)' }}>
        <p className="text-[13px] font-semibold text-success">✓ Sovereign Deployment Verified</p>
        <p className="text-[11px] mt-1" style={{ color: '#68758A' }}>No external API calls · All models local · All data on-premises · Network egress blocked</p>
      </div>
    </div>
  );
}

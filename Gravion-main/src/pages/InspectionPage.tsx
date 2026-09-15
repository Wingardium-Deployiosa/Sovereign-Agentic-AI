import { useState, useRef } from 'react';
import {
  ScanLine, Play, AlertTriangle, AlertCircle,
  CheckCircle2, XCircle, Info, Wrench, Eye, Droplet,
  ShieldAlert, Loader2, ImageIcon, RotateCcw,
} from 'lucide-react';
import { postInspection, type InspectionResponse, type Observation } from '@/lib/api';
import { ConfidenceMeter } from '@/components/ConfidenceMeter';

const ACCEPTED_TYPES = '.jpg,.jpeg,.png,.webp';

function severityConfig(s: string) {
  const v = s.toLowerCase();
  if (v === 'high' || v === 'critical')
    return { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.20)', icon: XCircle, label: 'High' };
  if (v === 'medium')
    return { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.20)', icon: AlertTriangle, label: 'Medium' };
  if (v === 'low')
    return { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.20)', icon: Info, label: 'Low' };
  return { color: '#22C55E', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.20)', icon: CheckCircle2, label: s };
}

function conditionStyle(c: string) {
  const v = c.toLowerCase();
  if (v.includes('critical'))  return { color: '#EF4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)' };
  if (v.includes('attention')) return { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)' };
  if (v.includes('normal'))    return { color: '#22C55E', bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.25)'  };
  return { color: '#68758A', bg: 'rgba(255,255,255,0.50)', border: 'rgba(200,185,165,0.40)' };
}

function ObservationCard({ obs, index }: { obs: Observation; index: number }) {
  const cfg = severityConfig(obs.severity);
  const Icon = cfg.icon;
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: `${cfg.color}18` }}>
        <Icon className="w-3 h-3" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(255,255,255,0.60)', color: '#68758A' }}>{obs.type}</span>
          <span className="text-[10px] font-mono ml-auto" style={{ color: '#8290A3' }}>#{index + 1}</span>
        </div>
        <p className="text-[12px] leading-snug" style={{ color: '#172B4D' }}>{obs.description}</p>
        {obs.location && (
          <p className="text-[10px] font-mono mt-0.5" style={{ color: '#8290A3' }}>📍 {obs.location}</p>
        )}
      </div>
    </div>
  );
}

function FlagChip({ label, value, icon: Icon }: { label: string; value: boolean; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1"
      style={{
        background: value ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.55)',
        border: `1px solid ${value ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.65)'}`,
      }}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: value ? '#EF4444' : '#8290A3' }} />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: value ? '#EF4444' : '#8290A3' }}>{label}</p>
        <p className="text-[11px] font-bold" style={{ color: value ? '#EF4444' : '#22C55E' }}>{value ? 'Detected' : 'None'}</p>
      </div>
    </div>
  );
}

export function InspectionPage() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectionResponse | null>(null);
  const [dragging, setDragging] = useState(false);
  const [visionModel, setVisionModel] = useState('llava:latest');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(file: File) {
    setSelectedFile(file);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  }

  function handleReset() {
    setImagePreview(null);
    setSelectedFile(null);
    setResult(null);
    setError(null);
  }

  async function handleAnalyze() {
    if (!selectedFile || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await postInspection(selectedFile, visionModel);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inspection failed');
    } finally {
      setLoading(false);
    }
  }

  const cond = result ? conditionStyle(result.overall_visual_condition) : null;
  const hasResult = result && !loading && !error;

  return (
    <div className="max-w-[960px] mx-auto px-5 py-5 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.20)' }}>
            <ScanLine className="w-5 h-5" style={{ color: '#F97316' }} />
          </div>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: '#172B4D' }}>Equipment Inspection</h1>
            <p className="text-[12px]" style={{ color: '#68758A' }}>
              AI-powered visual analysis · VisionCore + llava:latest
            </p>
          </div>
        </div>
        {hasResult && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors hover:bg-white/60"
            style={{ color: '#8290A3', border: '1px solid rgba(200,185,165,0.40)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" /> New Inspection
          </button>
        )}
      </div>

      {/* ── UPLOAD PANEL — shown only when no result yet ── */}
      {!hasResult && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.70)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: '0 2px 16px rgba(30,40,55,0.06)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">

            {/* Left — drop zone */}
            <div className="p-5" style={{ borderRight: '1px solid rgba(255,255,255,0.50)' }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#8290A3' }}>Upload Image</p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !imagePreview && fileInputRef.current?.click()}
                className="rounded-xl transition-all overflow-hidden"
                style={{
                  minHeight: 220,
                  border: `2px dashed ${dragging ? '#F97316' : imagePreview ? 'rgba(200,185,165,0.40)' : 'rgba(249,115,22,0.30)'}`,
                  background: dragging ? 'rgba(249,115,22,0.05)' : imagePreview ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.35)',
                  cursor: imagePreview ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }} />
                {imagePreview ? (
                  <img src={imagePreview} alt="Equipment preview"
                    className="w-full h-full object-contain" style={{ maxHeight: 220 }} />
                ) : (
                  <div className="flex flex-col items-center text-center p-6">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.20)' }}>
                      <ImageIcon className="w-5 h-5" style={{ color: '#F97316' }} />
                    </div>
                    <p className="text-[13px] font-semibold mb-1" style={{ color: '#172B4D' }}>Drop image here</p>
                    <p className="text-[11px]" style={{ color: '#8290A3' }}>or click to browse</p>
                    <p className="text-[10px] mt-2 font-mono" style={{ color: '#8290A3' }}>JPG · PNG · WEBP</p>
                  </div>
                )}
              </div>
              {selectedFile && (
                <div className="flex items-center gap-2 mt-3">
                  <p className="text-[11px] font-mono flex-1 truncate" style={{ color: '#68758A' }}>
                    📎 {selectedFile.name}
                  </p>
                  <button onClick={handleReset}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors hover:bg-white/60"
                    style={{ color: '#8290A3' }}>
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                </div>
              )}
            </div>

            {/* Right — controls */}
            <div className="p-5 flex flex-col gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8290A3' }}>Analysis</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.60)' }}>
                  <span className="text-[11px]" style={{ color: '#8290A3' }}>Vision Model</span>
                  <select 
                    value={visionModel}
                    onChange={e => setVisionModel(e.target.value)}
                    className="text-[11px] font-mono font-semibold bg-transparent border-none outline-none cursor-pointer"
                    style={{ color: '#3B82F6' }}
                  >
                    <option value="qwen3-vl:4b-thinking">qwen3-vl:4b (Reasoning)</option>
                    <option value="llava:latest">llava:latest (Inspection)</option>
                    <option value="qwen2.5vl:3b-q8_0">qwen2.5vl:3b (Fast)</option>
                  </select>
                </div>
                {[
                  { label: 'Reasoning Model', value: 'qwen2.5:7b-instruct', color: '#8B5CF6' },
                  { label: 'Agent', value: 'VisionCore', color: '#F97316' },
                ].map(m => (
                  <div key={m.label} className="flex items-center justify-between px-3 py-2 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.60)' }}>
                    <span className="text-[11px]" style={{ color: '#8290A3' }}>{m.label}</span>
                    <span className="text-[11px] font-mono font-semibold" style={{ color: m.color }}>{m.value}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={handleAnalyze}
                disabled={!selectedFile || loading}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-auto"
                style={{
                  background: 'linear-gradient(135deg, #FF9F50 0%, #F97316 100%)',
                  boxShadow: selectedFile && !loading ? '0 4px 16px rgba(249,115,22,0.35)' : 'none',
                }}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
                  : <><Play className="w-4 h-4" /> Run Inspection</>}
              </button>
              {loading && (
                <p className="text-[11px] text-center" style={{ color: '#68758A' }}>
                  VisionCore is inspecting the image…<br />
                  <span style={{ color: '#8290A3' }}>This may take 30–60 seconds</span>
                </p>
              )}
              {!selectedFile && !loading && (
                <p className="text-[11px] text-center" style={{ color: '#8290A3' }}>
                  Upload an equipment image to begin
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {error && !loading && (
        <div className="flex items-start gap-3 p-4 rounded-2xl animate-fade-in"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.20)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold" style={{ color: '#EF4444' }}>Inspection Failed</p>
            <p className="text-[12px] mt-0.5" style={{ color: '#68758A' }}>{error}</p>
          </div>
          <button onClick={handleAnalyze}
            className="text-[12px] px-3 py-1.5 rounded-xl font-medium transition-colors hover:bg-white/60"
            style={{ color: '#F97316', border: '1px solid rgba(249,115,22,0.25)' }}>
            Retry
          </button>
        </div>
      )}

      {/* ── ANALYZED IMAGE RESULT ── */}
      {hasResult && (
        <div className="animate-fade-in space-y-4">

          {/* Fallback warning */}
          {result.fallback_used && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#F59E0B' }} />
              <p className="text-[12px]" style={{ color: '#92400E' }}>
                Fallback mode — vision model unavailable. Results are heuristic only.
              </p>
            </div>
          )}

          {/* ── Main card: image + findings side by side ── */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: '0 2px 20px rgba(30,40,55,0.07)' }}>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">

              {/* Left — analyzed image */}
              <div className="p-5" style={{ borderRight: '1px solid rgba(200,185,165,0.25)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8290A3' }}>Analyzed Image</p>
                  <span className="ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(34,197,94,0.10)', color: '#16A34A' }}>
                    ✓ Complete
                  </span>
                </div>
                <div className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(200,185,165,0.35)', background: 'rgba(255,255,255,0.40)' }}>
                  <img
                    src={imagePreview!}
                    alt="Analyzed equipment"
                    className="w-full object-contain"
                    style={{ maxHeight: 320 }}
                  />
                </div>
                {selectedFile && (
                  <p className="text-[10px] font-mono mt-2 truncate" style={{ color: '#8290A3' }}>
                    📎 {selectedFile.name}
                  </p>
                )}

                {/* Equipment + Condition below image */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(200,185,165,0.30)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Wrench className="w-3 h-3" style={{ color: '#8290A3' }} />
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8290A3' }}>Equipment</p>
                    </div>
                    <p className="text-[12px] font-semibold leading-snug" style={{ color: '#172B4D' }}>
                      {result.equipment_guess || 'Unknown'}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(200,185,165,0.30)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Eye className="w-3 h-3" style={{ color: '#8290A3' }} />
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#8290A3' }}>Condition</p>
                    </div>
                    {cond && (
                      <span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider"
                        style={{ background: cond.bg, border: `1px solid ${cond.border}`, color: cond.color }}>
                        {result.overall_visual_condition}
                      </span>
                    )}
                  </div>
                </div>

                {/* Visual flags */}
                <div className="flex gap-2 mt-2">
                  <FlagChip label="Leak" value={result.visible_leak} icon={Droplet} />
                  <FlagChip label="Damage" value={result.visible_damage} icon={AlertCircle} />
                  <FlagChip label="Corrosion" value={result.visible_corrosion} icon={ShieldAlert} />
                </div>
              </div>

              {/* Right — observations + confidence */}
              <div className="p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ScanLine className="w-3.5 h-3.5" style={{ color: '#8290A3' }} />
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8290A3' }}>Findings</p>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(249,115,22,0.10)', color: '#F97316' }}>
                    {result.observations.length} observation{result.observations.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {result.observations.length > 0 ? (
                  <div className="space-y-2 flex-1 overflow-y-auto" style={{ maxHeight: 340 }}>
                    {result.observations.map((obs, i) => (
                      <ObservationCard key={i} obs={obs} index={i} />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.20)' }}>
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#22C55E' }} />
                    <p className="text-[12px]" style={{ color: '#166534' }}>No defects or anomalies detected.</p>
                  </div>
                )}

                {/* Confidence */}
                <div className="pt-3" style={{ borderTop: '1px solid rgba(200,185,165,0.25)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#8290A3' }}>
                    Inspection Confidence
                  </p>
                  <ConfidenceMeter value={result.confidence} />
                </div>

                {/* Raw description */}
                {result.raw_description && (
                  <div className="px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(200,185,165,0.30)' }}>
                    <p className="text-[11px] leading-relaxed italic" style={{ color: '#68758A' }}>
                      "{result.raw_description}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

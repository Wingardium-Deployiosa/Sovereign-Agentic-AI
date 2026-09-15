import { useState, useRef } from 'react';
import {
  Activity, Upload, AlertTriangle, TrendingUp, TrendingDown,
  CheckCircle2, XCircle, BarChart3, Gauge, Loader2, FileX,
} from 'lucide-react';
import { uploadTelemetry, type SensorData } from '@/lib/api';

function MiniChart({ data, anomalies, color }: {
  data: { time: string; value: number }[];
  anomalies: number[];
  color: string;
}) {
  const vals  = data.map(d => d.value);
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = max - min || 1;
  const W = 200; const H = 44;
  const pts = data.map((d, i) =>
    `${(i / (data.length - 1)) * W},${H - ((d.value - min) / range) * H}`
  ).join(' ');

  return (
    <svg width={W} height={H} className="overflow-visible w-full"
      viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      {anomalies.map(i => (
        <circle key={i}
          cx={(i / (data.length - 1)) * W}
          cy={H - ((data[i].value - min) / range) * H}
          r="3.5" fill="#EF4444" stroke="white" strokeWidth="1" />
      ))}
    </svg>
  );
}

function SensorCard({ sensor }: { sensor: SensorData }) {
  const hasAnomalies = sensor.anomalies.length > 0;
  const last  = sensor.readings[sensor.readings.length - 1]?.value ?? 0;
  const first = sensor.readings[0]?.value ?? 0;
  const TrendIcon = last > first ? TrendingUp : TrendingDown;

  return (
    <div className="action-card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between w-full">
        <div>
          <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>{sensor.name}</p>
          <p className="text-[11px] mt-0.5" style={{ color: '#8290A3' }}>
            {sensor.readings.length} samples{sensor.unit ? ` · ${sensor.unit}` : ''}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${hasAnomalies ? 'text-danger' : 'text-success'}`}
          style={{
            background: hasAnomalies ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)',
            border: `1px solid ${hasAnomalies ? 'rgba(239,68,68,0.20)' : 'rgba(34,197,94,0.20)'}`,
          }}>
          {hasAnomalies ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
          {hasAnomalies ? `${sensor.anomalies.length} anomaly` : 'Normal'}
        </span>
      </div>

      <div className="w-full h-11">
        <MiniChart data={sensor.readings} anomalies={sensor.anomalies}
          color={hasAnomalies ? '#F97316' : '#22C55E'} />
      </div>

      <div className="flex items-center justify-between w-full text-[11px]" style={{ color: '#68758A' }}>
        <span>Min: <b style={{ color: '#172B4D' }}>{sensor.min}{sensor.unit ? ` ${sensor.unit}` : ''}</b></span>
        <span className="flex items-center gap-1">
          <TrendIcon className="w-3 h-3" />
          Avg: <b style={{ color: '#172B4D' }}>{sensor.avg}{sensor.unit ? ` ${sensor.unit}` : ''}</b>
        </span>
        <span>Max: <b style={{ color: '#172B4D' }}>{sensor.max}{sensor.unit ? ` ${sensor.unit}` : ''}</b></span>
      </div>
    </div>
  );
}

export function TelemetryPage() {
  const [sensors,   setSensors]   = useState<SensorData[]>([]);
  const [filename,  setFilename]  = useState<string | null>(null);
  const [rows,      setRows]      = useState<number>(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalAnomalies = sensors.reduce((a, s) => a + s.anomalies.length, 0);
  const totalPoints    = sensors.reduce((a, s) => a + s.readings.length, 0);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setSensors([]);
    setFilename(null);
    try {
      const res = await uploadTelemetry(file);
      setSensors(res.sensors);
      setFilename(res.filename);
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  const hasSensors = sensors.length > 0;

  return (
    <div className="max-w-[960px] mx-auto px-4 py-4 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: '#EFF6FF', border: '1px solid rgba(59,130,246,0.2)' }}>
            <Activity className="w-5 h-5 text-info" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: '#172B4D' }}>Telemetry Analysis</h1>
            <p className="text-[12px]" style={{ color: '#68758A' }}>
              Upload CSV/XLSX · Statistical anomaly detection (Z-score) · Trend analysis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.60)', color: '#172B4D', backdropFilter: 'blur(12px)' }}>
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
              : <><Upload className="w-4 h-4" /> Import CSV / XLSX</>}
          </button>
        </div>
      </div>

      {/* Upload prompt — shown when no data yet */}
      {!hasSensors && !loading && !error && (
        <div
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-white/30"
          style={{ border: '2px dashed rgba(59,130,246,0.30)', background: 'rgba(255,255,255,0.35)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: '#EFF6FF', border: '1px solid rgba(59,130,246,0.20)' }}>
            <Upload className="w-6 h-6 text-info" />
          </div>
          <p className="text-[14px] font-semibold mb-1" style={{ color: '#172B4D' }}>
            Drop your sensor CSV or XLSX here
          </p>
          <p className="text-[12px]" style={{ color: '#8290A3' }}>
            First column = time labels · Remaining columns = sensor readings
          </p>
          <p className="text-[11px] mt-2 font-mono" style={{ color: '#8290A3' }}>
            .csv · .xlsx · .xls · up to 500 rows
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl"
          style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)' }}>
          <Loader2 className="w-5 h-5 animate-spin text-info flex-shrink-0" />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>Parsing & analysing…</p>
            <p className="text-[11px]" style={{ color: '#68758A' }}>Running Z-score anomaly detection on all columns</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-start gap-3 px-5 py-4 rounded-2xl"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.20)' }}>
          <FileX className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-danger">Parse Failed</p>
            <p className="text-[12px] mt-0.5" style={{ color: '#68758A' }}>{error}</p>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-[12px] px-3 py-1.5 rounded-xl font-medium"
            style={{ color: '#3B82F6', border: '1px solid rgba(59,130,246,0.25)' }}>
            Try again
          </button>
        </div>
      )}

      {/* Results */}
      {hasSensors && !loading && (
        <>
          {/* File info banner */}
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] animate-fade-in"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)', color: '#16a34a' }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>
              <b>{filename}</b> — {rows} rows parsed · {sensors.length} sensor column{sensors.length !== 1 ? 's' : ''} detected
            </span>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Sensors Detected', value: sensors.length,   icon: Gauge,         color: '#3B82F6', bg: '#EFF6FF' },
              { label: 'Anomalies Found',  value: totalAnomalies,   icon: AlertTriangle, color: '#EF4444', bg: '#FEF2F2' },
              { label: 'Total Data Points',value: totalPoints,      icon: BarChart3,     color: '#22C55E', bg: '#F0FDF4' },
              { label: 'Rows Parsed',      value: rows,             icon: Activity,      color: '#F97316', bg: '#FFF4ED' },
            ].map(k => (
              <div key={k.label} className="action-card flex flex-col items-start gap-2 p-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: k.bg }}>
                  <k.icon className="w-4 h-4" style={{ color: k.color }} />
                </div>
                <div>
                  <p className="text-[18px] font-bold" style={{ color: '#172B4D' }}>{k.value}</p>
                  <p className="text-[11px]" style={{ color: '#8290A3' }}>{k.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Sensor cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sensors.map(s => <SensorCard key={s.name} sensor={s} />)}
          </div>

          {/* Anomaly log */}
          {totalAnomalies > 0 && (
            <div>
              <h2 className="text-[13px] font-semibold mb-3" style={{ color: '#172B4D' }}>Anomaly Log</h2>
              <div className="space-y-2">
                {sensors.flatMap(s =>
                  s.anomalies.map(i => ({
                    sensor: s.name,
                    time:   s.readings[i]?.time ?? `#${i}`,
                    value:  s.readings[i]?.value ?? 0,
                    unit:   s.unit,
                    avg:    s.avg,
                  }))
                ).map((a, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(254,242,242,0.70)', border: '1px solid rgba(239,68,68,0.20)', backdropFilter: 'blur(12px)' }}>
                    <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0" />
                    <span className="text-[13px] font-medium" style={{ color: '#172B4D' }}>{a.sensor}</span>
                    <span className="text-[12px]" style={{ color: '#68758A' }}>at {a.time}</span>
                    <span className="ml-auto text-[13px] font-bold text-danger">
                      {a.value}{a.unit ? ` ${a.unit}` : ''}
                    </span>
                    <span className="text-[11px]" style={{ color: '#8290A3' }}>avg {a.avg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-center" style={{ color: '#8290A3' }}>
        All sensor data processed on-premises · Z-score anomaly detection · No external transmission
      </p>
    </div>
  );
}

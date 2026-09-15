import { useState } from 'react';
import { Calculator, ChevronRight, CheckCircle2 } from 'lucide-react';

type CalcId = 'heatex' | 'pipeflow' | 'thermo' | 'units';
interface CalcResult { steps: string[]; result: string; unit: string; }

function calcHeatExchanger(q: number, u: number, lmtd: number): CalcResult {
  const area = q * 1000 / (u * lmtd);
  return {
    steps: [
      `Q (Heat Duty) = ${q} kW = ${q * 1000} W`,
      `U (Overall HTC) = ${u} W/m²·K`,
      `LMTD = ${lmtd} °C`,
      `A = Q / (U × LMTD) = ${q * 1000} / (${u} × ${lmtd})`,
    ],
    result: area.toFixed(2), unit: 'm² required area',
  };
}

function calcPipeFlow(d: number, v: number, rho: number, mu: number): CalcResult {
  const re = (rho * v * d) / mu;
  const regime = re < 2300 ? 'Laminar' : re < 4000 ? 'Transitional' : 'Turbulent';
  const f = re < 2300 ? 64 / re : 0.316 / Math.pow(re, 0.25);
  return {
    steps: [
      `D = ${d} m, v = ${v} m/s, ρ = ${rho} kg/m³, μ = ${mu} Pa·s`,
      `Re = ρvD/μ = ${rho}×${v}×${d}/${mu} = ${re.toFixed(0)}`,
      `Flow regime: ${regime}`,
      `Friction factor f = ${f.toFixed(5)} (${re < 2300 ? 'Hagen-Poiseuille' : 'Blasius correlation'})`,
    ],
    result: re.toFixed(0), unit: `Reynolds number — ${regime} flow`,
  };
}

function calcThermo(t1: number, p1: number, p2: number, gamma: number): CalcResult {
  const exp = (gamma - 1) / gamma;
  const t2 = t1 * Math.pow(p2 / p1, exp);
  const work = (gamma / (gamma - 1)) * 8.314 * (t2 - t1);
  return {
    steps: [
      `T₁ = ${t1} K, P₁ = ${p1} bar, P₂ = ${p2} bar, γ = ${gamma}`,
      `Isentropic exponent = (γ-1)/γ = ${exp.toFixed(4)}`,
      `T₂ = T₁ × (P₂/P₁)^((γ-1)/γ) = ${t1} × ${(p2/p1).toFixed(3)}^${exp.toFixed(3)}`,
      `T₂ = ${t2.toFixed(1)} K (${(t2 - 273.15).toFixed(1)} °C)`,
      `Isentropic work W = γ/(γ-1) × R × ΔT = ${work.toFixed(0)} J/mol`,
    ],
    result: t2.toFixed(1), unit: `K exit temperature · Work = ${work.toFixed(0)} J/mol`,
  };
}

const UNIT_TABLE = [
  { cat: 'Pressure', from: 'bar', to: 'psi',  fn: (v: number) => v * 14.5038 },
  { cat: 'Pressure', from: 'bar', to: 'kPa',  fn: (v: number) => v * 100 },
  { cat: 'Pressure', from: 'bar', to: 'atm',  fn: (v: number) => v * 0.986923 },
  { cat: 'Temperature', from: '°C', to: '°F', fn: (v: number) => v * 9/5 + 32 },
  { cat: 'Temperature', from: '°C', to: 'K',  fn: (v: number) => v + 273.15 },
  { cat: 'Flow', from: 'm³/h', to: 'L/s',     fn: (v: number) => v * 0.2778 },
  { cat: 'Flow', from: 'm³/h', to: 'GPM',     fn: (v: number) => v * 4.4029 },
  { cat: 'Power', from: 'kW', to: 'HP',       fn: (v: number) => v * 1.34102 },
  { cat: 'Power', from: 'kW', to: 'BTU/h',    fn: (v: number) => v * 3412.14 },
];

function Field({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#8290A3' }}>{label} ({unit})</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl text-[13px] focus:outline-none transition-all"
        style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', color: '#172B4D' }} />
    </div>
  );
}

export function EngineeringPage() {
  const [active, setActive] = useState<CalcId>('heatex');
  const [result, setResult] = useState<CalcResult | null>(null);
  const [q, setQ] = useState('500'); const [u, setU] = useState('800'); const [lmtd, setLmtd] = useState('45');
  const [d, setD] = useState('0.1'); const [v, setV] = useState('2.5'); const [rho, setRho] = useState('850'); const [mu, setMu] = useState('0.003');
  const [t1, setT1] = useState('300'); const [p1, setP1] = useState('1'); const [p2, setP2] = useState('5'); const [gamma, setGamma] = useState('1.4');
  const [unitVal, setUnitVal] = useState('');

  function calculate() {
    if (active === 'heatex') setResult(calcHeatExchanger(+q, +u, +lmtd));
    else if (active === 'pipeflow') setResult(calcPipeFlow(+d, +v, +rho, +mu));
    else if (active === 'thermo') setResult(calcThermo(+t1, +p1, +p2, +gamma));
  }

  const tabs: { id: CalcId; label: string }[] = [
    { id: 'heatex', label: 'Heat Exchanger' },
    { id: 'pipeflow', label: 'Pipe Flow' },
    { id: 'thermo', label: 'Thermodynamics' },
    { id: 'units', label: 'Unit Converter' },
  ];

  return (
    <div className="max-w-[860px] mx-auto px-4 py-4 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#FFFBEB', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Calculator className="w-5 h-5 text-warning" />
        </div>
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: '#172B4D' }}>Engineering Calculator</h1>
          <p className="text-[12px]" style={{ color: '#68758A' }}>Industrial calculations with step-by-step derivations · On-premises</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.55)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setActive(t.id); setResult(null); }}
            className="flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={active === t.id ? { background: '#F97316', color: '#fff', boxShadow: '0 2px 8px rgba(249,115,22,0.35)' } : { color: '#68758A' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="action-card flex flex-col gap-4 p-6">
        {active === 'heatex' && (
          <>
            <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>Heat Exchanger Sizing — Required Area (A = Q / U·LMTD)</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Heat Duty Q" unit="kW" value={q} onChange={setQ} />
              <Field label="Overall HTC U" unit="W/m²·K" value={u} onChange={setU} />
              <Field label="LMTD" unit="°C" value={lmtd} onChange={setLmtd} />
            </div>
          </>
        )}
        {active === 'pipeflow' && (
          <>
            <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>Pipe Flow Analysis — Reynolds Number & Friction Factor</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Diameter D" unit="m" value={d} onChange={setD} />
              <Field label="Velocity v" unit="m/s" value={v} onChange={setV} />
              <Field label="Density ρ" unit="kg/m³" value={rho} onChange={setRho} />
              <Field label="Viscosity μ" unit="Pa·s" value={mu} onChange={setMu} />
            </div>
          </>
        )}
        {active === 'thermo' && (
          <>
            <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>Isentropic Compression — Exit Temperature & Work</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inlet Temp T₁" unit="K" value={t1} onChange={setT1} />
              <Field label="Inlet Pressure P₁" unit="bar" value={p1} onChange={setP1} />
              <Field label="Exit Pressure P₂" unit="bar" value={p2} onChange={setP2} />
              <Field label="Heat Ratio γ" unit="Cp/Cv" value={gamma} onChange={setGamma} />
            </div>
          </>
        )}
        {active === 'units' && (
          <div className="space-y-4">
            <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>Industrial Unit Converter</p>
            <input type="number" value={unitVal} onChange={e => setUnitVal(e.target.value)} placeholder="Enter value to convert…"
              className="w-full px-3 py-2 rounded-xl text-[13px] focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.65)', color: '#172B4D' }} />
            {['Pressure', 'Temperature', 'Flow', 'Power'].map(cat => (
              <div key={cat}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#8290A3' }}>{cat}</p>
                <div className="space-y-1">
                  {UNIT_TABLE.filter(r => r.cat === cat).map(row => {
                    const val = parseFloat(unitVal);
                    const converted = !isNaN(val) ? row.fn(val).toFixed(4) : '—';
                    return (
                      <div key={row.to} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.40)' }}>
                        <span className="text-[12px]" style={{ color: '#68758A' }}>{row.from} → {row.to}</span>
                        <span className="text-[13px] font-bold" style={{ color: '#172B4D' }}>{converted} {row.to}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {active !== 'units' && (
          <button onClick={calculate} className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg,#FF9F50,#F97316)', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}>
            Calculate
          </button>
        )}
      </div>

      {result && (
        <div className="action-card flex flex-col gap-3 p-5 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>Calculation Complete — Steps Shown</span>
          </div>
          <div className="space-y-1.5 pl-1">
            {result.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#F97316' }} />
                <span className="text-[12px] font-mono" style={{ color: '#68758A' }}>{s}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 px-4 py-3 rounded-xl" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.20)' }}>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#8290A3' }}>Result</p>
            <p className="text-[26px] font-bold" style={{ color: '#F97316' }}>{result.result} <span className="text-[13px] font-normal" style={{ color: '#68758A' }}>{result.unit}</span></p>
          </div>
        </div>
      )}
      <p className="text-[11px] text-center" style={{ color: '#8290A3' }}>All calculations run locally · No external API calls · Sovereign deployment</p>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Code2, Play, CheckCircle2, AlertCircle, Clock,
  Trash2, Square, ChevronRight, Sparkles, ArrowRight, Loader2,
} from 'lucide-react';
import { generateCode, executeCode } from '@/lib/api';

interface RunRecord {
  id: string;
  prompt: string;
  code: string;
  output: string;
  exitCode: number;
  elapsed: number;
  time: string;
}

const SUGGESTIONS = [
  'Anomaly detection on temperature sensor readings',
  'Pump efficiency given flow rate, head and shaft power',
  'Darcy-Weisbach pressure drop in a pipe',
  'Heat exchanger NTU-effectiveness analysis',
  'Vibration RMS and frequency spectrum from raw samples',
  'Corrosion rate calculation using weight loss method',
  'Compressor polytropic efficiency',
  'Relief valve sizing using API 520',
];

const MODELS = [
  { id: 'qwen2.5:7b-instruct-q4_K_M', label: 'Qwen 2.5 7B' },
];

let _rc = 0;
const runId = () => `r${++_rc}`;

type Phase = 'idle' | 'generating' | 'running';

export function CodeLabPage() {
  const [prompt, setPrompt]           = useState('');
  const [code, setCode]               = useState('');
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [phase, setPhase]             = useState<Phase>('idle');
  const [exitCode, setExitCode]       = useState<number | null>(null);
  const [elapsed, setElapsed]         = useState<number | null>(null);
  const [model]                       = useState(MODELS[0].id);
  const [history, setHistory]         = useState<RunRecord[]>([]);
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [, setError]                  = useState<string | null>(null);

  const abortRef  = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const codeRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (outputRef.current)
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [outputLines]);

  // After code is generated, scroll editor to top
  useEffect(() => {
    if (codeRef.current) codeRef.current.scrollTop = 0;
  }, [code]);

  const runCode = useCallback(async (codeToRun: string, promptText: string) => {
    abortRef.current = new AbortController();
    setPhase('running');
    setOutputLines([]);
    setExitCode(null);
    setElapsed(null);
    setError(null);
    setActiveId(null);

    const lines: string[] = [];
    try {
      await executeCode(
        codeToRun,
        (line) => { lines.push(line); setOutputLines([...lines]); },
        (rc, secs) => {
          setExitCode(rc);
          setElapsed(secs);
          setPhase('idle');
          const id = runId();
          const record: RunRecord = {
            id, prompt: promptText,
            code: codeToRun,
            output: lines.join('\n'),
            exitCode: rc, elapsed: secs,
            time: new Date().toLocaleTimeString(),
          };
          setHistory(prev => [record, ...prev.slice(0, 14)]);
          setActiveId(id);
        },
        abortRef.current.signal,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setOutputLines(prev => [...prev, '', '⛔ Stopped by user.']);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setOutputLines(prev => [...prev, `❌ ${msg}`]);
        setError(msg);
      }
      setPhase('idle');
      setExitCode(-1);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || phase !== 'idle') return;
    abortRef.current = new AbortController();
    setPhase('generating');
    setCode('');
    setOutputLines([]);
    setExitCode(null);
    setElapsed(null);
    setError(null);
    setActiveId(null);

    try {
      await generateCode(
        prompt,
        model,
        () => {
          // Don't show raw tokens in editor — wait for final cleaned code
          // Just keep phase as 'generating' so the spinner shows
        },
        async (finalCode) => {
          setCode(finalCode);
          // Auto-run immediately after generation
          await runCode(finalCode, prompt);
        },
        abortRef.current.signal,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setOutputLines(['⛔ Generation stopped by user.']);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setOutputLines([`❌ ${msg}`]);
      }
      setPhase('idle');
    }
  }, [prompt, model, phase, runCode]);

  function handleStop() {
    abortRef.current?.abort();
    setPhase('idle');
  }

  function handleRunManual() {
    if (code.trim()) runCode(code, prompt || '# manual run');
  }

  function loadHistory(r: RunRecord) {
    setPrompt(r.prompt);
    setCode(r.code);
    setOutputLines(r.output.split('\n'));
    setExitCode(r.exitCode);
    setElapsed(r.elapsed);
    setActiveId(r.id);
    setPhase('idle');
  }

  const busy = phase !== 'idle';
  const isSuccess = exitCode === 0;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: '#F5F3FF', border: '1px solid rgba(139,92,246,0.20)' }}>
          <Code2 className="w-5 h-5" style={{ color: '#8B5CF6' }} />
        </div>
        <div>
          <h1 className="text-[20px] font-bold" style={{ color: '#172B4D' }}>Code Lab</h1>
          <p className="text-[12px]" style={{ color: '#68758A' }}>
            Describe a calculation → AI generates Python → runs instantly
          </p>
        </div>
      </div>

      {/* ── Prompt box ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: '0 2px 12px rgba(30,40,55,0.06)' }}>

        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: '#8B5CF6' }} />
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
              placeholder="Describe what you want to calculate or analyse… e.g. 'Anomaly detection on vibration sensor readings'"
              rows={2}
              disabled={busy}
              className="flex-1 bg-transparent text-[13.5px] focus:outline-none resize-none leading-relaxed disabled:opacity-50"
              style={{ color: '#172B4D' }}
            />
          </div>
        </div>

        {/* Suggestions */}
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => setPrompt(s)}
              disabled={busy}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all hover:shadow-sm disabled:opacity-40"
              style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.18)', color: '#6D28D9' }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ borderTop: '1px solid rgba(200,185,165,0.25)' }}>

          {/* Model badge — fixed to coder model */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium"
            style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', color: '#6D28D9' }}>
            <Code2 className="w-3.5 h-3.5" />
            Qwen 2.5 7B
          </div>

          <div className="flex items-center gap-2">
            {busy && (
              <button onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white"
                style={{ background: '#EF4444' }}>
                <Square className="w-3 h-3" /> Stop
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || busy}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#A78BFA,#8B5CF6)', boxShadow: '0 2px 10px rgba(139,92,246,0.35)' }}
            >
              {phase === 'generating'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                : phase === 'running'
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
                  : <><Sparkles className="w-3.5 h-3.5" /> Generate &amp; Run</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Editor + Output ── */}
      {(code || outputLines.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Editor */}
          <div className="rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'rgba(255,255,255,0.68)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: '0 2px 12px rgba(30,40,55,0.06)' }}>

            <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(200,185,165,0.25)' }}>
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#EF4444' }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#F59E0B' }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#22C55E' }} />
                </div>
                <span className="text-[11px] font-semibold ml-1" style={{ color: '#8290A3' }}>
                  {phase === 'generating' ? 'generating…' : 'generated.py'}
                </span>
                {phase === 'generating' && (
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#8B5CF6' }} />
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setCode('')} disabled={busy}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/50 disabled:opacity-40"
                  style={{ color: '#8290A3' }} title="Clear">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleRunManual}
                  disabled={!code.trim() || busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#FF9F50,#F97316)' }}
                  title="Run current code"
                >
                  <Play className="w-3 h-3" /> Run
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            <textarea
              ref={codeRef}
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const s = e.currentTarget;
                  const st = s.selectionStart, en = s.selectionEnd;
                  const next = code.slice(0, st) + '    ' + code.slice(en);
                  setCode(next);
                  requestAnimationFrame(() => { s.selectionStart = s.selectionEnd = st + 4; });
                }
              }}
              spellCheck={false}
              className="flex-1 w-full resize-none focus:outline-none font-mono text-[12.5px] leading-relaxed p-4"
              style={{ background: 'transparent', color: '#172B4D', minHeight: 360, tabSize: 4 }}
            />
          </div>

          {/* Output terminal */}
          <div className="rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'rgba(17,21,28,0.95)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 2px 16px rgba(0,0,0,0.22)' }}>

            <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-2">
                <ChevronRight className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />
                <span className="text-[11px] font-semibold" style={{ color: '#6B7280' }}>stdout</span>
              </div>
              <div className="flex items-center gap-2">
                {phase === 'running' && (
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: '#F59E0B' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    running…
                  </span>
                )}
                {phase === 'idle' && exitCode !== null && (
                  <div className="flex items-center gap-1.5">
                    {isSuccess
                      ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#22C55E' }} />
                      : <AlertCircle className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />}
                    <span className="text-[11px]" style={{ color: isSuccess ? '#22C55E' : '#EF4444' }}>
                      exit {exitCode}
                    </span>
                    {elapsed !== null && (
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: '#4B5563' }}>
                        <Clock className="w-3 h-3" /> {elapsed}s
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div ref={outputRef}
              className="flex-1 p-4 overflow-y-auto font-mono text-[12.5px] leading-relaxed"
              style={{ minHeight: 360, maxHeight: 480 }}>
              {outputLines.length === 0 && phase !== 'running' && (
                <span style={{ color: '#374151' }}>Output will appear here…</span>
              )}
              {outputLines.map((line, i) => (
                <div key={i} style={{
                  color: /Traceback|^\s+File |Error:|❌/.test(line)
                    ? '#F87171'
                    : /^⚠|^⏱|^Warning/.test(line)
                      ? '#FBBF24'
                      : /^✓|^✔|DETECTED|ANOMAL/.test(line)
                        ? '#4ADE80'
                        : '#E2E8F0',
                }}>
                  {line || '\u00A0'}
                </div>
              ))}
              {phase === 'running' && (
                <div className="flex items-center gap-1 mt-1">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: '#4B5563', animationDelay: `${d}ms` }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Run History ── */}
      {history.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#8290A3' }}>
            Run History
          </p>
          <div className="space-y-1.5">
            {history.map(r => (
              <button key={r.id} onClick={() => loadHistory(r)}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all hover:bg-white/30"
                style={{
                  background: r.id === activeId ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.40)',
                  border: `1px solid ${r.id === activeId ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.50)'}`,
                  backdropFilter: 'blur(12px)',
                }}>
                {r.exitCode === 0
                  ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#22C55E' }} />
                  : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#EF4444' }} />}
                <span className="text-[11px] font-mono flex-shrink-0" style={{ color: '#8290A3' }}>{r.time}</span>
                <span className="text-[12.5px] truncate flex-1" style={{ color: '#172B4D' }}>{r.prompt}</span>
                <span className="text-[11px] flex-shrink-0" style={{ color: '#8290A3' }}>{r.elapsed}s</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-center" style={{ color: '#8290A3' }}>
        AI code generation · Real-time Python execution · 15s timeout · Standard library only
      </p>
    </div>
  );
}

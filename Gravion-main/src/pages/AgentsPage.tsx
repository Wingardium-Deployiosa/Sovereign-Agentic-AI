import { useState, useEffect, useRef } from 'react';
import {
  Bot, CheckCircle2, Clock, AlertTriangle, Play, Square,
  RefreshCw, Cpu, FileSearch, ScanLine, Code2, BookOpen,
  Activity, Loader2, ArrowRight, ChevronRight,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

type AgentStatus = 'idle' | 'running' | 'completed' | 'error';
type LogType = 'info' | 'success' | 'error' | 'tool' | 'done';

interface LogEntry { time: string; agent: string; message: string; type: LogType; }

interface AgentInfo {
  id: string; name: string; role: string; model: string; tools: string[];
}

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  doc:  FileSearch,
  vis:  ScanLine,
  code: Code2,
  rag:  BookOpen,
  tel:  Activity,
  orch: Cpu,
};

const STATUS_CONFIG: Record<AgentStatus, {
  label: string; color: string; bg: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  idle:      { label: 'Idle',    color: '#8290A3', bg: 'rgba(130,144,163,0.10)', icon: Clock },
  running:   { label: 'Running', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)',  icon: RefreshCw },
  completed: { label: 'Done',    color: '#22C55E', bg: 'rgba(34,197,94,0.10)',   icon: CheckCircle2 },
  error:     { label: 'Error',   color: '#EF4444', bg: 'rgba(239,68,68,0.10)',   icon: AlertTriangle },
};

const LOG_COLORS: Record<LogType, string> = {
  info:    '#68758A',
  success: '#22C55E',
  error:   '#EF4444',
  tool:    '#F97316',
  done:    '#22C55E',
};

const SUGGESTIONS = [
  'Analyze the pump inspection report and summarize findings',
  'What are the recommended maintenance actions from indexed documents?',
  'Calculate pump efficiency given flow rate, head and shaft power',
  'Search knowledge base for valve maintenance procedures',
  'Explain common vibration anomalies in refinery centrifugal pumps',
  'Generate an inspection summary report from indexed documents',
];

export function AgentsPage() {
  const [agents,      setAgents]      = useState<AgentInfo[]>([]);
  const [statuses,    setStatuses]    = useState<Record<string, AgentStatus>>({});
  const [logs,        setLogs]        = useState<LogEntry[]>([]);
  const [running,     setRunning]     = useState(false);
  const [task,        setTask]        = useState('');
  const [resultMsg,   setResultMsg]   = useState<string | null>(null);
  const [taskType,    setTaskType]    = useState<string | null>(null);
  const abortRef  = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Load real agent list on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/agents/status`)
      .then(r => r.json())
      .then(d => {
        setAgents(d.agents);
        const s: Record<string, AgentStatus> = {};
        d.agents.forEach((a: AgentInfo) => { s[a.id] = 'idle'; });
        setStatuses(s);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  async function runWorkflow() {
    if (!task.trim() || running) return;
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setResultMsg(null);
    setTaskType(null);

    // Set all agents to idle first
    setStatuses(prev => Object.fromEntries(Object.keys(prev).map(k => [k, 'idle'])));

    try {
      const res = await fetch(`${API_BASE_URL}/agents/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, model: 'qwen2.5:7b-instruct-q4_K_M' }),
        signal: abortRef.current.signal,
      });

      const reader  = res.body!.getReader();
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
          try {
            const evt = JSON.parse(part.slice(6));

            if (evt.message === '__DONE__') {
              setResultMsg(evt.result?.message ?? null);
              setTaskType(evt.task_type ?? null);
              // Mark active agents as completed
              setStatuses(prev => {
                const next = { ...prev };
                Object.keys(next).forEach(k => { if (next[k] === 'running') next[k] = 'completed'; });
                return next;
              });
              setRunning(false);
              continue;
            }

            // Update agent status based on log type
  // Map backend agent names → frontend agent ids
  const AGENT_NAME_MAP: Record<string, string> = {
    'DocReason':        'doc',
    'VisionCore':       'vis',
    'CodeAgent':        'code',
    'KnowledgeSearch':  'rag',
    'TelemetryCore':    'tel',
    'ReportAgent':      'doc',
    'EngineeringAgent': 'doc',
    'Orchestrator':     'orch',
  };

            const agentId = AGENT_NAME_MAP[evt.agent];
            if (agentId) {
              setStatuses(prev => ({
                ...prev,
                [agentId]: evt.type === 'error' ? 'error' : evt.type === 'success' ? 'completed' : 'running',
              }));
            }

            setLogs(prev => [...prev, { time: evt.time, agent: evt.agent, message: evt.message, type: evt.type }]);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), agent: 'System', message: `Error: ${err.message}`, type: 'error' }]);
      }
      setRunning(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
    setStatuses(prev => Object.fromEntries(Object.keys(prev).map(k => [prev[k] === 'running' ? k : k, prev[k] === 'running' ? 'idle' : prev[k]])));
  }

  function reset() {
    stop();
    setLogs([]);
    setResultMsg(null);
    setTaskType(null);
    setStatuses(prev => Object.fromEntries(Object.keys(prev).map(k => [k, 'idle'])));
  }

  return (
    <div className="max-w-[960px] mx-auto px-4 py-4 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: '#F0FDF4', border: '1px solid rgba(34,197,94,0.2)' }}>
            <Bot className="w-5 h-5 text-success" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: '#172B4D' }}>Agent Orchestration</h1>
            <p className="text-[12px]" style={{ color: '#68758A' }}>
              Real multi-agent workflows · Local Ollama models · Live execution logs
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} disabled={running}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.60)', color: '#68758A', backdropFilter: 'blur(12px)' }}>
            <Square className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Task input */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.65)', boxShadow: '0 2px 12px rgba(30,40,55,0.06)' }}>
        <div className="px-4 pt-4 pb-2 flex items-start gap-3">
          <Bot className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: '#22C55E' }} />
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runWorkflow(); } }}
            placeholder="Describe a task for the agents… e.g. 'Analyze the pump inspection report and summarize findings'"
            rows={2}
            disabled={running}
            className="flex-1 bg-transparent text-[13.5px] focus:outline-none resize-none leading-relaxed disabled:opacity-50"
            style={{ color: '#172B4D' }}
          />
        </div>

        {/* Suggestions */}
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => setTask(s)} disabled={running}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all hover:shadow-sm disabled:opacity-40"
              style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)', color: '#16A34A' }}>
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2.5"
          style={{ borderTop: '1px solid rgba(200,185,165,0.25)' }}>
          {running && (
            <button onClick={stop}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white"
              style={{ background: '#EF4444' }}>
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
          <button onClick={runWorkflow} disabled={!task.trim() || running}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#34d399,#22C55E)', boxShadow: '0 2px 10px rgba(34,197,94,0.35)' }}>
            {running
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
              : <><Play className="w-3.5 h-3.5" /> Run Workflow</>}
          </button>
        </div>
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map(agent => {
          const status = statuses[agent.id] ?? 'idle';
          const cfg    = STATUS_CONFIG[status];
          const StatusIcon = cfg.icon;
          const AgentIcon  = AGENT_ICONS[agent.id] ?? Bot;
          return (
            <div key={agent.id} className="action-card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between w-full">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.20)' }}>
                    <AgentIcon className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>{agent.name}</p>
                    <p className="text-[11px]" style={{ color: '#8290A3' }}>{agent.role}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: cfg.bg, color: cfg.color }}>
                  <StatusIcon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
                  {cfg.label}
                </span>
              </div>
              <div className="w-full space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: '#8290A3' }}>Model</span>
                  <span className="font-mono font-semibold truncate max-w-[160px]" style={{ color: '#172B4D' }}>{agent.model}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 w-full">
                {agent.tools.map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                    style={{ background: 'rgba(249,115,22,0.08)', color: '#F97316', border: '1px solid rgba(249,115,22,0.15)' }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live execution log */}
      {logs.length > 0 && (
        <div className="action-card flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4" style={{ color: '#22C55E' }} />
            <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>Live Execution Log</p>
            {running && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" style={{ color: '#F97316' }} />}
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-3 animate-fade-in">
                <span className="text-[10px] font-mono flex-shrink-0 mt-0.5" style={{ color: '#8290A3' }}>{log.time}</span>
                <span className="text-[11px] font-semibold flex-shrink-0 w-28 truncate" style={{ color: '#F97316' }}>{log.agent}</span>
                <span className="text-[12px]" style={{ color: LOG_COLORS[log.type] }}>{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          {/* Result */}
          {resultMsg && !running && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)' }}>
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                <span className="text-[12px] font-semibold text-success">
                  Workflow complete · {taskType?.replace(/_/g, ' ')} · No external calls made
                </span>
              </div>
              <div className="px-4 py-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(200,185,165,0.30)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#8290A3' }}>Agent Response</p>
                <p className="text-[13px] leading-relaxed" style={{ color: '#172B4D' }}>{resultMsg}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {logs.length === 0 && !running && (
        <div className="flex flex-col items-center justify-center py-10 rounded-2xl"
          style={{ border: '2px dashed rgba(34,197,94,0.25)', background: 'rgba(255,255,255,0.30)' }}>
          <Bot className="w-10 h-10 mb-3" style={{ color: '#8290A3' }} />
          <p className="text-[13px] font-semibold mb-1" style={{ color: '#172B4D' }}>Ready to run a workflow</p>
          <p className="text-[12px]" style={{ color: '#8290A3' }}>
            Type a task above or pick a suggestion · Agents will route automatically
          </p>
          <div className="flex items-center gap-1.5 mt-3 text-[11px]" style={{ color: '#8290A3' }}>
            <ArrowRight className="w-3 h-3" /> Enter task → Orchestrator routes → Agent executes → Live logs stream
          </div>
        </div>
      )}

      <p className="text-[11px] text-center" style={{ color: '#8290A3' }}>
        All agents run on local Ollama · Open-weight models · Zero cloud dependency
      </p>
    </div>
  );
}

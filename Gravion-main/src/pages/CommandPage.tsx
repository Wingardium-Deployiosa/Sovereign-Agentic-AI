import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowRight, Paperclip, ScanLine, FileSearch, Activity,
  Calculator, FileBarChart, Code2, BookOpen,
  Check, Loader2, Bot, RefreshCw, AlertCircle, ChevronDown, ChevronRight, X, Image, BrainCircuit, Square
} from 'lucide-react';
import { postCommand, streamCommand, type CommandResponse, type HistoryMessage } from '@/lib/api';
import { CommandResponseView } from '@/components/CommandResponseView';
import { FormattedMessage } from '@/components/FormattedMessage';
import type { TimelineStep } from '@/components/ActivityTimeline';
import type { ChatSession, ChatMessage } from '@/lib/sessions';
import type { ViewId } from '@/lib/nav';

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
// ChatMessage is imported from sessions.ts

/* ─────────────────────────────────────────────
   Action cards config
───────────────────────────────────────────── */
const ACTION_CARDS = [
  {
    icon: FileSearch,
    label: 'Analyze Document',
    desc: 'Extract insights from reports, drawings and files',
    prompt: 'Analyze document: summarize key findings from indexed documents',
    iconBg: 'bg-[#FFF4ED]',
    iconColor: 'text-accent',
  },
  {
    icon: ScanLine,
    label: 'Inspect Equipment',
    desc: 'Analyze images and inspection data',
    prompt: 'Inspect equipment: go to the Equipment Inspection page to upload and analyze an equipment image',
    iconBg: 'bg-[#F0FDF4]',
    iconColor: 'text-success',
  },
  {
    icon: Activity,
    label: 'Analyze Telemetry',
    desc: 'Find patterns and anomalies',
    prompt: 'Analyze telemetry: explain common vibration and sensor anomalies in refinery equipment',
    iconBg: 'bg-[#EFF6FF]',
    iconColor: 'text-info',
  },
  {
    icon: Calculator,
    label: 'Calculate Engineering Value',
    desc: 'Run calculations and simulations',
    prompt: 'Calculate engineering value: what calculations can you help with for refinery equipment?',
    iconBg: 'bg-[#FFFBEB]',
    iconColor: 'text-warning',
  },
  {
    icon: FileBarChart,
    label: 'Generate Report',
    desc: 'Create professional reports',
    prompt: 'Generate report: create an equipment condition summary report from indexed documents',
    iconBg: 'bg-[#FEF2F2]',
    iconColor: 'text-danger',
  },
  {
    icon: Code2,
    label: 'Run Code',
    desc: 'Execute and debug code',
    prompt: 'Run code: write a Python script to calculate pump efficiency given flow rate, head, and power',
    iconBg: 'bg-[#F5F3FF]',
    iconColor: 'text-purple',
  },
  {
    icon: BookOpen,
    label: 'Search Knowledge',
    desc: 'Find information across your organization',
    prompt: 'Search knowledge: what information is available in the knowledge base?',
    iconBg: 'bg-[#F0FDF4]',
    iconColor: 'text-success',
  },
] as const;

/* ─────────────────────────────────────────────
   Timeline helpers
───────────────────────────────────────────── */
const TIMELINE_LABELS = [
  'Command received', 'Intent identified', 'Task classified',
  'Agent selected', 'Tool executed', 'Evidence retrieved', 'Result validated',
];

const BASE_STEPS: TimelineStep[] = TIMELINE_LABELS.map((label) => ({ label, done: false }));

function buildTimeline(data: CommandResponse): TimelineStep[] {
  const steps = BASE_STEPS.map((s) => ({ ...s }));
  steps[0].done = true;
  if (data.command || data.message) steps[1].done = true;
  if (data.task_type || data.message) steps[2].done = true;
  if ((data.agents && data.agents.length > 0) || data.message) steps[3].done = true;
  if (data.message) steps[4].done = true;
  if (data.message || (data.evidence && data.evidence.length > 0)) steps[5].done = true;
  if (data.message || typeof data.confidence === 'number' || (data.checklist_items && data.checklist_items.length > 0)) steps[6].done = true;
  return steps;
}

/* ─────────────────────────────────────────────
   Models — actual Ollama models used by backend
───────────────────────────────────────────── */
const MODELS = [
  { id: 'qwen3:8b', label: 'Qwen 3 8B', desc: 'Advanced Reasoning (Default)', vision: false, code: true, reasoning: true },
  { id: 'deepseek-r1:8b', label: 'DeepSeek R1 8B', desc: 'Alternative Reasoning', vision: false, code: true, reasoning: true },
  { id: 'qwen3-vl:4b-thinking', label: 'Qwen 3 VL 4B', desc: 'VL Reasoning', vision: true, code: true, reasoning: true },
  { id: 'qwen2.5:7b-instruct-q4_K_M', label: 'Qwen 2.5 7B', desc: 'RAG · High Accuracy', vision: false, code: true, reasoning: false },
  { id: 'mistral:7b-instruct-q4_K_M', label: 'Mistral 7B', desc: 'General Instructions', vision: false, code: false, reasoning: false },
  { id: 'llava:latest', label: 'LLaVA', desc: 'Vision · Inspection', vision: true, code: false, reasoning: false },
  { id: 'qwen2.5vl:3b-q8_0', label: 'Qwen 2.5 VL 3B', desc: 'Vision · Fast', vision: true, code: false, reasoning: false },
];

const DEFAULT_MODEL = 'qwen3:8b';
const DEFAULT_VISION = 'llava:latest';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */

function CustomModelSelector({
  model,
  setModel,
  visionModel,
  setVisionModel,
  attachedImage
}: {
  model: string;
  setModel: (v: string) => void;
  visionModel: string;
  setVisionModel: (v: string) => void;
  attachedImage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [visionOpen, setVisionOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setVisionOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentModel = MODELS.find(m => m.id === model) || MODELS[0];
  const textModels = MODELS.filter(m => !m.vision);
  const visionModels = MODELS.filter(m => m.vision);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => { setOpen(!open); setVisionOpen(false); }}
        aria-label="Select model"
        className="flex items-center justify-between gap-3 border rounded-full pl-3.5 pr-2.5 py-1.5 text-[13px] font-medium focus:outline-none transition-all"
        style={{
          background: attachedImage ? 'rgba(249,115,22,0.10)' : 'rgba(245,241,235,0.80)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderColor: attachedImage ? 'rgba(249,115,22,0.50)' : 'rgba(200,188,170,0.55)',
          color: attachedImage ? '#F97316' : '#172B4D',
          minWidth: '220px'
        }}
      >
        <span>{currentModel.vision ? '👁 ' : ''}{currentModel.label} — {currentModel.desc}</span>
        <ChevronDown className="w-4 h-4 opacity-70" />
      </button>

      {open && (
        <div 
          className="absolute bottom-full right-0 mb-2 w-72 bg-white rounded-2xl shadow-xl border animate-fade-in flex flex-col z-[100]"
          style={{ borderColor: 'rgba(200,188,170,0.55)' }}
        >
          {/* Main Models */}
          <div className="p-2 custom-scrollbar">
            <div className="px-2 py-1 text-[10px] uppercase font-bold text-text-tertiary tracking-wider mb-1">Select Model</div>
            
            {/* Text Models */}
            {textModels.map(m => (
              <button
                key={m.id}
                onClick={() => { setModel(m.id); setOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-xl text-[13px] hover:bg-black/5 flex items-center justify-between transition-colors mb-0.5"
                style={{ 
                  background: model === m.id ? 'rgba(249,115,22,0.06)' : 'transparent',
                  color: model === m.id ? '#F97316' : '#172B4D', 
                  fontWeight: model === m.id ? 600 : 500 
                }}
              >
                <div className="flex flex-col">
                  <span>{m.label}</span>
                  <span className="text-[11px] font-normal opacity-70 mt-0.5">{m.desc}</span>
                </div>
                {model === m.id && <Check className="w-4 h-4 flex-shrink-0" />}
              </button>
            ))}

            <div className="my-1 border-t" style={{ borderColor: 'rgba(200,188,170,0.2)' }} />

            {/* Vision Models Dropright Trigger */}
            <div 
              className="relative"
              onMouseEnter={() => setVisionOpen(true)}
              onMouseLeave={() => setVisionOpen(false)}
            >
              <button
                className="w-full text-left px-3 py-2 rounded-xl text-[13px] hover:bg-black/5 flex items-center justify-between transition-colors"
                style={{ color: '#172B4D', fontWeight: 500 }}
              >
                <div className="flex flex-col">
                  <span>👁 Vision Models</span>
                  <span className="text-[11px] font-normal opacity-70 mt-0.5">For image processing</span>
                </div>
                <ChevronDown className="w-4 h-4 flex-shrink-0 -rotate-90 opacity-70" />
              </button>

              {/* Nested Dropright Menu */}
              {visionOpen && (
                <div 
                  className="absolute bottom-0 right-[100%] mr-1 w-64 bg-white rounded-2xl shadow-xl border animate-fade-in flex flex-col z-[101] p-2"
                  style={{ borderColor: 'rgba(200,188,170,0.55)' }}
                >
                  <div className="px-2 py-1 text-[10px] uppercase font-bold text-text-tertiary tracking-wider mb-1">Vision Models</div>
                  {visionModels.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setModel(m.id); setOpen(false); setVisionOpen(false); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-[13px] hover:bg-black/5 flex items-center justify-between transition-colors mb-0.5"
                      style={{ 
                        background: model === m.id ? 'rgba(249,115,22,0.06)' : 'transparent',
                        color: model === m.id ? '#F97316' : '#172B4D', 
                        fontWeight: model === m.id ? 600 : 500 
                      }}
                    >
                      <div className="flex flex-col">
                        <span>{m.label}</span>
                        <span className="text-[11px] font-normal opacity-70 mt-0.5">{m.desc}</span>
                      </div>
                      {model === m.id && <Check className="w-4 h-4 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

/** Hero section with industrial background */
function HeroSection({ onCardClick, loading }: { onCardClick: (p: string) => void; loading: boolean }) {
  return (
    <div className="flex flex-col min-h-full">

      {/* ── Hero banner ── */}
      <div
        className="relative overflow-hidden"
        style={{ minHeight: 300, backgroundColor: '#F7F4EE' }}
      >
        {/* Full image layer */}
        <img
          src="/gravion-industrial-background.png"
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            objectFit: 'fill', objectPosition: 'center',
            pointerEvents: 'none', zIndex: 0, opacity: 1,
          }}
        />

        {/* Left-side gradient — warm cream, keeps refinery visible on right */}
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
            background: 'linear-gradient(90deg, rgba(247,244,238,0.97) 0%, rgba(247,244,238,0.90) 28%, rgba(247,244,238,0.50) 52%, rgba(247,244,238,0.08) 74%, rgba(247,244,238,0) 100%)',
          }}
        />

        {/* PEOPLE / PROCESS / PRECISION — top right */}
        <div className="absolute top-7 right-8 hidden lg:flex items-start gap-2.5" style={{ zIndex: 2 }}>
          <div className="w-[2px] h-[52px] rounded-full mt-0.5" style={{ background: '#F97316' }} />
          <div className="text-[10.5px] font-bold tracking-[0.22em] uppercase leading-[1.85]" style={{ color: '#65758C' }}>
            <div>People</div>
            <div>Process</div>
            <div>Precision</div>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative px-6 sm:px-8 pt-8 pb-8 max-w-[640px]" style={{ zIndex: 2 }}>
          <p className="text-[11px] font-semibold uppercase mb-4" style={{ color: '#65758C', letterSpacing: '0.18em' }}>
            Powering Safer, Smarter Industry
          </p>
          <h1 className="font-bold leading-[1.12] mb-4" style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', color: '#172B4D' }}>
            How can I help with your{' '}
            <span style={{ color: '#F97316' }}>industrial operations</span>?
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: '#66758A' }}>
            Ask GRAVION to analyze, inspect, calculate, or execute.
          </p>
        </div>
      </div>

      {/* ── Action cards grid ── */}
      <div className="relative px-6 sm:px-8 pt-6 pb-4 flex-1" style={{ background: '#F7F4EE' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-[900px]">
          {ACTION_CARDS.map(({ icon: Icon, label, desc, prompt, iconBg, iconColor }) => (
            <button
              key={label}
              onClick={() => onCardClick(prompt)}
              disabled={loading}
              className="action-card flex items-start gap-3 p-4 text-left w-full disabled:opacity-60 disabled:cursor-not-allowed"
              aria-label={label}
            >
              <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold leading-snug" style={{ color: '#172B4D' }}>{label}</p>
                <p className="text-[12px] mt-0.5 leading-snug" style={{ color: '#68758A' }}>{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Bottom-right branding */}
        <div className="absolute bottom-6 right-8 text-right hidden lg:block">
          <p className="text-[9.5px] font-semibold tracking-[0.22em] text-text-tertiary uppercase leading-[1.9]">
            Confidential.<br />On Premises.<br />Built for Industry.
          </p>
          <div className="mt-1.5 ml-auto w-8 h-[2px] bg-accent rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** Single chat message bubble */
function MessageBubble({
  msg,
  onRetry,
  onNavigate,
}: {
  msg: ChatMessage;
  onRetry: (id: string) => void;
  onNavigate?: (view: ViewId) => void;
}) {
  const [loadingThoughtExpanded, setLoadingThoughtExpanded] = useState(true);

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] bg-accent-light border border-accent/20 rounded-2xl rounded-tr-sm px-4 py-2.5">
          {msg.imagePreview && (
            <img
              src={msg.imagePreview}
              alt="attachment"
              className="rounded-xl mb-2 max-h-48 object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <p className="text-[13.5px] text-navy leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-xl bg-accent-light border border-accent/25 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        {msg.error ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-danger">Command Unavailable</p>
                <p className="text-[13px] text-text-secondary mt-0.5">{msg.error}</p>
              </div>
            </div>
            <button
              onClick={() => onRetry(msg.id)}
              className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:text-accent-hover transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
          </div>
        ) : (
          <div className="animate-fade-in space-y-3">
            {/* Timeline for completed response */}
            {msg.response && msg.response.task_type !== 'general' && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 animate-fade-in mb-2">
                {buildTimeline(msg.response).map((step, i) => (
                  <div key={i} className="flex items-center gap-1">
                    {step.done ? (
                      <div className="w-3.5 h-3.5 rounded-full bg-success/15 border border-success/40 flex items-center justify-center">
                        <Check className="w-2 h-2 text-success" />
                      </div>
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full bg-surface-hover border border-border" />
                    )}
                    <span className={`text-[11px] ${step.done ? 'text-text-secondary' : 'text-text-tertiary'}`}>
                      {step.label}
                    </span>
                    {i < TIMELINE_LABELS.length - 1 && (
                      <span className="text-text-tertiary text-[10px] mx-0.5">›</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Thought process (streaming or completed) */}
            {msg.isReasoningModel !== false ? (
              (msg.streamingThought || (msg.response && msg.response.thought_process) || msg.loading) && (
                <div className="mb-2">
                  <button
                    onClick={() => setLoadingThoughtExpanded(!loadingThoughtExpanded)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors hover:bg-black/5"
                    style={{ background: 'rgba(23,43,77,0.04)', color: '#68758A' }}
                  >
                    <BrainCircuit className={`w-3.5 h-3.5 text-accent ${msg.loading ? 'animate-pulse' : ''}`} />
                    <span className={msg.loading ? 'animate-pulse' : ''}>
                      {msg.loading ? 'Thinking process...' : 'Thought Process'}
                    </span>
                    {loadingThoughtExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-70" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 ml-0.5 opacity-70" />
                    )}
                  </button>
                  {loadingThoughtExpanded && (
                    <div className="mt-2 pl-4 border-l-2 border-accent/20 animate-fade-in">
                      <p className="text-[13px] italic leading-relaxed whitespace-pre-wrap" style={{ color: '#68758A' }}>
                        {msg.streamingThought || (msg.response && msg.response.thought_process) || (msg.loading ? 'Analyzing request and retrieving context...' : 'Stopped.')}
                        {msg.loading && <span className="inline-block w-1.5 h-4 bg-accent/60 ml-0.5 animate-pulse" style={{ verticalAlign: 'text-bottom' }} />}
                      </p>
                    </div>
                  )}
                </div>
              )
            ) : (
              !msg.streamingMessage && !msg.text && msg.loading && (
                <div className="flex items-center gap-2 text-text-secondary mt-1 mb-2 animate-fade-in">
                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                  <span className="text-[13px] animate-pulse">Processing request...</span>
                </div>
              )
            )}

            {/* Message Text (streaming or completed) */}
            {(msg.streamingMessage || msg.text) && (
              <div className="relative">
                <FormattedMessage 
                  text={msg.streamingMessage || msg.text || ''} 
                  taskType={msg.response?.task_type} 
                  onNavigateInspection={onNavigate ? () => onNavigate('inspection') : undefined} 
                />
                {msg.loading && <span className="inline-block w-2 h-4 bg-accent/70 ml-1 animate-pulse align-middle" />}
              </div>
            )}

            {/* Extra completed components (agents, evidence, checklist) */}
            {msg.response && <CommandResponseView data={msg.response} onNavigate={onNavigate} />}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
export function CommandPage({
  session,
  onSessionUpdate,
  onRegisterVoiceHandler,
  onRegisterRunLast,
  onInputChange,
  onNavigate,
}: {
  session: ChatSession;
  onSessionUpdate: (id: string, title: string, messages: ChatSession['messages']) => void;
  onRegisterVoiceHandler?: (fn: (text: string, onResponse?: (msg: string) => void) => void) => void;
  onRegisterRunLast?: (fn: () => void) => void;
  onInputChange?: (val: string) => void;
  onNavigate?: (view: ViewId) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [visionModel, setVisionModel] = useState(DEFAULT_VISION);
  const [attachedImage, setAttachedImage] = useState<{ file: File; preview: string } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef('');

  // Keep inputRef in sync so runLast always has the latest value
  useEffect(() => { inputRef.current = input; }, [input]);

  // Register sendMessage as the voice handler so VoiceAssistant can trigger it
  useEffect(() => {
    onRegisterVoiceHandler?.(sendMessage);
    onRegisterRunLast?.(() => {
      const text = inputRef.current.trim();
      if (text) sendMessage(text);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterVoiceHandler, onRegisterRunLast]);

  function handleImageAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setAttachedImage({ file, preview });
    // Auto-switch to vision model
    setModel(DEFAULT_VISION);
    e.target.value = '';
  }

  function removeImage() {
    if (attachedImage) URL.revokeObjectURL(attachedImage.preview);
    setAttachedImage(null);
    // Revert to default model if no image
    setModel(DEFAULT_MODEL);
  }

  // Sync messages up to App whenever they change (skip initial empty sync)
  useEffect(() => {
    if (messages.length === 0) return;
    const title = messages.find(m => m.role === 'user')?.text.slice(0, 40) ?? 'New Chat';
    onSessionUpdate(session.id, title, messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function sendMessage(text: string, onResponse?: (msg: string) => void) {
    const query = text.trim() || (attachedImage ? "Inspect this equipment image and describe its condition." : "");
    if (!query || loading) return;

    abortControllerRef.current = new AbortController();

    let imageBase64: string | undefined = undefined;
    if (attachedImage) {
      try {
        imageBase64 = await fileToBase64(attachedImage.file);
      } catch {
        imageBase64 = undefined;
      }
    }

    // Extract prior conversation history from this chat session (up to last 16 messages)
    const history: HistoryMessage[] = messages
      .filter((m) => !m.loading && m.text && !m.error)
      .slice(-16)
      .map((m) => ({ role: m.role, text: m.text }));

    const userMsg: ChatMessage = {
      id: uid(), role: 'user', text: query,
      imagePreview: imageBase64 || attachedImage?.preview,
    };
    const asstId = uid();
    const isReasoning = MODELS.find((m) => m.id === model)?.reasoning ?? false;
    const asstMsg: ChatMessage = { id: asstId, role: 'assistant', text: '', loading: true, isReasoningModel: isReasoning };
    setMessages((p) => [...p, userMsg, asstMsg]);
    setInput('');
    if (attachedImage) URL.revokeObjectURL(attachedImage.preview);
    setAttachedImage(null);
    setLoading(true);

    const isVisionSelected = MODELS.find((m) => m.id === model)?.vision;
    const finalModel = (attachedImage && !isVisionSelected) ? visionModel : model;

    try {
      await streamCommand(
        query,
        finalModel,
        {
          onThought: (token) => {
            setMessages((p) =>
              p.map((m) =>
                m.id === asstId
                  ? { ...m, streamingThought: (m.streamingThought || '') + token }
                  : m
              )
            );
          },
          onToken: (token) => {
            setMessages((p) =>
              p.map((m) =>
                m.id === asstId
                  ? { ...m, streamingMessage: (m.streamingMessage || '') + token }
                  : m
              )
            );
          },
          onComplete: (data) => {
            setMessages((p) =>
              p.map((m) =>
                m.id === asstId
                  ? {
                    ...m,
                    loading: false,
                    text: data.message,
                    response: data,
                    streamingThought: undefined,
                    streamingMessage: undefined,
                  }
                  : m
              )
            );
            onResponse?.(data.message);
          },
          onError: (errMsg) => {
            setMessages((p) =>
              p.map((m) =>
                m.id === asstId
                  ? { ...m, loading: false, error: errMsg, streamingThought: undefined, streamingMessage: undefined }
                  : m
              )
            );
          },
        },
        imageBase64,
        history,
        abortControllerRef.current?.signal
      );
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        setMessages((p) =>
          p.map((m) =>
            m.id === asstId
              ? {
                ...m,
                loading: false,
                text: m.streamingMessage || m.text || 'Command cancelled by user.',
                streamingThought: m.streamingThought ? m.streamingThought + '\n\n[Generation Stopped]' : undefined,
                streamingMessage: undefined
              }
              : m
          )
        );
        return;
      }
      setMessages((p) =>
        p.map((m) =>
          m.id === asstId
            ? { ...m, loading: false, error: err instanceof Error ? err.message : String(err) || 'Command failed', streamingThought: undefined, streamingMessage: undefined }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function handleRetry(asstId: string) {
    const idx = messages.findIndex((m) => m.id === asstId);
    const userText = idx > 0 ? messages[idx - 1].text : '';
    const history: HistoryMessage[] = messages
      .slice(0, Math.max(0, idx - 1))
      .filter((m) => !m.loading && m.text && !m.error)
      .slice(-16)
      .map((m) => ({ role: m.role, text: m.text }));

    const isReasoning = MODELS.find((m) => m.id === model)?.reasoning ?? false;
    setMessages((p) => p.map((m) => m.id === asstId ? { ...m, loading: true, error: undefined, isReasoningModel: isReasoning } : m));
    postCommand(userText, model, undefined, history)
      .then((data) => setMessages((p) => p.map((m) => m.id === asstId ? { ...m, loading: false, text: data.message, response: data, error: undefined } : m)))
      .catch((err) => setMessages((p) => p.map((m) => m.id === asstId ? { ...m, loading: false, error: err instanceof Error ? err.message : String(err) || 'Command failed' } : m)));
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full" style={{ background: 'transparent' }}>

      {/* ── Scrollable content ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <HeroSection onCardClick={sendMessage} loading={loading} />
        ) : (
          <div className="max-w-[780px] mx-auto px-6 py-8 space-y-7">
            {messages.map((msg) => (
              <div key={msg.id} className="animate-fade-in">
                <MessageBubble msg={msg} onRetry={handleRetry} onNavigate={onNavigate} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Composer ── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2" style={{ background: 'transparent' }}>
        <div className="max-w-[780px] mx-auto">
          <div className="glass-composer">

            {/* Image preview strip */}
            {attachedImage && (
              <div className="flex items-center gap-2 px-4 pt-3 pb-0">
                <div className="relative inline-flex">
                  <img src={attachedImage.preview} alt="preview" className="h-14 w-14 rounded-xl object-cover border border-accent/30" />
                  <button
                    onClick={removeImage}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger flex items-center justify-center"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
                <div className="text-[11px]" style={{ color: '#8290A3' }}>
                  <p className="font-semibold" style={{ color: '#F97316' }}>Vision model auto-selected</p>
                  <p>{attachedImage.file.name}</p>
                </div>
              </div>
            )}

            {/* Text area */}
            <div className="flex items-start gap-3 px-4 pt-3.5 pb-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageAttach}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-0.5 p-1 rounded-lg transition-colors flex-shrink-0 hover:bg-white/50"
                style={{ color: attachedImage ? '#F97316' : '#8994A5' }}
                aria-label="Attach image"
              >
                {attachedImage ? <Image className="w-[17px] h-[17px]" /> : <Paperclip className="w-[17px] h-[17px]" />}
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  onInputChange?.(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  } else if (e.key === 'ArrowUp' && input === '') {
                    e.preventDefault();
                    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
                    if (lastUser && lastUser.text) {
                      setInput(lastUser.text);
                      onInputChange?.(lastUser.text);
                    }
                  }
                }}
                placeholder="Ask GRAVION anything..."
                rows={1}
                disabled={loading}
                aria-label="Message input"
                className="flex-1 bg-transparent text-[14px] focus:outline-none resize-none disabled:opacity-50 leading-relaxed"
                style={{ color: '#172B4D', maxHeight: 180 }}
              />
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-end gap-2 px-3 pb-3 pt-1">
              <CustomModelSelector 
                model={model} 
                setModel={setModel} 
                visionModel={visionModel} 
                setVisionModel={setVisionModel} 
                attachedImage={!!attachedImage} 
              />

              {/* Send/Stop button */}
              {loading ? (
                <button
                  onClick={stopGeneration}
                  aria-label="Stop generating"
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-slate-200"
                  style={{
                    background: '#E2E8F0',
                    color: '#64748B',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
                  }}
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage(input)}
                  disabled={(!input.trim() && !attachedImage)}
                  aria-label="Send message"
                  className="w-10 h-10 rounded-xl text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg, #FF9A4D 0%, #F97316 100%)',
                    boxShadow: '0 4px 14px rgba(249,115,22,0.40), inset 0 1px 0 rgba(255,255,255,0.30)',
                  }}
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-[11.5px] text-text-tertiary mt-2.5">
            GRAVION AI can make mistakes. Verify critical industrial results independently.
          </p>
        </div>
      </div>
    </div>
  );
}

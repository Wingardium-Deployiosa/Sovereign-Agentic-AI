import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, X, Loader2 } from 'lucide-react';

type VoiceState = 'idle' | 'listening-wake' | 'listening-command' | 'processing' | 'speaking';


const RUN_PHRASES = ['run it', 'execute', 'send it', 'send', 'go', 'do it', 'process it', 'submit', 'run', 'execute it', 'yes run', 'confirm'];

function isRunCommand(heard: string): boolean {
  const t = heard.toLowerCase().trim();
  return RUN_PHRASES.some(p => t === p || t.endsWith(p) || t.startsWith(p));
}

function isWakeWord(heard: string): boolean {
  const t = heard.toLowerCase().trim();
  // Direct name matches
  const nameVariants = [
    'gravion', 'gravia', 'gravy on', 'graveon', 'graven', 'gravian',
    'gravio', 'gravien', 'grabian', 'greyvion', 'greyvon', 'grayvin',
    'gravyun', 'gravion', 'gravy', 'grabion', 'grevion', 'graveon',
    'grey on', 'gray on', 'graven', 'grayvon', 'gravon',
  ];
  // Must have 'hey' + any name variant nearby, OR exact name variant alone
  const hasHey = t.includes('hey') || t.includes('hay') || t.includes('a ');
  const hasName = nameVariants.some(v => t.includes(v));
  if (hasName) return true;
  // Fuzzy: 'hey' + something starting with 'gr'
  if (hasHey && /gr[aeiou]/i.test(t)) return true;
  return false;
}

// Browser Speech Recognition — no standard TS types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognition: any =
  (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

function speak(text: string, onEnd?: () => void) {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.0;
  utt.pitch = 1.0;
  utt.volume = 1.0;
  // Pick a good voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    v.name.toLowerCase().includes('david') ||
    v.name.toLowerCase().includes('mark') ||
    v.name.toLowerCase().includes('google uk') ||
    v.lang === 'en-GB'
  );
  if (preferred) utt.voice = preferred;
  utt.onend = () => onEnd?.();
  window.speechSynthesis.speak(utt);
}

export function VoiceAssistant({ onSendCommand, inputRef }: { 
  onSendCommand: (text: string, onResponse: (msg: string) => void) => void;
  inputRef?: React.RefObject<string>;
}) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [wakeTranscript, setWakeTranscript] = useState('');

  const transcriptRef = useRef('');
  const lastCommandRef = useRef('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeRecRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cmdRecRef  = useRef<any>(null);
  const stateRef   = useRef<VoiceState>('idle');

  stateRef.current = state;

  // ── Wake word listener ──────────────────────────────────────────────────
  const startWakeListener = useCallback(() => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const heard = Array.from(e.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript.toLowerCase().trim())
        .join(' ');
      console.log('[GRAVION wake] heard:', heard); // debug
      setWakeTranscript(heard);
      if (isWakeWord(heard)) {
        rec.stop();
        setState('listening-command');
        setTranscript('');
        setExpanded(true);
        speak('Yes, I\'m listening.', () => startCommandListener());
      }
    };
    rec.onerror = () => { /* silently restart */ };
    rec.onend = () => {
      if (stateRef.current === 'listening-wake') {
        try { rec.start(); } catch { /* ignore */ }
      }
    };
    wakeRecRef.current = rec;
    try { rec.start(); } catch { /* mic not available */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Command listener ────────────────────────────────────────────────────
  const startCommandListener = useCallback(() => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const results = Array.from(e.results);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const interim = results.map((r: any) => r[0].transcript).join('');
      setTranscript(interim);
      transcriptRef.current = interim;
    };

    rec.onend = async () => {
      const final = transcriptRef.current;
      transcriptRef.current = '';
      if (!final.trim()) {
        setState('listening-wake');
        startWakeListener();
        return;
      }
      // If user says "run it", "execute", "send" etc — re-execute last command
      if (isRunCommand(final)) {
        const toRun = lastCommandRef.current || inputRef?.current?.trim();
        if (toRun) {
          setState('processing');
          speak('Running it now.', () => {});
          onSendCommand(toRun, (msg) => {
            setResponse(msg);
            setState('speaking');
            speak(msg, () => {
              setState('listening-wake');
              startWakeListener();
            });
          });
        } else {
          speak('Nothing to run. Please say your command first.', () => {
            setState('listening-wake');
            startWakeListener();
          });
        }
        return;
      }
      // Normal command — save it and execute
      lastCommandRef.current = final;
      setState('processing');
      onSendCommand(final, (msg) => {
        setResponse(msg);
        setState('speaking');
        speak(msg, () => {
          setState('listening-wake');
          startWakeListener();
        });
      });
    };

    rec.onerror = () => {
      setState('listening-wake');
      startWakeListener();
    };

    cmdRecRef.current = rec;
    setState('listening-command');
    try { rec.start(); } catch { /* ignore */ }
  }, [onSendCommand, startWakeListener, inputRef]);

  // ── Enable / disable ────────────────────────────────────────────────────
  useEffect(() => {
    if (enabled) {
      setState('listening-wake');
      startWakeListener();
      speak('Hey GRAVION is active. Say "Hey GRAVION" to start.');
    } else {
      wakeRecRef.current?.stop();
      cmdRecRef.current?.stop();
      window.speechSynthesis?.cancel();
      setState('idle');
      setExpanded(false);
      setTranscript('');
      setWakeTranscript('');
      setResponse('');
    }
    return () => {
      wakeRecRef.current?.stop();
      cmdRecRef.current?.stop();
    };
  }, [enabled, startWakeListener]);

  // ── Manual mic press ────────────────────────────────────────────────────
  function handleMicPress() {
    if (!enabled) { setEnabled(true); return; }
    if (state === 'listening-command') {
      cmdRecRef.current?.stop();
    } else if (state === 'listening-wake') {
      wakeRecRef.current?.stop();
      startCommandListener();
    }
  }

  const isActive = state !== 'idle';
  const pulseColor = {
    'idle': '#8290A3',
    'listening-wake': '#F97316',
    'listening-command': '#22C55E',
    'processing': '#3B82F6',
    'speaking': '#A855F7',
  }[state];

  const stateLabel = {
    'idle': 'Hey GRAVION',
    'listening-wake': 'Waiting… say "Hey GRAVION"',
    'listening-command': 'Listening…',
    'processing': 'Processing…',
    'speaking': 'Speaking…',
  }[state];

  if (!SpeechRecognition) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* Expanded panel */}
      {expanded && (
        <div
          className="rounded-2xl p-4 w-72 animate-fade-in"
          style={{
            background: 'rgba(252,249,245,0.97)',
            border: '1px solid rgba(255,255,255,0.70)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 8px 32px rgba(30,40,55,0.18)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: pulseColor }} />
              <span className="text-[12px] font-semibold" style={{ color: '#172B4D' }}>GRAVION Voice</span>
            </div>
            <button onClick={() => { setEnabled(false); setExpanded(false); }}
              className="p-1 rounded-lg hover:bg-black/5">
              <X className="w-3.5 h-3.5" style={{ color: '#8290A3' }} />
            </button>
          </div>

          {/* State */}
          <p className="text-[11px] font-medium mb-2" style={{ color: pulseColor }}>{stateLabel}</p>

          {/* Live wake word transcript */}
          {state === 'listening-wake' && wakeTranscript && (
            <div className="rounded-xl px-3 py-1.5 mb-2"
              style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)' }}>
              <p className="text-[10px]" style={{ color: '#8290A3' }}>
                <span className="font-semibold">Heard: </span>{wakeTranscript}
              </p>
            </div>
          )}

          {/* Transcript */}
          {transcript && (
            <div className="rounded-xl px-3 py-2 mb-2"
              style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.20)' }}>
              <p className="text-[11px]" style={{ color: '#172B4D' }}>
                <span className="font-semibold" style={{ color: '#F97316' }}>You: </span>{transcript}
              </p>
            </div>
          )}

          {/* Response */}
          {response && state === 'speaking' && (
            <div className="rounded-xl px-3 py-2"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.20)' }}>
              <p className="text-[11px] line-clamp-4" style={{ color: '#172B4D' }}>
                <span className="font-semibold" style={{ color: '#A855F7' }}>GRAVION: </span>{response}
              </p>
            </div>
          )}

          {/* Waveform animation when listening */}
          {state === 'listening-command' && (
            <div className="flex items-end justify-center gap-0.5 h-8 mt-2">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="w-1 rounded-full"
                  style={{
                    background: '#22C55E',
                    height: `${20 + Math.sin(i * 0.8) * 12}px`,
                    animation: `pulse ${0.5 + i * 0.1}s ease-in-out infinite alternate`,
                    opacity: 0.7 + (i % 3) * 0.1,
                  }}
                />
              ))}
            </div>
          )}

          {/* Processing spinner */}
          {state === 'processing' && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#3B82F6' }} />
              <span className="text-[11px]" style={{ color: '#3B82F6' }}>GRAVION is thinking…</span>
            </div>
          )}

          {/* Speaking indicator */}
          {state === 'speaking' && (
            <div className="flex items-center gap-2 mt-2">
              <Volume2 className="w-4 h-4" style={{ color: '#A855F7' }} />
              <span className="text-[11px]" style={{ color: '#A855F7' }}>Speaking…</span>
            </div>
          )}

          <p className="text-[10px] mt-3 text-center" style={{ color: '#8290A3' }}>
            Say "Hey GRAVION" or tap the mic
          </p>
        </div>
      )}

      {/* Floating mic button */}
      <button
        onClick={handleMicPress}
        className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all"
        style={{
          background: isActive
            ? `linear-gradient(135deg, ${pulseColor}CC, ${pulseColor})`
            : 'linear-gradient(135deg, #FF9A4D, #F97316)',
          boxShadow: isActive
            ? `0 0 0 0 ${pulseColor}40, 0 4px 20px ${pulseColor}60`
            : '0 4px 20px rgba(249,115,22,0.45)',
          animation: state === 'listening-command' ? 'voicePulse 1.2s ease-in-out infinite' : 'none',
        }}
        title={enabled ? stateLabel : 'Enable Hey GRAVION'}
      >
        {state === 'processing' ? (
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        ) : state === 'speaking' ? (
          <Volume2 className="w-6 h-6 text-white" />
        ) : enabled ? (
          <Mic className="w-6 h-6 text-white" />
        ) : (
          <MicOff className="w-6 h-6 text-white" />
        )}

        {/* Pulse rings when listening for wake word */}
        {state === 'listening-wake' && (
          <>
            <span className="absolute inset-0 rounded-full animate-ping opacity-30"
              style={{ background: pulseColor }} />
            <span className="absolute inset-[-6px] rounded-full animate-ping opacity-20"
              style={{ background: pulseColor, animationDelay: '0.3s' }} />
          </>
        )}
      </button>

      <style>{`
        @keyframes voicePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5), 0 4px 20px rgba(34,197,94,0.4); }
          50% { box-shadow: 0 0 0 12px rgba(34,197,94,0), 0 4px 20px rgba(34,197,94,0.6); }
        }
      `}</style>
    </div>
  );
}

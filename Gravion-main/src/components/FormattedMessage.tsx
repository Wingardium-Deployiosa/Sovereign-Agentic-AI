import React, { useState } from 'react';
import katex from 'katex';
import {
  CheckCircle2, AlertCircle, AlertTriangle,
  Copy, Check, ScanLine, ArrowRight,
} from 'lucide-react';

interface FormattedMessageProps {
  text: string;
  taskType?: string;
  onNavigateInspection?: () => void;
}

/** KaTeX Math renderer with graceful fallback */
function MathBlock({ math, displayMode = true }: { math: string; displayMode?: boolean }) {
  const html = React.useMemo(() => {
    try {
      let cleaned = math.trim();
      if (cleaned.startsWith('$$') && cleaned.endsWith('$$') && cleaned.length > 3) {
        cleaned = cleaned.slice(2, -2).trim();
      } else if (cleaned.startsWith('$') && cleaned.endsWith('$') && cleaned.length > 1) {
        cleaned = cleaned.slice(1, -1).trim();
      }
      return katex.renderToString(cleaned, {
        displayMode,
        throwOnError: false,
      });
    } catch {
      return math;
    }
  }, [math, displayMode]);

  if (displayMode) {
    return (
      <div className="my-3 py-3 px-4 rounded-xl bg-slate-50/80 border border-slate-200/70 overflow-x-auto text-[#172B4D] shadow-2xs">
        <div
          className="katex-display-container text-center flex justify-center items-center min-h-[38px] text-[14.5px]"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  }
  return <span className="inline-block px-1 align-baseline" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Helper to render inline markdown: **bold**, *italic*, `code`, and $inline math$ */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+?`|\$[^$\n]+?\$|\\\([^\n]+?\\\))/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-[#172B4D]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} className="italic text-[#68758A]">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-black/5 text-[#D97706] font-mono text-[12px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      return <MathBlock key={i} math={part.slice(1, -1)} displayMode={false} />;
    }
    if (part.startsWith('\\(') && part.endsWith('\\)') && part.length > 4) {
      return <MathBlock key={i} math={part.slice(2, -2)} displayMode={false} />;
    }
    if (part.includes('\\frac{') || (part.includes('\\text{') && part.includes('='))) {
      return <MathBlock key={i} math={part} displayMode={false} />;
    }
    return part;
  });
}

/** Determine condition badge color and icon */
function getConditionConfig(condition: string) {
  const upper = condition.trim().toUpperCase();
  if (
    ['NORMAL', 'PASS', 'GOOD', 'OPTIMAL', 'HEALTHY', 'OPERATIONAL', 'OK'].some((k) =>
      upper.includes(k)
    )
  ) {
    return {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      icon: CheckCircle2,
      label: condition.trim(),
    };
  }
  if (
    ['ATTENTION', 'WARNING', 'DEGRADED', 'MODERATE', 'FAIR'].some((k) =>
      upper.includes(k)
    )
  ) {
    return {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      icon: AlertCircle,
      label: condition.trim(),
    };
  }
  if (
    ['FAIL', 'CRITICAL', 'DANGER', 'LEAK', 'SEVERE', 'POOR', 'DAMAGED'].some((k) =>
      upper.includes(k)
    )
  ) {
    return {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: AlertTriangle,
      label: condition.trim(),
    };
  }
  return {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-700',
    icon: CheckCircle2,
    label: condition.trim(),
  };
}

/** Code block with copy button */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl overflow-hidden my-3 border border-slate-700/50 bg-[#0F172A] text-slate-200 text-[12.5px] font-mono">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#1E293B] border-b border-slate-700/50 text-[11px] text-slate-400">
        <span>{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** General clean markdown renderer with Code & Math support */
function GeneralMarkdownView({ text }: { text: string }) {
  // Check for code blocks or display math blocks ($$...$$ or \[...\])
  if (text.includes('```') || text.includes('$$') || text.includes('\\[') || text.includes('\\begin{equation}')) {
    const segments = text.split(/(```[\s\S]*?```|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{equation\}[\s\S]*?\\end\{equation\})/g);
    return (
      <div className="space-y-3 text-[13.5px] text-[#172B4D] leading-relaxed">
        {segments.map((seg, i) => {
          if (!seg) return null;
          if (seg.startsWith('```') && seg.endsWith('```')) {
            const inner = seg.slice(3, -3);
            const firstNewline = inner.indexOf('\n');
            const lang = firstNewline !== -1 ? inner.slice(0, firstNewline).trim() : '';
            const code = firstNewline !== -1 ? inner.slice(firstNewline + 1) : inner;
            return <CodeBlock key={i} code={code} lang={lang} />;
          }
          if (seg.startsWith('$$') && seg.endsWith('$$') && seg.length >= 4) {
            const inner = seg.slice(2, -2).trim();
            return <MathBlock key={i} math={inner} displayMode={true} />;
          }
          if (seg.startsWith('\\[') && seg.endsWith('\\]') && seg.length >= 4) {
            const inner = seg.slice(2, -2).trim();
            return <MathBlock key={i} math={inner} displayMode={true} />;
          }
          if (seg.startsWith('\\begin{equation}') && seg.endsWith('\\end{equation}')) {
            return <MathBlock key={i} math={seg.trim()} displayMode={true} />;
          }
          return <GeneralMarkdownView key={i} text={seg} />;
        })}
      </div>
    );
  }

  // Split text by lines
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="my-2 space-y-1.5 pl-1">
          {listBuffer.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-[13px] text-[#172B4D]">
              <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
              <span className="flex-1 leading-relaxed">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    // Pipe status header e.g. "**Centrifugal Pump** | Status: **NORMAL**" or "Centrifugal Pump | Status: NORMAL"
    const statusHeaderMatch =
      trimmed.match(/^\*\*([^*|]+)\*\*\s*\|\s*Status:\s*\*\*([^*]+)\*\*$/i) ||
      trimmed.match(/^([^*|]+)\s*\|\s*Status:\s*([^*]+)$/i);

    if (statusHeaderMatch) {
      flushList();
      const equipName = statusHeaderMatch[1].trim();
      const statusValue = statusHeaderMatch[2].trim();
      const cond = getConditionConfig(statusValue);
      const CondIcon = cond.icon;

      elements.push(
        <div
          key={idx}
          className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-black/5"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
              <ScanLine className="w-4 h-4 text-accent" />
            </div>
            <span className="text-[15px] font-bold text-[#172B4D]">
              {equipName}
            </span>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold border ${cond.bg} ${cond.border} ${cond.text} shadow-2xs`}
          >
            <CondIcon className="w-3.5 h-3.5" />
            <span>Status: {statusValue}</span>
          </div>
        </div>
      );
      return;
    }

    // Blockquote handling (lines starting with >)
    if (trimmed.startsWith('> ') || trimmed === '>') {
      flushList();
      elements.push(
        <div
          key={idx}
          className="my-2.5 pl-3.5 py-2 border-l-[3px] border-accent/60 bg-accent/[0.04] rounded-r-xl text-[13px] text-[#334155] leading-relaxed italic"
        >
          {renderInline(trimmed.replace(/^>\s*/, ''))}
        </div>
      );
      return;
    }

    // Bullet items
    if (/^[-*•]\s+/.test(trimmed)) {
      listBuffer.push(trimmed.replace(/^[-*•]\s+/, ''));
      return;
    }

    flushList();

    // Stray $$ markers that were not part of a split block
    if (trimmed === '$$' || trimmed === '\\[' || trimmed === '\\]') {
      return;
    }

    // Standalone LaTeX equation line (e.g. starts with \text{, \frac, \times, etc.)
    if (
      (trimmed.startsWith('\\') && (trimmed.includes('\\frac') || trimmed.includes('\\text{') || trimmed.includes('\\times') || trimmed.includes('\\sqrt') || trimmed.includes('\\sum') || trimmed.includes('\\int') || trimmed.includes('\\pm'))) ||
      (trimmed.includes('\\frac{') && (trimmed.includes('=') || trimmed.includes('\\text{')))
    ) {
      elements.push(<MathBlock key={idx} math={trimmed} displayMode={true} />);
      return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={idx} className="text-[13.5px] font-bold text-[#172B4D] uppercase tracking-wider mt-3 mb-1">
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={idx} className="text-[15px] font-bold text-[#172B4D] mt-4 mb-1">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={idx} className="text-[17px] font-bold text-[#172B4D] mt-4 mb-1.5">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    // Standalone bold heading line e.g. **Summary:** or **Key Checks:**
    if (/^\*\*[^*]+:\*\*/.test(trimmed) && trimmed.length < 50) {
      elements.push(
        <p key={idx} className="text-[13px] font-bold text-[#172B4D] mt-2 mb-0.5">
          {renderInline(trimmed)}
        </p>
      );
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={idx} className="text-[13.5px] leading-relaxed text-[#172B4D] my-1">
        {renderInline(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className="space-y-1">{elements}</div>;
}

export function FormattedMessage({ text, taskType, onNavigateInspection }: FormattedMessageProps) {
  if (!text) return null;

  // Only show inspection notice when image analysis / visual inspection was performed
  const isInspection = taskType === 'visual_inspection';

  function handleOpenInspection() {
    if (onNavigateInspection) {
      onNavigateInspection();
    } else {
      window.dispatchEvent(new CustomEvent('gravion-navigate', { detail: 'inspection' }));
    }
  }

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 transition-all"
      style={{
        background: 'rgba(255, 255, 255, 0.78)',
        border: '1px solid rgba(200, 188, 170, 0.45)',
        boxShadow: '0 2px 12px rgba(30, 40, 55, 0.05)',
      }}
    >
      <GeneralMarkdownView text={text} />

      {/* Warning/Info Callout inside this white box */}
      {isInspection && (
        <div
          className="mt-4 pt-3.5 border-t border-amber-200/80 flex items-start justify-between gap-3 p-3.5 rounded-xl transition-all"
          style={{
            background: 'rgba(254, 243, 199, 0.60)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
          }}
        >
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Inspection Notice
              </p>
              <p className="text-[12.5px] text-[#4A5568] mt-0.5 leading-relaxed">
                Refer to the{' '}
                <button
                  onClick={handleOpenInspection}
                  className="font-semibold text-accent underline hover:text-accent-hover inline cursor-pointer"
                >
                  Equipment Inspection tool
                </button>{' '}
                for complete understanding, high-resolution thermal analysis, component bounding boxes, and detailed condition metrics.
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenInspection}
            className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold text-white bg-accent hover:bg-accent-hover transition-colors shadow-xs"
          >
            Open Tool <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

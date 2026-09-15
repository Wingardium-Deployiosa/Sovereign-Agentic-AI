import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function ErrorPanel({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 rounded-2xl animate-fade-in"
      style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(239,68,68,0.20)', backdropFilter: 'blur(16px)' }}>
      <AlertCircle className="w-8 h-8 mb-3" style={{ color: '#EF4444' }} />
      <h3 className="text-[14px] font-semibold mb-1" style={{ color: '#172B4D' }}>{title}</h3>
      <p className="text-[13px] mb-4 max-w-md" style={{ color: '#68758A' }}>{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all"
          style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.70)', color: '#68758A', backdropFilter: 'blur(12px)' }}>
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

export function LoadingPanel({ message = 'Processing…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 rounded-2xl animate-fade-in"
      style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.62)', backdropFilter: 'blur(16px)' }}>
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mb-3"
        style={{ borderColor: 'rgba(249,115,22,0.30)', borderTopColor: '#F97316' }} />
      <p className="text-[13px]" style={{ color: '#68758A' }}>{message}</p>
    </div>
  );
}

export function SectionCard({ title, icon: Icon, children, accent }: {
  title: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl p-4 animate-fade-in"
      style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.65)', backdropFilter: 'blur(16px)', boxShadow: '0 2px 12px rgba(30,40,55,0.06)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color: accent || '#8290A3' }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8290A3' }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

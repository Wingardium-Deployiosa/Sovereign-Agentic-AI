import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, CheckCircle2, XCircle, AlertTriangle,
  Clock, ChevronDown, ChevronUp, User, Loader2, RefreshCw,
} from 'lucide-react';
import { getApprovals, decideApproval, type ApprovalItem } from '@/lib/api';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated';

const PRIORITY_CFG = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.10)',   label: 'CRITICAL' },
  high:     { color: '#F97316', bg: 'rgba(249,115,22,0.10)',  label: 'HIGH' },
  medium:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  label: 'MEDIUM' },
  low:      { color: '#22C55E', bg: 'rgba(34,197,94,0.10)',   label: 'LOW' },
};

const STATUS_CFG: Record<ApprovalStatus, {
  color: string; bg: string; label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  pending:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  label: 'Pending',   icon: Clock },
  approved:  { color: '#22C55E', bg: 'rgba(34,197,94,0.10)',   label: 'Approved',  icon: CheckCircle2 },
  rejected:  { color: '#EF4444', bg: 'rgba(239,68,68,0.10)',   label: 'Rejected',  icon: XCircle },
  escalated: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)',  label: 'Escalated', icon: AlertTriangle },
};

export function ApprovalsPage() {
  const [items,    setItems]    = useState<ApprovalItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null); // item id being decided

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getApprovals();
      setItems(res.items);
      // Auto-expand first pending item
      const firstPending = res.items.find(i => i.status === 'pending');
      if (firstPending) setExpanded(firstPending.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load approvals');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, status: ApprovalStatus) {
    setDeciding(id);
    try {
      const res = await decideApproval(id, status);
      setItems(prev => prev.map(i => i.id === id ? res.item : i));
      setExpanded(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed');
    } finally { setDeciding(null); }
  }

  const pending = items.filter(i => i.status === 'pending').length;

  return (
    <div className="max-w-[860px] mx-auto px-4 py-4 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: '#FFFBEB', border: '1px solid rgba(245,158,11,0.2)' }}>
            <ClipboardCheck className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: '#172B4D' }}>Approvals</h1>
            <p className="text-[12px]" style={{ color: '#68758A' }}>
              Human-in-the-loop gate for agent-initiated actions · Safety-critical oversight
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pending > 0 && (
            <span className="px-3 py-1 rounded-full text-[12px] font-bold"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
              {pending} pending
            </span>
          )}
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.60)', color: '#68758A' }}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-[13px]"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', color: '#dc2626' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="text-xs underline">Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && items.length === 0 && (
        <div className="flex items-center gap-3 px-5 py-6 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.55)' }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#F59E0B' }} />
          <span className="text-[13px]" style={{ color: '#68758A' }}>Loading approvals…</span>
        </div>
      )}

      {/* Items */}
      <div className="space-y-3">
        {items.map(item => {
          const pCfg = PRIORITY_CFG[item.priority];
          const sCfg = STATUS_CFG[item.status as ApprovalStatus];
          const StatusIcon = sCfg.icon;
          const isOpen = expanded === item.id;
          const isDeciding = deciding === item.id;

          return (
            <div key={item.id} className="action-card flex flex-col gap-0 p-0 overflow-hidden">

              {/* Header row */}
              <button
                className="w-full flex items-center gap-3 px-5 py-4 text-left"
                onClick={() => setExpanded(isOpen ? null : item.id)}>
                <span className="text-[11px] font-mono font-bold flex-shrink-0" style={{ color: '#8290A3' }}>{item.id}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                  style={{ background: pCfg.bg, color: pCfg.color }}>{pCfg.label}</span>
                <span className="flex-1 text-[13px] font-semibold text-left" style={{ color: '#172B4D' }}>{item.title}</span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                  style={{ background: sCfg.bg, color: sCfg.color }}>
                  <StatusIcon className="w-3 h-3" /> {sCfg.label}
                </span>
                {isOpen
                  ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: '#8290A3' }} />
                  : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#8290A3' }} />}
              </button>

              {/* Expanded body */}
              {isOpen && (
                <div className="px-5 pb-5 space-y-4 animate-fade-in"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.40)' }}>

                  <div className="flex items-center gap-2 pt-3">
                    <User className="w-3.5 h-3.5" style={{ color: '#8290A3' }} />
                    <span className="text-[11px]" style={{ color: '#8290A3' }}>
                      Requested by <b style={{ color: '#F97316' }}>{item.agent}</b> at {item.requestedAt}
                    </span>
                    {item.decidedAt && (
                      <span className="text-[11px]" style={{ color: '#8290A3' }}>
                        · Decided at {item.decidedAt}
                        {item.decidedBy && <> by <b style={{ color: '#172B4D' }}>{item.decidedBy}</b></>}
                      </span>
                    )}
                  </div>

                  <p className="text-[13px] leading-relaxed" style={{ color: '#68758A' }}>{item.description}</p>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#8290A3' }}>
                      Evidence & Context
                    </p>
                    <div className="space-y-1">
                      {item.evidence.map((e, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.40)' }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#F97316' }} />
                          <span className="text-[12px]" style={{ color: '#68758A' }}>{e}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {item.status === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => decide(item.id, 'approved')}
                        disabled={isDeciding}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-all disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg,#34d399,#22C55E)', boxShadow: '0 3px 10px rgba(34,197,94,0.30)' }}>
                        {isDeciding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Approve
                      </button>
                      <button
                        onClick={() => decide(item.id, 'rejected')}
                        disabled={isDeciding}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-all disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg,#f87171,#EF4444)', boxShadow: '0 3px 10px rgba(239,68,68,0.30)' }}>
                        {isDeciding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        Reject
                      </button>
                      <button
                        onClick={() => decide(item.id, 'escalated')}
                        disabled={isDeciding}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all disabled:opacity-50"
                        style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#8B5CF6' }}>
                        {isDeciding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        Escalate
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-center" style={{ color: '#8290A3' }}>
        All approval decisions are immutably logged · Human oversight enforced for safety-critical actions
      </p>
    </div>
  );
}

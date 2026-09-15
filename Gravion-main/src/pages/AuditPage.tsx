import { useState, useEffect } from 'react';
import { ScrollText, Search, Download, Shield, Bot, User, Code2, FileText, Activity } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

type EventType = 'command' | 'agent' | 'tool' | 'approval' | 'upload' | 'system';

interface AuditEvent {
  id: string; time: string; type: EventType; actor: string;
  action: string; detail: string; hash: string; status: 'ok' | 'warn' | 'blocked';
}

const EVENTS: AuditEvent[] = [];

const TYPE_CFG: Record<EventType, { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string; bg: string }> = {
  command:  { icon: Activity,  color: '#3B82F6', bg: '#EFF6FF' },
  agent:    { icon: Bot,       color: '#F97316', bg: '#FFF4ED' },
  tool:     { icon: Code2,     color: '#8B5CF6', bg: '#F5F3FF' },
  approval: { icon: Shield,    color: '#22C55E', bg: '#F0FDF4' },
  upload:   { icon: FileText,  color: '#F59E0B', bg: '#FFFBEB' },
  system:   { icon: User,      color: '#68758A', bg: '#F7F4EE' },
};

const STATUS_STYLE = {
  ok:      { color: '#22C55E', label: 'OK' },
  warn:    { color: '#F59E0B', label: 'WARN' },
  blocked: { color: '#EF4444', label: 'BLOCKED' },
};

function exportCSV(events: AuditEvent[]) {
  if (events.length === 0) return;
  const headers = ['ID', 'Time', 'Type', 'Actor', 'Action', 'Detail', 'Hash', 'Status'];
  const rows = events.map(e =>
    [e.id, e.time, e.type, e.actor, e.action, `"${e.detail.replace(/"/g, '""')}"`, e.hash, e.status].join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `gravion_audit_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditPage() {
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<EventType | 'all'>('all');
  const [displayEvents, setDisplayEvents] = useState<AuditEvent[]>([]);
  
  useEffect(() => {
    fetch(`${API_BASE_URL}/audit`)
      .then(res => res.json())
      .then(data => {
        if (data.events) {
          setDisplayEvents(data.events.reverse());
        }
      })
      .catch(err => console.error("Failed to load audit events:", err));
  }, []);

  const filtered = displayEvents.filter(e => {
    const matchText = !filter || e.action?.toLowerCase().includes(filter.toLowerCase()) || e.detail?.toLowerCase().includes(filter.toLowerCase()) || e.actor?.toLowerCase().includes(filter.toLowerCase());
    const matchType = typeFilter === 'all' || e.type === typeFilter;
    return matchText && matchType;
  });

  return (
    <div className="max-w-[960px] mx-auto px-4 py-4 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F5F3FF', border: '1px solid rgba(139,92,246,0.2)' }}>
            <ScrollText className="w-5 h-5 text-purple" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: '#172B4D' }}>Audit Log</h1>
            <p className="text-[12px]" style={{ color: '#68758A' }}>Immutable tamper-evident event record · {filtered.length} of {EVENTS.length} events · Hash-verified</p>
          </div>
        </div>
        <button
          onClick={() => exportCSV(filtered)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all hover:bg-white/60"
          style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.60)', color: '#172B4D', backdropFilter: 'blur(12px)' }}>
          <Download className="w-3.5 h-3.5" /> Export CSV ({filtered.length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-[200px]" style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.60)', backdropFilter: 'blur(12px)' }}>
          <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8290A3' }} />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search events…" className="flex-1 bg-transparent text-[13px] focus:outline-none" style={{ color: '#172B4D' }} />
        </div>
        <div className="flex gap-1">
          {(['all', 'command', 'agent', 'tool', 'approval', 'upload', 'system'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all"
              style={typeFilter === t ? { background: '#F97316', color: '#fff' } : { background: 'rgba(255,255,255,0.45)', color: '#68758A', border: '1px solid rgba(255,255,255,0.55)' }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Event table */}
      <div className="space-y-1.5">
        {filtered.map(evt => {
          const tCfg = TYPE_CFG[evt.type] || TYPE_CFG.system;
          const sCfg = STATUS_STYLE[evt.status] || { color: '#68758A', label: evt.status || 'UNKNOWN' };
          const Icon = tCfg.icon;
          return (
            <div key={evt.id} className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-white/20"
              style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.55)', backdropFilter: 'blur(12px)' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: tCfg.bg }}>
                {Icon && <Icon className="w-3.5 h-3.5" style={{ color: tCfg.color }} />}
              </div>
              <span className="text-[10px] font-mono flex-shrink-0 w-16" style={{ color: '#8290A3' }}>{evt.time}</span>
              <span className="text-[11px] font-semibold flex-shrink-0 w-28 truncate" style={{ color: '#172B4D' }}>{evt.actor}</span>
              <span className="text-[12px] font-medium flex-shrink-0 w-40 truncate" style={{ color: '#172B4D' }}>{evt.action}</span>
              <span className="text-[11px] flex-1 truncate" style={{ color: '#68758A' }}>{evt.detail}</span>
              <span className="text-[10px] font-mono flex-shrink-0" style={{ color: '#8290A3' }}>#{evt.hash}</span>
              <span className="text-[10px] font-bold flex-shrink-0" style={{ color: sCfg.color }}>{sCfg.label}</span>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center py-8 text-[13px]" style={{ color: '#8290A3' }}>No events match your filter.</p>}
      </div>
      <p className="text-[11px] text-center" style={{ color: '#8290A3' }}>All events cryptographically hashed · Tamper-evident · Compliance-ready export</p>
    </div>
  );
}

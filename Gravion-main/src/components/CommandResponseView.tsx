import { useState } from 'react';
import type { CommandResponse } from '@/lib/api';
import { SectionCard } from '@/components/Panels';
import { StatusBadge } from '@/components/StatusBadge';
import { FormattedMessage } from '@/components/FormattedMessage';
import { FileText, Search, ListChecks, AlertTriangle, Bot, Quote, BrainCircuit, ChevronDown, ChevronRight } from 'lucide-react';
import type { ViewId } from '@/lib/nav';

export function CommandResponseView({
  data,
  onNavigate,
}: {
  data: CommandResponse;
  onNavigate?: (view: ViewId) => void;
}) {
  const [thoughtExpanded, setThoughtExpanded] = useState(false);
  const isGeneral = data.task_type === 'general';
  
  return (
    <div className="space-y-4">

      {/* Agents — only show for non-general tasks */}
      {!isGeneral && data.agents && data.agents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#8290A3' }}>Agents:</span>
          {data.agents.map((agent, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.65)', color: '#68758A' }}>
              <Bot className="w-3 h-3" /> {agent}
            </span>
          ))}
        </div>
      )}

      {/* Contradiction */}
      {data.contradiction && (
        <div className="rounded-2xl p-4 animate-fade-in"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.20)', borderLeft: '3px solid #F59E0B' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" style={{ color: '#F59E0B' }} />
            <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#F59E0B' }}>Contradiction Detected</h3>
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: '#172B4D' }}>{data.contradiction}</p>
        </div>
      )}

      {/* Evidence */}
      {data.evidence && data.evidence.length > 0 && (
        <SectionCard title="Evidence" icon={Search}>
          <div className="space-y-2">
            {data.evidence.map((ev, i) => (
              <div key={i} className="rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.55)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" style={{ color: '#8290A3' }} />
                    <span className="text-[11px] font-mono" style={{ color: '#172B4D' }}>{ev.document}</span>
                    <span className="text-[11px]" style={{ color: '#8290A3' }}>p.{ev.page}</span>
                    {ev.section && <span className="text-[11px]" style={{ color: '#8290A3' }}>· {ev.section}</span>}
                  </div>
                  <span className="text-[11px] font-mono font-semibold" style={{ color: '#22C55E' }}>
                    {(ev.score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Quote className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#8290A3' }} />
                  <p className="text-[11px] italic leading-relaxed" style={{ color: '#68758A' }}>{ev.excerpt}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Checklist */}
      {data.checklist_items && data.checklist_items.length > 0 && (
        <SectionCard title="Checklist" icon={ListChecks}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.50)' }}>
                  {['Point', 'Status', 'Remark'].map(h => (
                    <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-wider py-2 pr-4"
                      style={{ color: '#8290A3' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.checklist_items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.35)' }}>
                    <td className="py-2.5 pr-4" style={{ color: '#172B4D' }}>{item.point}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={item.status} size="xs" /></td>
                    <td className="py-2.5 text-[11px]" style={{ color: '#68758A' }}>{item.remark || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

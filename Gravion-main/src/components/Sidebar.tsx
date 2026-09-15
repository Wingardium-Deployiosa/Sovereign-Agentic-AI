import { type ViewId } from '@/lib/nav';
import type { ChatSession } from '@/lib/sessions';
import {
  Plus, SlidersHorizontal, Code2,
  Activity, Calculator, Bot, ClipboardCheck, ScrollText,
  ChevronDown, ChevronsLeft, Terminal, ScanLine, BookOpen,
  User, Settings, LogOut, MessageSquare, X, Trash2
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface SidebarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  collapsed: boolean;
  onToggle: () => void;
  sessions: ChatSession[];
  activeSessionId: string;
  onNewChat: () => void;
  onSessionSelect: (id: string) => void;
  onRemoveSession: (id: string) => void;
}

const featureItems = [
  { label: 'Command Center',            view: 'command'    as ViewId, icon: Terminal  },
  { label: 'Equipment Inspection',      view: 'inspection' as ViewId, icon: ScanLine  },
  { label: 'Industrial Knowledge Base', view: 'knowledge'  as ViewId, icon: BookOpen  },
];

const toolItems = [
  { id: 'telemetry'   as ViewId, label: 'Telemetry',  icon: Activity },
  { id: 'engineering' as ViewId, label: 'Engineering', icon: Calculator },
  { id: 'agents'      as ViewId, label: 'Agents',      icon: Bot },
  { id: 'codelab'     as ViewId, label: 'Code Lab',    icon: Code2 },
  { id: 'approvals'   as ViewId, label: 'Approvals',   icon: ClipboardCheck },
  { id: 'audit'       as ViewId, label: 'Audit',       icon: ScrollText },
];

function SidebarProfileDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative px-2 py-2 mt-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.40)' }}>
      <button
        onClick={() => setOpen(p => !p)}
        className="nav-btn nav-btn-inactive w-full"
      >
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
          style={{
            background: 'rgba(221,235,213,0.85)',
            color: '#31543A',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70)',
            border: '1px solid rgba(255,255,255,0.50)',
          }}
        >
          GA
        </span>
        <span className="flex-1 text-left text-[13px] truncate" style={{ color: '#172B4D' }}>Gravion Admin · Free</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8290A3', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div
          className="absolute left-2 right-2 bottom-full mb-2 rounded-2xl overflow-hidden z-[9999]"
          style={{
            background: 'rgba(252,249,245,0.96)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.65)',
            boxShadow: '0 8px 32px rgba(30,40,55,0.14)',
          }}
        >
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(200,185,165,0.30)' }}>
            <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>Gravion Admin</p>
            <p className="text-[11px]" style={{ color: '#68758A' }}>admin@mrpl.co.in</p>
            <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(249,115,22,0.10)', color: '#F97316' }}>Administrator</span>
          </div>
          <div className="py-1.5">
            {[
              { icon: User, label: 'My Profile' },
              { icon: Settings, label: 'Settings' },
            ].map(({ icon: Icon, label }) => (
              <button key={label} onClick={() => setOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-white/60"
                style={{ color: '#172B4D' }}>
                <Icon className="w-4 h-4" style={{ color: '#8290A3' }} />
                {label}
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(200,185,165,0.30)' }}>
            <div className="flex items-stretch">
              <button onClick={() => setOpen(false)}
                className="flex-1 flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-red-50/60 rounded-bl-2xl"
                style={{ color: '#E53E3E' }}>
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
              <button onClick={() => {
                if (window.confirm('Are you sure you want to clear all data? This cannot be undone.')) {
                  fetch('http://localhost:8000/api/documents/clear', { method: 'POST' })
                    .catch(e => console.error(e))
                    .finally(() => {
                      localStorage.clear();
                      localStorage.setItem('dataCleared', 'true');
                      window.location.reload();
                    });
                }
              }}
                title="Clear all data"
                className="w-12 flex flex-shrink-0 items-center justify-center transition-colors hover:bg-red-50/60 rounded-br-2xl"
                style={{ color: '#E53E3E', borderLeft: '1px solid rgba(200,185,165,0.30)' }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GravionMark({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/ChatGPT Image Sep 5, 2026, 02_41_31 PM.png"
      width={size}
      height={size}
      alt="Gravion logo"
      style={{ borderRadius: 8, objectFit: 'cover' }}
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 mb-1.5 flex-shrink-0 flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: '#8290A3' }}>
        {children}
      </span>
      <div className="flex-1 h-px" style={{ background: 'rgba(200,185,165,0.35)' }} />
    </div>
  );
}

function CollapsedSidebar({ activeView, onNavigate, onToggle }: Omit<SidebarProps, 'collapsed' | 'sessions' | 'activeSessionId' | 'onNewChat' | 'onSessionSelect' | 'onRemoveSession'>) {
  return (
    <aside className="glass-sidebar w-[64px] flex flex-col items-center flex-shrink-0 py-4 gap-1">
      <button onClick={() => onNavigate('command')} className="mb-3" aria-label="GRAVION home">
        <GravionMark size={42} />
      </button>
      <button
        onClick={onToggle}
        className="p-2 rounded-xl text-[#8290A3] hover:bg-white/40 transition-colors mb-2"
        aria-label="Expand sidebar"
      >
        <ChevronsLeft className="w-4 h-4 rotate-180" />
      </button>
      <button
        onClick={() => onNavigate('command')}
        title="New"
        className={`p-2 rounded-xl transition-all ${activeView === 'command' ? 'nav-btn-active' : 'text-[#53657D] hover:bg-white/40'}`}
      >
        <Plus className="w-[17px] h-[17px]" />
      </button>
      {featureItems.map(({ label, view, icon: Icon }) => (
        <button
          key={label}
          onClick={() => onNavigate(view)}
          title={label}
          className={`p-2 rounded-xl transition-all ${activeView === view ? 'nav-btn-active' : 'text-[#53657D] hover:bg-white/40'}`}
        >
          <Icon className="w-[17px] h-[17px]" />
        </button>
      ))}
      {toolItems.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          title={label}
          className={`p-2 rounded-xl transition-all ${activeView === id ? 'nav-btn-active' : 'text-[#53657D] hover:bg-white/40'}`}
        >
          <Icon className="w-[17px] h-[17px]" />
        </button>
      ))}
      <div className="flex-1" />
      <button
        onClick={() => onNavigate('settings')}
        title="Customize"
        className={`p-2 rounded-xl transition-all ${activeView === 'settings' ? 'nav-btn-active' : 'text-[#53657D] hover:bg-white/40'}`}
      >
        <SlidersHorizontal className="w-[17px] h-[17px]" />
      </button>
    </aside>
  );
}

export function Sidebar({ activeView, onNavigate, collapsed, onToggle, sessions, activeSessionId, onNewChat, onSessionSelect, onRemoveSession }: SidebarProps) {
  if (collapsed) {
    return <CollapsedSidebar activeView={activeView} onNavigate={onNavigate} onToggle={onToggle} />;
  }

  return (
    <aside className="glass-sidebar w-[280px] flex flex-col flex-shrink-0 overflow-hidden">

      {/* Logo row */}
      <div
        className="px-4 pt-[18px] pb-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.40)' }}
      >
        <button
          onClick={() => onNavigate('command')}
          className="flex items-center gap-2.5 focus:outline-none"
          aria-label="GRAVION home"
        >
          <GravionMark size={42} />
          <span className="font-bold text-[15px] tracking-[0.14em] uppercase select-none" style={{ color: '#172B4D' }}>
            GRAVION
          </span>
        </button>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-xl text-[#8290A3] hover:bg-white/50 transition-colors"
          aria-label="Collapse sidebar"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-4">
        {/* New button */}
        <nav className="px-2 pt-2 flex-shrink-0" aria-label="Main navigation">
          <button
            onClick={onNewChat}
            className="nav-btn nav-btn-inactive"
          >
            <Plus className="w-[16px] h-[16px] flex-shrink-0" />
            <span className="flex-1 text-left">New Chat</span>
          </button>
        </nav>

      {/* Recent Chats */}
      {sessions.filter(s => s.messages.length > 0).length > 0 && (
        <>
          <div className="mt-4 flex-shrink-0">
            <SectionLabel>Recent</SectionLabel>
          </div>
          <div className="px-2 space-y-0.5 flex-shrink-0 overflow-y-auto" style={{ maxHeight: 200 }}>
            {sessions.filter(s => s.messages.length > 0).map((s) => (
              <div key={s.id} className="flex items-center gap-1 group">
                <button
                  onClick={() => onSessionSelect(s.id)}
                  className={`nav-btn flex-1 min-w-0 ${s.id === activeSessionId && activeView === 'command' ? 'nav-btn-active' : 'nav-btn-inactive'}`}
                  title={s.title}
                >
                  <MessageSquare className="w-[14px] h-[14px] flex-shrink-0" style={{ color: s.id === activeSessionId ? '#F97316' : '#8290A3' }} />
                  <span className="truncate flex-1 text-left text-[12.5px]">{s.title}</span>
                </button>
                <button
                  onClick={() => onRemoveSession(s.id)}
                  className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
                  style={{ color: '#8290A3' }}
                  aria-label="Delete chat"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Features */}
      <div className="mt-4 flex-shrink-0">
        <SectionLabel>Features</SectionLabel>
      </div>
      <div className="px-2 space-y-0.5 flex-shrink-0">
        {featureItems.map(({ label, view, icon: Icon }) => {
          const isActive = activeView === view;
          return (
            <button
              key={label}
              onClick={() => onNavigate(view)}
              className={`nav-btn ${isActive ? 'nav-btn-active' : 'nav-btn-inactive'}`}
            >
              <Icon className="w-[15px] h-[15px] flex-shrink-0" style={{ color: '#8290A3' }} />
              <span className="truncate flex-1 text-left">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tools */}
      <div className="mt-4 flex-shrink-0">
        <SectionLabel>Tools</SectionLabel>
      </div>
      <div className="px-2 space-y-0.5 flex-shrink-0">
        {toolItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`nav-btn ${activeView === id ? 'nav-btn-active' : 'nav-btn-inactive'}`}
          >
            <Icon className="w-[15px] h-[15px] flex-shrink-0" style={{ color: '#8290A3' }} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Customize */}
      <div className="px-2 mt-3 flex-shrink-0">
        <button
          onClick={() => onNavigate('settings')}
          className={`nav-btn ${activeView === 'settings' ? 'nav-btn-active' : 'nav-btn-inactive'}`}
        >
          <SlidersHorizontal className="w-[15px] h-[15px] flex-shrink-0" style={{ color: '#8290A3' }} />
          <span className="flex-1 text-left">Customize</span>
        </button>
      </div>
      </div>

      <SidebarProfileDropdown />
    </aside>
  );
}

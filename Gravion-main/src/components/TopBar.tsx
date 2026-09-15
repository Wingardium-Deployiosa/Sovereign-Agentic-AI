import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, ShieldCheck, User, Settings, LogOut } from 'lucide-react';
import type { ViewId } from '@/lib/nav';

interface TopBarProps {
  onToggleSidebar: () => void;
  activeView: ViewId;
}

const VIEW_TITLES: Record<ViewId, string> = {
  command:     'GRAVION command center',
  knowledge:   'Industrial knowledge base',
  inspection:  'Equipment inspection review',
  telemetry:   'Telemetry',
  engineering: 'Engineering',
  agents:      'Agents',
  codelab:     'Code Lab',
  approvals:   'Approvals',
  audit:       'Audit',
  sovereignty: 'Sovereignty',
  settings:    'Settings',
};

function ProfileDropdown() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setOpen(p => !p);
  }

  const menu = open ? createPortal(
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        right: pos.right,
        width: 220,
        zIndex: 99999,
        borderRadius: 16,
        overflow: 'hidden',
        background: 'rgba(252,249,245,0.98)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.65)',
        boxShadow: '0 8px 32px rgba(30,40,55,0.18)',
      }}
    >
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(200,185,165,0.30)' }}>
        <p className="text-[13px] font-semibold" style={{ color: '#172B4D' }}>Gravion Admin</p>
        <p className="text-[11px]" style={{ color: '#68758A' }}>admin@mrpl.co.in</p>
        <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(249,115,22,0.10)', color: '#F97316' }}>Administrator</span>
      </div>
      <div className="py-1.5">
        {[{ icon: User, label: 'My Profile' }, { icon: Settings, label: 'Settings' }].map(({ icon: Icon, label }) => (
          <button key={label} onClick={() => setOpen(false)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-white/60"
            style={{ color: '#172B4D' }}>
            <Icon className="w-4 h-4" style={{ color: '#8290A3' }} />{label}
          </button>
        ))}
      </div>
      <div style={{ borderTop: '1px solid rgba(200,185,165,0.30)' }}>
        <button onClick={() => setOpen(false)}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-red-50/60"
          style={{ color: '#E53E3E' }}>
          <LogOut className="w-4 h-4" />Sign Out
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 select-none"
        style={{
          background: 'rgba(221,235,213,0.85)',
          color: '#31543A',
          border: '1.5px solid rgba(255,255,255,0.70)',
          boxShadow: '0 2px 8px rgba(30,40,55,0.10), inset 0 1px 0 rgba(255,255,255,0.80)',
        }}
        aria-label="Profile menu"
      >
        GA
      </button>
      {menu}
    </>
  );
}

export function TopBar({ activeView }: TopBarProps) {
  const [search, setSearch] = useState('');

  return (
    <header className="glass-topbar h-[60px] flex items-center gap-4 px-5 flex-shrink-0">

      {/* Title */}
      <button
        className="flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-1.5 transition-all flex-shrink-0 hover:bg-white/40"
      >
        <span className="text-[14px] font-semibold" style={{ color: '#172B4D' }}>
          {VIEW_TITLES[activeView]}
        </span>
        <ChevronDown className="w-3.5 h-3.5" style={{ color: '#8792A3' }} />
      </button>

      {/* Search */}
      <div className="flex-1 flex justify-center">
        <div className="glass-search w-full max-w-[480px] flex items-center gap-2 px-3.5 py-2 transition-all">
          <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#8A96A8' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your projects, documents, equipment..."
            className="flex-1 bg-transparent text-[13px] focus:outline-none min-w-0 placeholder:text-[#8994A5]"
            style={{ color: '#172B4D' }}
            aria-label="Search"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2.5 flex-shrink-0">

        {/* Air-gapped badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
          style={{
            background: 'rgba(34,197,94,0.10)',
            border: '1px solid rgba(34,197,94,0.25)',
          }}
          title="Air-gapped — no external connections"
        >
          <ShieldCheck style={{ width: 14, height: 14, color: '#16a34a' }} />
          <span className="text-[11px] font-semibold" style={{ color: '#16a34a' }}>Air-Gapped</span>
        </div>

        {/* Avatar + dropdown */}
        <ProfileDropdown />
      </div>
    </header>
  );
}

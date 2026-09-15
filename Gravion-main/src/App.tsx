import { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/Sidebar';
import { CommandPage } from '@/pages/CommandPage';
import { KnowledgePage } from '@/pages/KnowledgePage';
import { InspectionPage } from '@/pages/InspectionPage';
import { TelemetryPage } from '@/pages/TelemetryPage';
import { EngineeringPage } from '@/pages/EngineeringPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { CodeLabPage } from '@/pages/CodeLabPage';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { AuditPage } from '@/pages/AuditPage';
import { SovereigntyPage } from '@/pages/SovereigntyPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { VoiceAssistant } from '@/components/VoiceAssistant';
import type { ViewId } from '@/lib/nav';
import type { ChatSession } from '@/lib/sessions';
import { loadSessions, saveSessions } from '@/lib/sessions';

let _sid = Date.now();
const newSessionId = () => `s${++_sid}`;

function App() {
  const [activeView, setActiveView] = useState<ViewId>('command');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [manualToggle, setManualToggle] = useState(false);
  const voiceCommandRef = useRef<((text: string, onResponse?: (msg: string) => void) => void) | null>(null);
  const voiceRunLastRef  = useRef<(() => void) | null>(null);
  const voiceInputRef    = useRef<string>('');

  // Chat sessions — each is an isolated conversation
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = loadSessions();
    if (saved.length > 0) return saved;
    const id = newSessionId();
    return [{ id, title: 'New Chat', messages: [] }];
  });
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const saved = loadSessions();
    return saved.length > 0 ? saved[0].id : sessions[0]?.id ?? newSessionId();
  });

  // Persist sessions whenever they change
  useEffect(() => { saveSessions(sessions); }, [sessions]);

  const handleNewChat = useCallback(() => {
    const id = newSessionId();
    setSessions(prev => [{ id, title: 'New Chat', messages: [] }, ...prev]);
    setActiveSessionId(id);
    setActiveView('command');
  }, []);

  const handleSessionSelect = useCallback((id: string) => {
    setActiveSessionId(id);
    setActiveView('command');
  }, []);

  const handleRemoveSession = useCallback((id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      const remaining = next.length > 0 ? next : [{ id: newSessionId(), title: 'New Chat', messages: [] }];
      if (id === activeSessionId) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  }, [activeSessionId]);

  const handleSessionUpdate = useCallback((id: string, title: string, messages: ChatSession['messages']) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title, messages } : s));
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (!manualToggle) setSidebarCollapsed(window.innerWidth < 1024);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [manualToggle]);

  useEffect(() => {
    const handleGravionNavigate = (e: Event) => {
      const customEvent = e as CustomEvent<ViewId>;
      if (customEvent.detail) setActiveView(customEvent.detail);
    };
    window.addEventListener('gravion-navigate', handleGravionNavigate);
    return () => window.removeEventListener('gravion-navigate', handleGravionNavigate);
  }, []);

  function handleToggle() {
    setSidebarCollapsed(p => !p);
    setManualToggle(true);
  }

  const activeSession = sessions.find(s => s.id === activeSessionId)
    ?? sessions[0]
    ?? { id: activeSessionId, title: 'New Chat', messages: [] };

  function renderView() {
    switch (activeView) {
      case 'command':     return (
        <CommandPage
          key={activeSessionId}
          session={activeSession}
          onSessionUpdate={handleSessionUpdate}
          onRegisterVoiceHandler={(fn) => { voiceCommandRef.current = fn; }}
          onRegisterRunLast={(fn) => { voiceRunLastRef.current = fn; }}
          onInputChange={(val) => { voiceInputRef.current = val; }}
          onNavigate={setActiveView}
        />
      );
      case 'knowledge':   return <KnowledgePage />;
      case 'inspection':  return <InspectionPage />;
      case 'telemetry':   return <TelemetryPage />;
      case 'engineering': return <EngineeringPage />;
      case 'agents':      return <AgentsPage />;
      case 'codelab':     return <CodeLabPage />;
      case 'approvals':   return <ApprovalsPage />;
      case 'audit':       return <AuditPage />;
      case 'sovereignty': return <SovereigntyPage />;
      case 'settings':    return <SettingsPage />;
      default:            return (
        <CommandPage
          key={activeSessionId}
          session={activeSession}
          onSessionUpdate={handleSessionUpdate}
          onRegisterVoiceHandler={(fn) => { voiceCommandRef.current = fn; }}
          onRegisterRunLast={(fn) => { voiceRunLastRef.current = fn; }}
          onInputChange={(val) => { voiceInputRef.current = val; }}
          onNavigate={setActiveView}
        />
      );
    }
  }

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ position: 'relative' }}
    >
      {/* Full-page background — industrial image */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(/gravion-industrial-background.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center right',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#EDE5D8',
          zIndex: 0,
        }}
      />
      {/* Warm ambient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(247,244,238,0.25) 0%, rgba(240,230,215,0.10) 50%, rgba(249,115,22,0.02) 100%)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* App shell — sits above background */}
      <div
        className="flex h-full w-full"
        style={{ position: 'relative', zIndex: 2 }}
      >
        <Sidebar
          activeView={activeView}
          onNavigate={setActiveView}
          collapsed={sidebarCollapsed}
          onToggle={handleToggle}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewChat={handleNewChat}
          onSessionSelect={handleSessionSelect}
          onRemoveSession={handleRemoveSession}
        />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar onToggleSidebar={handleToggle} activeView={activeView} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            {renderView()}
          </main>
        </div>
      </div>

      {/* Hey GRAVION voice assistant — floats above everything */}
      <div style={{ position: 'relative', zIndex: 9999 }}>
        <VoiceAssistant
          onSendCommand={(text, onResponse) => {
            setActiveView('command');
            setTimeout(() => voiceCommandRef.current?.(text, onResponse), 100);
          }}
          inputRef={voiceInputRef}
        />
      </div>
    </div>
  );
}

export default App;

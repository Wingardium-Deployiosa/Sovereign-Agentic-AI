import type { CommandResponse } from './api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imagePreview?: string;
  response?: CommandResponse;
  loading?: boolean;
  error?: string;
  /** True if the model generating this message is a reasoning model capable of <think> blocks */
  isReasoningModel?: boolean;
  /** Live-streaming thought tokens (ChatGPT-style animation) */
  streamingThought?: string;
  /** Live-streaming message tokens (ChatGPT-style animation) */
  streamingMessage?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
}

const KEY = 'gravion_sessions';
const MAX = 20;

export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    // Strip loading state on reload — in-flight messages won't resolve
    const sessions: ChatSession[] = JSON.parse(raw);
    const seenIds = new Set<string>();
    return sessions.slice(0, MAX).map(s => ({
      ...s,
      messages: s.messages.map((m, idx) => {
        let id = m.id;
        if (!id || seenIds.has(id)) {
          id = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `msg_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`;
        }
        seenIds.add(id);
        return {
          ...m,
          id,
          imagePreview: m.imagePreview?.startsWith('blob:') ? undefined : m.imagePreview,
          loading: false,
          error: m.loading ? 'Session restored' : m.error,
        };
      }),
    }));
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]) {
  try {
    // Don't persist loading messages
    const clean = sessions.slice(0, MAX).map(s => ({
      ...s,
      messages: s.messages.filter(m => !m.loading),
    }));
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch { /* quota exceeded — ignore */ }
}

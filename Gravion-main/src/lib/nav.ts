import {
  Terminal, BookOpen, ScanLine, Activity, Calculator,
  Bot, Code2, ClipboardCheck, ScrollText, Shield, Settings,
  type LucideIcon,
} from 'lucide-react';

export type ViewId =
  | 'command' | 'knowledge' | 'inspection' | 'telemetry'
  | 'engineering' | 'agents' | 'codelab' | 'approvals'
  | 'audit' | 'sovereignty' | 'settings';

export interface NavItem { id: ViewId; label: string; icon: LucideIcon; }

export const NAV_ITEMS: NavItem[] = [
  { id: 'command',     label: 'Command',     icon: Terminal },
  { id: 'knowledge',   label: 'Knowledge',   icon: BookOpen },
  { id: 'inspection',  label: 'Inspection',  icon: ScanLine },
  { id: 'telemetry',   label: 'Telemetry',   icon: Activity },
  { id: 'engineering', label: 'Engineering', icon: Calculator },
  { id: 'agents',      label: 'Agents',      icon: Bot },
  { id: 'codelab',     label: 'Code Lab',    icon: Code2 },
  { id: 'approvals',   label: 'Approvals',   icon: ClipboardCheck },
  { id: 'audit',       label: 'Audit',       icon: ScrollText },
  { id: 'sovereignty', label: 'Sovereignty', icon: Shield },
  { id: 'settings',    label: 'Settings',    icon: Settings },
];

import type { ChecklistStatus } from '@/lib/api';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  type LucideIcon,
} from 'lucide-react';

const statusConfig: Record<
  ChecklistStatus,
  { color: string; bg: string; border: string; icon: LucideIcon; label: string }
> = {
  Pass: {
    color: 'text-success',
    bg: 'bg-success-light',
    border: 'border-success/20',
    icon: CheckCircle2,
    label: 'Pass',
  },
  Attention: {
    color: 'text-warning',
    bg: 'bg-warning-light',
    border: 'border-warning/20',
    icon: AlertTriangle,
    label: 'Attention',
  },
  Fail: {
    color: 'text-danger',
    bg: 'bg-danger-light',
    border: 'border-danger/20',
    icon: XCircle,
    label: 'Fail',
  },
  'N/A': {
    color: 'text-text-tertiary',
    bg: 'bg-surface-hover',
    border: 'border-border',
    icon: MinusCircle,
    label: 'N/A',
  },
};

export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: ChecklistStatus;
  size?: 'sm' | 'xs';
}) {
  const cfg = statusConfig[status];
  const Icon = cfg.icon;
  const sizeClass = size === 'xs' ? 'text-2xs px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg ${cfg.bg} ${cfg.border} ${cfg.color} ${sizeClass} font-semibold uppercase tracking-wider border`}
    >
      <Icon className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {cfg.label}
    </span>
  );
}

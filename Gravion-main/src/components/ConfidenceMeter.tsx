export function ConfidenceMeter({
  value,
  label = 'Confidence',
  showLabel = true,
}: {
  value: number;
  label?: string;
  showLabel?: boolean;
}) {
  const pct = Math.round(value * 100);
  let color = 'bg-success';
  let textColor = 'text-success';
  if (pct < 50) {
    color = 'bg-danger';
    textColor = 'text-danger';
  } else if (pct < 75) {
    color = 'bg-warning';
    textColor = 'text-warning';
  }

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {label}
          </span>
          <span className={`text-sm font-bold ${textColor} font-mono`}>{pct}%</span>
        </div>
      )}
      <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ConfidenceBreakdownBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const pct = Math.round(value * 100);
  let color = 'bg-success';
  if (pct < 50) color = 'bg-danger';
  else if (pct < 75) color = 'bg-warning';

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-secondary w-40 capitalize truncate">
        {label.replace(/_/g, ' ')}
      </span>
      <div className="flex-1 h-1 bg-surface-hover rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-text-secondary w-10 text-right">{pct}%</span>
    </div>
  );
}

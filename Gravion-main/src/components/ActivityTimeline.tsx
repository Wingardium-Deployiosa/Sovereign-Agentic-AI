import { Check, Loader2 } from 'lucide-react';

export interface TimelineStep {
  label: string;
  done: boolean;
}

export function ActivityTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="panel p-4">
      <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
        Activity Timeline
      </h3>
      <div className="space-y-0">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3 relative">
            {i < steps.length - 1 && (
              <div
                className={`absolute left-[7px] top-5 w-px h-6 ${step.done ? 'bg-success/30' : 'bg-border'}`}
              />
            )}
            <div className="relative flex items-center">
              {step.done ? (
                <div className="w-4 h-4 rounded-full bg-success-light border border-success/30 flex items-center justify-center flex-shrink-0">
                  <Check className="w-2.5 h-2.5 text-success" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full bg-surface-hover border border-border flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-2.5 h-2.5 text-text-tertiary animate-spin" />
                </div>
              )}
            </div>
            <span className={`text-sm py-1.5 ${step.done ? 'text-text-primary' : 'text-text-tertiary'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

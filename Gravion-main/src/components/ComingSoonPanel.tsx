import type { LucideIcon } from 'lucide-react';
import { AlertCircle, ArrowRight } from 'lucide-react';

export interface ComingSoonProps {
  title: string;
  subtitle: string;
  status: 'REQUIRES BACKEND' | 'NOT CONFIGURED';
  bullets: string[];
  icon: LucideIcon;
}

export function ComingSoonPanel({ title, subtitle, status, bullets, icon: Icon }: ComingSoonProps) {
  return (
    <div className="max-w-[760px] mx-auto px-6 py-10 animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-accent-light border border-accent/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="font-serif text-[22px] text-text-primary tracking-tight">{title}</h1>
          <p className="text-sm text-text-secondary">{subtitle}</p>
        </div>
      </div>

      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider bg-warning-light text-warning border border-warning/20">
          <AlertCircle className="w-3.5 h-3.5" />
          {status}
        </span>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-4">Planned Capabilities</h2>
        <div className="space-y-3">
          {bullets.map((bullet, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface hover:bg-surface-hover transition-colors">
              <ArrowRight className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <span className="text-sm text-text-secondary">{bullet}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

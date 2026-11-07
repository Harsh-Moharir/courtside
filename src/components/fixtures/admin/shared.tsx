'use client';
import { AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FixtureView } from '@/lib/queries/fixtures';

export interface RpcWarning {
  code: string;
  message: string;
}

export type WithWarnings = { warnings?: RpcWarning[] | null; fixture?: Partial<FixtureView> | null };

export function announceWarnings(ws: RpcWarning[] | null | undefined): RpcWarning[] {
  const list = ws ?? [];
  list.forEach((w) => toast.warning(w.message));
  return list;
}

export function WarningsPanel({ title, warnings, onDismiss }: { title: string; warnings: RpcWarning[]; onDismiss: () => void }) {
  if (warnings.length === 0) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-card border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <ul className="mt-1 list-disc pl-5 text-muted">
          {warnings.map((w, i) => (
            <li key={`${w.code}-${i}`}>{w.message}</li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted">Warnings never block a change.</p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss warnings" className="rounded-btn p-1 text-muted hover:text-fg">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AdminCard({ title, description, children, className }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-border bg-surface p-4 sm:p-5 ${className ?? ''}`}>
      <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function fixtureTitle(f: FixtureView): string {
  return `M${f.match_number}: ${f.home?.name ?? 'TBD'} vs ${f.away?.name ?? 'TBD'}`;
}

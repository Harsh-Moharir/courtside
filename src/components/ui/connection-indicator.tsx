'use client';
import type { RealtimeStatus } from '@/lib/realtime/use-realtime-query';
import { cn } from './cn';

export function ConnectionIndicator({ status, className }: { status: RealtimeStatus; className?: string }) {
  const map: Record<RealtimeStatus, { label: string; dot: string }> = {
    connecting: { label: 'Connecting', dot: 'bg-muted' },
    live: { label: 'Live', dot: 'bg-success' },
    reconnecting: { label: 'Reconnecting', dot: 'bg-warning animate-pulse-dot' },
    polling: { label: 'Reconnecting (auto-refresh)', dot: 'bg-warning animate-pulse-dot' },
  };
  const m = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted', className)} role="status" aria-live="polite">
      <span className={cn('h-2 w-2 rounded-full', m.dot)} aria-hidden />
      {m.label}
    </span>
  );
}

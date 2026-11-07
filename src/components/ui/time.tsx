'use client';
import { useEffect, useState } from 'react';
import { useTournament } from '@/components/providers/tournament-context';
import { approxTime, formatInTournamentTz, relativeTime } from '@/lib/format';

export function RelativeTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!iso) return null;
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {relativeTime(iso, now)}
    </time>
  );
}

/** Formats in the tournament time zone (11.8). */
export function TzDate({ iso, pattern, className }: { iso: string | null | undefined; pattern: string; className?: string }) {
  const t = useTournament();
  if (!iso) return null;
  return (
    <time dateTime={iso} className={className}>
      {formatInTournamentTz(iso, pattern, t.timezone)}
    </time>
  );
}

export function ApproxTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const t = useTournament();
  return <span className={className}>{approxTime(iso, t.timezone)}</span>;
}

/** Countdown that never shows negative time: "Starting soon" once passed (11.3). */
export function Countdown({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!iso || now === null) return null;
  const diff = Math.floor((new Date(iso).getTime() - now) / 1000);
  if (diff <= 0) return <span className={className}>Starting soon</span>;
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const parts = d > 0 ? `${d}d ${h}h ${m}m` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (
    <span className={className} aria-label={`Starts in ${parts}`}>
      {parts}
    </span>
  );
}

'use client';
import { Scoreboard } from './scoreboard';
import { useMatch } from './use-match';
import type { MatchBundle } from '@/lib/queries/matches';
import { Skeleton } from '@/components/ui/misc';

/** Self-subscribing compact scoreboard for embedding (homepage, fixtures). */
export function LiveScoreboardCompact({ fixtureId, initial, linkToMatch = true, className }: { fixtureId: string; initial: MatchBundle | null; linkToMatch?: boolean; className?: string }) {
  const { data, status } = useMatch(fixtureId, initial, { eventLimit: 1, pollMs: 5000 });
  if (!data) return <Skeleton className="h-36 w-full" />;
  return <Scoreboard bundle={data} variant="compact" connection={status} linkToMatch={linkToMatch} className={className} />;
}

/** Self-subscribing full scoreboard. */
export function LiveScoreboardFull({ fixtureId, initial, className }: { fixtureId: string; initial: MatchBundle | null; className?: string }) {
  const { data, status } = useMatch(fixtureId, initial, { eventLimit: 1 });
  if (!data) return <Skeleton className="h-64 w-full" />;
  return <Scoreboard bundle={data} variant="full" connection={status} className={className} />;
}

'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchChampion, type ChampionData } from '@/lib/queries/playoffs';
import { TeamLogo, PlayerAvatar } from '@/components/ui/media';
import { IconBadge } from '@/components/ui/badge';
import { teamStyle } from '@/lib/color';
import type { TeamLite } from '@/lib/queries/standings';

const CONFETTI_COLORS = ['#F97316', '#FACC15', '#FFFFFF', '#22C55E', '#EF4444'];

function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 1.8 + Math.random() * 1.4,
      rotate: Math.random() * 540 - 270,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 6,
    })),
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block rounded-sm"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.5, background: p.color }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{ y: 420, opacity: 0, rotate: p.rotate }}
          transition={{ delay: p.delay, duration: p.duration, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

function Podium({ label, team }: { label: string; team: TeamLite | null }) {
  if (!team) return null;
  return (
    <Link href={`/teams/${team.id}`} className="flex items-center gap-2 rounded-btn border border-border bg-[rgba(10,10,10,0.4)] px-3 py-2 hover:border-[rgba(249,115,22,0.6)]">
      <TeamLogo logoPath={team.logo_path} name={team.name} shortName={team.short_name} color={team.primary_color} size={28} />
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-muted">{label}</span>
        <span className="block truncate text-sm font-semibold">{team.name}</span>
      </span>
    </Link>
  );
}

/** Champion banner (10.6). Renders nothing until the final is completed. Used on /playoffs and the homepage. */
export function ChampionBanner({ initial, realtime = true }: { initial: ChampionData | null; realtime?: boolean }) {
  const reduce = useReducedMotion();
  const { data } = useRealtimeQuery<ChampionData | null>({
    key: 'champion',
    initialData: initial,
    fetcher: () => fetchChampion(getBrowserClient()),
    subscriptions: [{ table: 'tournaments' }, { table: 'playoff_brackets' }],
    enabled: realtime,
  });
  const [celebrate, setCelebrate] = useState(false);
  const championId = data?.champion.id ?? null;
  useEffect(() => {
    if (!championId || reduce) return;
    setCelebrate(true);
    const t = setTimeout(() => setCelebrate(false), 4000);
    return () => clearTimeout(t);
  }, [championId, reduce]);

  if (!data) return null;
  const c = data.champion;
  return (
    <section
      aria-label="Tournament champions"
      style={teamStyle(c.primary_color, c.secondary_color)}
      className="relative overflow-hidden rounded-card border border-[rgba(250,204,21,0.5)] bg-[radial-gradient(ellipse_at_top,rgba(250,204,21,0.18),transparent_60%),linear-gradient(135deg,color-mix(in_srgb,var(--team-primary)_35%,#141414),#141414_70%)]"
    >
      {celebrate && <Confetti />}
      <div className="relative flex flex-col items-center gap-6 px-5 py-8 text-center md:flex-row md:text-left">
        <motion.div
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 160, damping: 14 }}
          className="relative shrink-0"
        >
          <TeamLogo
            logoPath={c.logo_path}
            name={c.name}
            shortName={c.short_name}
            color={c.primary_color}
            size={144}
            className="shadow-[0_0_60px_-6px_rgba(250,204,21,0.6)]"
          />
          <span className="absolute -bottom-2 -right-2 flex h-12 w-12 items-center justify-center rounded-full bg-gold text-black shadow-lg">
            <Trophy className="h-6 w-6" aria-hidden />
          </span>
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold uppercase tracking-[0.25em] text-gold">Tournament Champions</p>
          <h2 className="truncate font-display text-5xl font-extrabold uppercase leading-none sm:text-6xl" title={c.name}>
            <Link href={`/teams/${c.id}`} className="hover:underline">
              {c.name}
            </Link>
          </h2>
          <p className="mt-2 text-sm">
            <span className="text-muted">Owner: </span>
            <span className="font-semibold">{c.owner?.full_name ?? 'To be announced'}</span>
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-3 md:justify-start">
            {[c.icon1, c.icon2].map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                {p ? <PlayerAvatar photoPath={p.photo_path} name={p.full_name} size={40} icon /> : null}
                <span className="text-sm">
                  <span className="text-muted">Icon Player {i + 1}: </span>
                  <span className="font-semibold">{p?.full_name ?? 'To be announced'}</span>
                </span>
                {p && <IconBadge />}
              </div>
            ))}
          </div>
        </div>
        {(data.runnerUp || data.third) && (
          <div className="flex w-full flex-col gap-2 md:w-56">
            <Podium label="Runner-up" team={data.runnerUp} />
            <Podium label="Third place" team={data.third} />
          </div>
        )}
      </div>
    </section>
  );
}

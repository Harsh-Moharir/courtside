'use client';
import { useTournament } from '@/components/providers/tournament-context';
import { useRealtimeQuery } from '@/lib/realtime/use-realtime-query';
import { getBrowserClient } from '@/lib/supabase/browser';
import { fetchCounts } from '@/lib/queries/home';
import { publicUrl } from '@/lib/storage';

export function Hero({ initialCounts }: { initialCounts: { teams: number; players: number } }) {
  const t = useTournament();
  const { data } = useRealtimeQuery({
    key: 'home-counts',
    initialData: initialCounts,
    subscriptions: [{ table: 'teams' }, { table: 'players' }],
    fetcher: () => fetchCounts(getBrowserClient()),
    debounceMs: 800,
  });
  const counts = data ?? initialCounts;
  const banner = publicUrl('tournament-assets', t.banner_path);
  const logo = publicUrl('tournament-assets', t.logo_path);
  return (
    <section className="relative overflow-hidden rounded-card border border-border">
      {banner ? (
        <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.45),transparent_55%),linear-gradient(135deg,#1c1c1c,#0a0a0a_60%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/30" />
      <div className="relative flex flex-col gap-6 px-5 py-10 sm:px-10 sm:py-16 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          {logo ? (
            <img src={logo} alt={`${t.name} logo`} className="h-20 w-20 shrink-0 rounded-full bg-black/40 object-contain sm:h-28 sm:w-28" />
          ) : (
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-accent text-4xl sm:h-28 sm:w-28 sm:text-6xl" aria-hidden>
              🏀
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">{t.name}</h1>
            {t.tagline && <p className="mt-2 max-w-xl text-base text-[#e5e5e5] sm:text-lg">{t.tagline}</p>}
          </div>
        </div>
        <dl className="flex gap-3">
          {[
            ['Teams', counts.teams],
            ['Registered players', counts.players],
          ].map(([label, n]) => (
            <div key={label} className="min-w-[120px] rounded-card border border-white/10 bg-black/50 px-5 py-3 backdrop-blur">
              <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
              <dd className="font-display text-4xl font-extrabold tabular text-accent">{n}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

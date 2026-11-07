import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { getDashboardData } from '@/lib/queries/admin';
import { Card, PageHeader } from '@/components/ui/card';
import { PhaseSelector } from '@/components/admin/phase-selector';
import { DashboardRefresher } from '@/components/admin/dashboard-refresher';
import { ADMIN_SECTIONS } from '@/components/admin/admin-sections';

export const metadata: Metadata = { title: 'Admin dashboard' };
export const dynamic = 'force-dynamic';

function Stat({ label, value, sub, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="group rounded-card border border-border bg-surface p-4 transition hover:border-accent/60">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-4xl font-extrabold tabular">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Link>
  );
}

const AUCTION_LABEL: Record<string, string> = { not_started: 'Not started', live: 'Live', paused: 'Paused', completed: 'Completed' };

export default async function AdminDashboard() {
  const d = await getDashboardData();
  const doneCount = d.checklist.filter((c) => c.done).length;
  const auctionStatus = d.auction?.status ?? 'not_started';
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={d.tournament?.name}
        action={d.tournament ? <PhaseSelector tournamentId={d.tournament.id} phase={d.tournament.phase} /> : null}
      />
      <DashboardRefresher />
      <section aria-label="Counters" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Teams" value={`${d.counts.teams}/10`} href="/admin/teams" />
        <Stat
          label="Players"
          value={d.counts.players.total}
          sub={`${d.counts.players.available} available · ${d.counts.players.sold} sold · ${d.counts.players.unsold} unsold · ${d.counts.players.icon} icon`}
          href="/admin/players"
        />
        <Stat
          label="Auction"
          value={<span className="text-3xl">{AUCTION_LABEL[auctionStatus]}</span>}
          sub={d.auction && d.auction.current_round > 0 ? `Round ${d.auction.current_round}${d.auction.between_rounds ? ' (between rounds)' : ''}` : undefined}
          href="/admin/auction"
        />
        <Stat label="Fixtures" value={`${d.counts.fixtures.completed}/${d.counts.fixtures.total}`} sub="completed of total" href="/admin/fixtures" />
        <Stat
          label="Live matches"
          value={<span className={d.counts.live > 0 ? 'text-danger' : ''}>{d.counts.live}</span>}
          href="/admin/live"
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold uppercase">Setup checklist</h2>
            <span className="text-sm text-muted">
              {doneCount}/{d.checklist.length} done
            </span>
          </div>
          <ol className="divide-y divide-border">
            {d.checklist.map((c) => (
              <li key={c.key}>
                <Link href={c.href} className="flex min-h-[48px] items-center gap-3 py-2 hover:text-accent">
                  {c.done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Done" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-muted" aria-label="Not done" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={c.done ? 'text-fg' : 'text-fg'}>{c.label}</span>
                    {c.detail && <span className="block truncate text-xs text-muted">{c.detail}</span>}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-display text-2xl font-bold uppercase">Warnings</h2>
          {d.warnings.length === 0 ? (
            <p className="text-muted">No warnings. Everything looks consistent.</p>
          ) : (
            <ul className="space-y-2">
              {d.warnings.map((w) => (
                <li key={w.key}>
                  <Link
                    href={w.href}
                    className="flex items-start gap-3 rounded-btn border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm hover:border-warning"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                    <span>{w.message}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className="mt-6" aria-label="Quick links">
        <h2 className="mb-3 font-display text-2xl font-bold uppercase">Manage</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {ADMIN_SECTIONS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-[56px] items-center justify-between rounded-btn border border-border bg-surface px-4 font-semibold hover:border-accent hover:text-accent"
            >
              {l.label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

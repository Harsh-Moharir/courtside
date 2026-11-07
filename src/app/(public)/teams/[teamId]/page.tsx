import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TeamRosterView } from '@/components/team/team-roster-view';
import { getServerClient } from '@/lib/supabase/server';
import { getIsAdmin } from '@/lib/queries/tournament';
import { fetchTeamWithIdentity, isUuid } from '@/lib/queries/teams';
import { fetchRoster, fetchTeamFinance } from '@/lib/queries/roster';
import { publicUrl } from '@/lib/storage';
import { teamStyle } from '@/lib/color';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ teamId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { teamId } = await params;
  if (!isUuid(teamId)) return { title: 'Team not found' };
  const supabase = await getServerClient();
  const team = await fetchTeamWithIdentity(supabase, teamId).catch(() => null);
  if (!team) return { title: 'Team not found' };
  const logo = publicUrl('team-logos', team.logo_path);
  const description = `${team.name} roster, owner ${team.owner?.full_name ?? 'to be announced'}, icon players and auction purchases.`;
  return {
    title: team.name,
    description,
    alternates: { canonical: `/teams/${team.id}` },
    openGraph: { title: team.name, description, url: `/teams/${team.id}`, images: logo ? [{ url: logo, alt: `${team.name} logo` }] : undefined },
    twitter: { card: logo ? 'summary' : 'summary', title: team.name, description, images: logo ? [logo] : undefined },
  };
}

export default async function TeamPage({ params }: Props) {
  const { teamId } = await params;
  if (!isUuid(teamId)) notFound();
  const supabase = await getServerClient();
  const [team, roster, finance, isAdmin] = await Promise.all([
    fetchTeamWithIdentity(supabase, teamId),
    fetchRoster(supabase, teamId),
    fetchTeamFinance(supabase, teamId),
    getIsAdmin(),
  ]);
  if (!team) notFound();
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6" style={teamStyle(team.primary_color, team.secondary_color)}>
      <Link href="/teams" className="mb-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="h-4 w-4" aria-hidden /> All teams
      </Link>
      <TeamRosterView teamId={teamId} initial={{ team, roster, finance }} isAdmin={isAdmin} />
    </div>
  );
}

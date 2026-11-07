import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/queries/teams';
import { AdminTeamDetail } from '@/components/admin/admin-team-detail';

export const metadata: Metadata = { title: 'Team' };

export default async function AdminTeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!isUuid(teamId)) notFound();
  return <AdminTeamDetail teamId={teamId} />;
}

import type { Metadata } from 'next';
import { AdminTeamsList } from '@/components/admin/admin-teams-list';

export const metadata: Metadata = { title: 'Teams' };

export default function AdminTeamsPage() {
  return <AdminTeamsList />;
}

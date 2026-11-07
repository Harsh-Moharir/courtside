import type { Metadata } from 'next';
import { AdminPlayers } from '@/components/admin/admin-players';

export const metadata: Metadata = { title: 'Players' };

export default function AdminPlayersPage() {
  return <AdminPlayers />;
}

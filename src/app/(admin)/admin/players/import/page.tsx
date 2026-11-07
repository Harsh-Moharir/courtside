import type { Metadata } from 'next';
import { PlayerImport } from '@/components/admin/player-import';

export const metadata: Metadata = { title: 'Import players' };

export default function ImportPlayersPage() {
  return <PlayerImport />;
}

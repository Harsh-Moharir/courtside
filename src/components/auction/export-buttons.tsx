'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTournament } from '@/components/providers/tournament-context';
import { exportAuctionCsv, exportAuctionXlsx } from '@/lib/export/auction-history';
import type { AuctionTeam, HistoryRow } from '@/lib/queries/auction';

export function ExportButtons({ rows, teams }: { rows: HistoryRow[]; teams: AuctionTeam[] }) {
  const t = useTournament();
  const [busy, setBusy] = useState(false);
  const teamName = (id: string | null) => teams.find((x) => x.id === id)?.name ?? '';
  // Visitors never export reversed rows (RLS hides them anyway); admins export only the official record too.
  const exportable = rows.filter((r) => r.status !== 'Reversed');
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => exportAuctionCsv(exportable, teamName, t.timezone, t.slug)} disabled={exportable.length === 0}>
        <Download className="h-4 w-4" aria-hidden /> CSV
      </Button>
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        disabled={exportable.length === 0}
        onClick={async () => {
          setBusy(true);
          try {
            await exportAuctionXlsx(exportable, teamName, t.timezone, t.slug);
          } catch {
            toast.error('Could not create the Excel file.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download className="h-4 w-4" aria-hidden /> Excel
      </Button>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTournament } from '@/components/providers/tournament-context';
import { formatInTournamentTz, formatMoney } from '@/lib/format';
import { publicUrl } from '@/lib/storage';
import { downloadBlob, todayStamp } from '@/lib/export/csv';
import type { TeamWithIdentity } from '@/lib/queries/teams';
import type { RosterEntry, TeamFinance } from '@/lib/queries/roster';
import { groupRoster } from '@/lib/queries/roster';

export function RosterPdfButton({ team, roster, finance }: { team: TeamWithIdentity; roster: RosterEntry[]; finance: TeamFinance | null }) {
  const t = useTournament();
  const [busy, setBusy] = useState(false);
  async function exportPdf() {
    setBusy(true);
    try {
      const { buildRosterPdf } = await import('@/lib/export/roster-pdf');
      const ordered = groupRoster(roster).flatMap((g) => g.entries);
      const blob = await buildRosterPdf({
        teamName: team.name,
        ownerName: team.owner?.full_name ?? null,
        icon1: team.icon1?.full_name ?? null,
        icon2: team.icon2?.full_name ?? null,
        logoUrl: publicUrl('team-logos', team.logo_path),
        primaryColor: team.primary_color,
        currencySymbol: t.currency_symbol,
        tournamentName: t.name,
        players: ordered.map((e) => ({
          name: e.player.full_name,
          primary: e.player.primary_position,
          secondary: e.player.secondary_position,
          jersey: e.player.jersey_number,
          price: e.source === 'icon' ? 'Icon' : `${formatMoney(e.price, t.currency_symbol)}${e.source === 'manual' ? ' (Adjusted)' : ''}`,
        })),
        finance: finance
          ? {
              purseTotal: finance.purse_total,
              spent: finance.purse_spent,
              remaining: finance.purse_remaining ?? 0,
              purchased: finance.purchased_count ?? 0,
              squad: finance.squad_count ?? 0,
            }
          : null,
        exportedAt: formatInTournamentTz(new Date(), 'd MMM yyyy, h:mm a', t.timezone),
      });
      const slug = team.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
      downloadBlob(blob, `${slug}-roster-${todayStamp()}.pdf`);
    } catch {
      toast.error('Could not create the PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="secondary" onClick={exportPdf} loading={busy}>
      {!busy && <FileDown className="h-4 w-4" aria-hidden />}
      Download roster PDF
    </Button>
  );
}

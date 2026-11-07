import { downloadBlob, downloadCsv, neutralizeFormula, todayStamp } from '@/lib/export/csv';
import { formatInTournamentTz } from '@/lib/format';
import type { HistoryRow } from '@/lib/queries/auction';

export const AUCTION_EXPORT_HEADERS = [
  'purchase_order',
  'player',
  'primary_position',
  'secondary_position',
  'team',
  'price',
  'base_price',
  'round',
  'lot_number',
  'status',
  'time',
];

export function auctionExportRows(rows: HistoryRow[], teamName: (id: string | null) => string, tz: string): (string | number)[][] {
  const sorted = [...rows].sort((a, b) => {
    if (a.purchase_order !== null && b.purchase_order !== null) return a.purchase_order - b.purchase_order;
    if (a.purchase_order !== null) return -1;
    if (b.purchase_order !== null) return 1;
    return (a.lot_number ?? 0) - (b.lot_number ?? 0);
  });
  return sorted.map((r) => [
    r.purchase_order ?? '',
    r.player_name,
    r.primary_position ?? '',
    r.secondary_position ?? '',
    r.team_id ? teamName(r.team_id) : '',
    r.kind === 'sold' ? (r.price ?? '') : '',
    r.base_price ?? '',
    r.round ?? '',
    r.lot_number ?? '',
    r.status,
    formatInTournamentTz(r.at, 'yyyy-MM-dd HH:mm', tz),
  ]);
}

export function auctionExportName(slug: string, ext: 'csv' | 'xlsx'): string {
  return `${slug}-auction-history-${todayStamp()}.${ext}`;
}

export function exportAuctionCsv(rows: HistoryRow[], teamName: (id: string | null) => string, tz: string, slug: string): void {
  downloadCsv(auctionExportName(slug, 'csv'), AUCTION_EXPORT_HEADERS, auctionExportRows(rows, teamName, tz));
}

/** Excel export; exceljs is loaded only when the button is pressed (11.7). */
export async function exportAuctionXlsx(rows: HistoryRow[], teamName: (id: string | null) => string, tz: string, slug: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Auction history');
  ws.addRow(AUCTION_EXPORT_HEADERS);
  ws.getRow(1).font = { bold: true };
  for (const r of auctionExportRows(rows, teamName, tz)) {
    ws.addRow(r.map((v) => (typeof v === 'number' ? v : neutralizeFormula(v))));
  }
  ws.columns.forEach((c) => {
    c.width = 16;
  });
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), auctionExportName(slug, 'xlsx'));
}

/**
 * Team roster PDF (6.6), generated in the browser with jsPDF + jspdf-autotable (loaded on demand).
 * Standard PDF fonts only cover Latin-1, so names in other scripts use bundled Noto fonts, chosen per string.
 */
import { formatMoney, POSITION_LABELS } from '@/lib/format';
import { readableTextOn } from '@/lib/color';

export type PdfFont = 'helvetica' | 'NotoSans' | 'NotoSansDevanagari';

const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/;
// Printable ASCII plus Latin-1 Supplement: drawable with the standard Helvetica (WinAnsi) font.
const LATIN1_ONLY = /^[ -~ -ÿ\s]*$/;

/** Pure: which font draws this string without placeholder glyphs. */
export function pickFont(text: string | null | undefined): PdfFont {
  const s = text ?? '';
  if (DEVANAGARI.test(s)) return 'NotoSansDevanagari';
  if (LATIN1_ONLY.test(s)) return 'helvetica';
  return 'NotoSans';
}

const FONT_FILES: Record<Exclude<PdfFont, 'helvetica'>, { normal: string; bold: string }> = {
  NotoSans: { normal: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf' },
  NotoSansDevanagari: { normal: 'NotoSansDevanagari-Regular.ttf', bold: 'NotoSansDevanagari-Bold.ttf' },
};

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export interface RosterPdfPlayer {
  name: string;
  primary: string;
  secondary: string | null;
  jersey: number | null;
  price: string; // already formatted ("Icon", "₹1,200", "₹900 (Adjusted)")
}

export interface RosterPdfInput {
  teamName: string;
  ownerName: string | null;
  icon1: string | null;
  icon2: string | null;
  logoUrl: string | null;
  primaryColor: string;
  currencySymbol: string;
  players: RosterPdfPlayer[];
  finance: { purseTotal: number; spent: number; remaining: number; purchased: number; squad: number } | null;
  exportedAt: string; // formatted in the tournament time zone
  tournamentName: string;
}

async function imageToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    // Re-encode to PNG on a canvas: jsPDF does not read WebP.
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    const side = 256;
    const scale = Math.min(side / bitmap.width, side / bitmap.height, 1);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1] as string, 16) : 0xf97316;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Every string drawn in the PDF, used to decide which fonts must be loaded. */
export function collectStrings(input: RosterPdfInput): string[] {
  return [
    input.teamName,
    input.ownerName ?? '',
    input.icon1 ?? '',
    input.icon2 ?? '',
    input.tournamentName,
    input.currencySymbol,
    ...input.players.flatMap((p) => [p.name, p.price]),
  ];
}

export async function buildRosterPdf(input: RosterPdfInput): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // Lazily load only the fonts this roster needs.
  const needed = new Set(collectStrings(input).map(pickFont));
  const loaded = new Set<PdfFont>(['helvetica']);
  for (const font of ['NotoSans', 'NotoSansDevanagari'] as const) {
    if (!needed.has(font)) continue;
    try {
      for (const style of ['normal', 'bold'] as const) {
        const file = FONT_FILES[font][style];
        const res = await fetch(`/fonts/${file}`);
        if (!res.ok) throw new Error(`font ${file}`);
        doc.addFileToVFS(file, toBase64(await res.arrayBuffer()));
        doc.addFont(file, font, style);
      }
      loaded.add(font);
    } catch {
      // Without the font the text still exports with the standard font.
    }
  }
  const fontFor = (text: string): PdfFont => {
    const f = pickFont(text);
    return loaded.has(f) ? f : loaded.has('NotoSans') && f !== 'helvetica' ? 'NotoSans' : 'helvetica';
  };
  const text = (s: string, x: number, y: number, size: number, bold = false, color: [number, number, number] = [20, 20, 20]) => {
    doc.setFont(fontFor(s), bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(s, x, y);
  };

  const pageW = doc.internal.pageSize.getWidth();
  const [r, g, b] = hexToRgb(input.primaryColor);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageW, 8, 'F');

  let x = 40;
  if (input.logoUrl) {
    const data = await imageToDataUrl(input.logoUrl);
    if (data) {
      try {
        doc.addImage(data, 'PNG', 40, 30, 72, 72);
        x = 128;
      } catch {
        // continue without the logo
      }
    }
  }
  text(input.tournamentName.toUpperCase(), x, 44, 9, false, [110, 110, 110]);
  text(input.teamName, x, 70, 24, true);
  text(`Owner: ${input.ownerName ?? 'To be announced'}`, x, 90, 11);
  text(`Icon Player 1: ${input.icon1 ?? 'To be announced'}`, x, 106, 11);
  text(`Icon Player 2: ${input.icon2 ?? 'To be announced'}`, x, 122, 11);

  const body = input.players.map((p) => [p.name, POSITION_LABELS[p.primary as keyof typeof POSITION_LABELS] ?? p.primary, p.secondary ?? '-', p.jersey === null ? '-' : String(p.jersey), p.price]);
  autoTable(doc, {
    startY: 142,
    head: [['Player', 'Primary', 'Secondary', 'Jersey', 'Price']],
    body,
    theme: 'striped',
    headStyles: { fillColor: [r, g, b], textColor: readableTextOn(input.primaryColor) === '#FFFFFF' ? 255 : 20, font: 'helvetica', fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 6, font: 'helvetica' },
    columnStyles: { 3: { halign: 'center' }, 4: { halign: 'right' } },
    didParseCell: (data) => {
      const raw = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.raw ?? '');
      data.cell.styles.font = fontFor(raw);
    },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 160;
  let y = finalY + 28;
  if (input.finance) {
    const m = (n: number) => formatMoney(n, input.currencySymbol);
    text('Financial summary', 40, y, 12, true);
    y += 18;
    const lines = [
      `Initial purse: ${m(input.finance.purseTotal)}`,
      `Total spent: ${m(input.finance.spent)}`,
      `Remaining purse: ${m(input.finance.remaining)}`,
      `Players purchased: ${input.finance.purchased}`,
      `Squad size: ${input.finance.squad}`,
    ];
    for (const l of lines) {
      text(l, 40, y, 10);
      y += 15;
    }
  }
  const pageH = doc.internal.pageSize.getHeight();
  text(`Exported ${input.exportedAt}`, 40, pageH - 24, 8, false, [120, 120, 120]);
  return doc.output('blob');
}

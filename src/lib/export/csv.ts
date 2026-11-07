/** CSV helpers. Formula injection is neutralised (4.5) and files carry a UTF-8 BOM so Excel reads non-Latin names. */
const DANGEROUS = /^[=+\-@\t\r]/;

export function neutralizeFormula(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return DANGEROUS.test(s) ? `'${s}` : s;
}

export function csvCell(value: unknown): string {
  const s = neutralizeFormula(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  downloadBlob(new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename);
}

export function todayStamp(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

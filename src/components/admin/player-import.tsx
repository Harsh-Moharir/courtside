'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableWrap } from '@/components/ui/misc';
import { cn } from '@/components/ui/cn';
import { getBrowserClient } from '@/lib/supabase/browser';
import { rpc } from '@/lib/actions/rpc';
import { downloadCsv, toCsv, downloadBlob } from '@/lib/export/csv';
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  TEMPLATE_EXAMPLE,
  TEMPLATE_HEADERS,
  matchHeader,
  parseCsvText,
  rowsForImport,
  tableFromMatrix,
  validateRows,
  type ParsedTable,
  type ValidatedRow,
} from '@/lib/import/players';

type Stage = 'pick' | 'preview' | 'done';

async function readXlsx(file: File): Promise<ParsedTable> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const matrix: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      // Values only: formulas are never evaluated; a formula cell contributes its cached result.
      const v = cell.value as unknown;
      let out: unknown = v;
      if (v && typeof v === 'object') {
        const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
        if ('result' in o) out = o.result ?? '';
        else if (Array.isArray(o.richText)) out = o.richText.map((r) => r.text).join('');
        else if ('text' in o) out = o.text;
        else if (v instanceof Date) out = v.toISOString().slice(0, 10);
        else out = '';
      }
      cells[col - 1] = out;
    });
    matrix[rowNumber - 1] = cells;
  });
  return tableFromMatrix(matrix.filter((r) => r !== undefined));
}

export function PlayerImport() {
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [validated, setValidated] = useState<ValidatedRow[]>([]);
  const [includeDup, setIncludeDup] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [serverErrors, setServerErrors] = useState<{ row: number; reason: string }[]>([]);
  const [result, setResult] = useState<{ inserted: number; skipped: ValidatedRow[] } | null>(null);
  const [existing, setExisting] = useState<string[]>([]);
  const [defaultBase, setDefaultBase] = useState(100);

  useEffect(() => {
    const supabase = getBrowserClient();
    void supabase
      .from('auction_settings')
      .select('default_base_price')
      .maybeSingle()
      .then(({ data }) => data && setDefaultBase(data.default_base_price));
  }, []);

  async function loadExisting(): Promise<string[]> {
    const { data } = await getBrowserClient().from('players').select('full_name').limit(5000);
    const names = (data ?? []).map((p) => p.full_name.toLowerCase());
    setExisting(names);
    return names;
  }

  async function handleFile(file: File) {
    setFileError(null);
    setServerErrors([]);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx')) {
      setFileError('Choose a .csv or .xlsx file.');
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setFileError('The file is larger than 2 MB. Split it into smaller files.');
      return;
    }
    setParsing(true);
    try {
      const parsed = lower.endsWith('.csv') ? parseCsvText(await file.text()) : await readXlsx(file);
      if (parsed.rows.length === 0) {
        setFileError('No data rows found. The first row must be the header.');
        return;
      }
      if (parsed.rows.length > IMPORT_MAX_ROWS) {
        setFileError(`The file has ${parsed.rows.length} rows; the limit is ${IMPORT_MAX_ROWS}.`);
        return;
      }
      if (!parsed.headers.some((h) => matchHeader(h) === 'full_name')) {
        setFileError('No name column found. Use a header such as "full_name" or "Name". Download the template to see the format.');
        return;
      }
      const names = await loadExisting();
      setFileName(file.name);
      setTable(parsed);
      setValidated(validateRows(parsed.rows, names, { defaultBasePrice: defaultBase }));
      setStage('preview');
    } catch {
      setFileError('This file could not be read. Save it again as CSV (UTF-8) or .xlsx and retry.');
    } finally {
      setParsing(false);
    }
  }

  const counts = useMemo(
    () => ({
      ok: validated.filter((r) => r.status === 'ok').length,
      warning: validated.filter((r) => r.status === 'warning').length,
      error: validated.filter((r) => r.status === 'error').length,
    }),
    [validated],
  );
  const toImport = useMemo(() => rowsForImport(validated, includeDup), [validated, includeDup]);
  const unmatchedHeaders = (table?.headers ?? []).filter((h) => h.trim() && !matchHeader(h));

  async function runImport() {
    if (toImport.length === 0) return;
    setImporting(true);
    setServerErrors([]);
    const r = await rpc<{ inserted: number }>('import_players', { p_rows: toImport });
    setImporting(false);
    if (!r.ok) {
      const rows = Array.isArray(r.detail?.rows) ? (r.detail?.rows as { row: number; reason: string }[]) : [];
      setServerErrors(rows);
      toast.error(rows.length ? `Nothing was imported. ${rows.length} row(s) were rejected by the server.` : r.message);
      return;
    }
    const importedNumbers = new Set(toImport.map((x) => x.row_number));
    setResult({ inserted: r.data.inserted, skipped: validated.filter((v) => !importedNumbers.has(v.rowNumber)) });
    setStage('done');
    toast.success(`${r.data.inserted} player(s) imported`);
  }

  function downloadSkipped() {
    if (!result || !table) return;
    const headers = [...table.headers, 'import_status', 'reason'];
    const rows = result.skipped.map((v) => [...table.headers.map((h) => v.raw[h] ?? ''), v.status === 'error' ? 'Error' : 'Skipped duplicate', v.reasons.join('; ')]);
    downloadCsv('players-skipped.csv', headers, rows);
  }

  function reset() {
    setStage('pick');
    setTable(null);
    setValidated([]);
    setResult(null);
    setServerErrors([]);
    setIncludeDup(false);
    setFileName('');
  }

  return (
    <div>
      <Link href="/admin/players" className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Players
      </Link>
      <PageHeader
        title="Import players"
        subtitle="CSV or Excel (.xlsx), up to 2 MB and 1,000 rows. Photos are added afterwards on the Players page."
        action={
          <Button
            variant="secondary"
            onClick={() => downloadBlob(new Blob([toCsv(TEMPLATE_HEADERS, TEMPLATE_EXAMPLE)], { type: 'text/csv;charset=utf-8' }), 'players-template.csv')}
          >
            <Download className="h-4 w-4" aria-hidden /> Template CSV
          </Button>
        }
      />

      {stage === 'pick' && (
        <Card className="p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-4 py-14 text-center transition',
              dragging ? 'border-accent bg-accent/5' : 'border-border',
            )}
          >
            <FileSpreadsheet className="h-10 w-10 text-accent" aria-hidden />
            <p className="font-display text-2xl font-bold uppercase">Drop a .csv or .xlsx file here</p>
            <p className="text-sm text-muted">or</p>
            <input
              ref={input}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label="Choose a file to import"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void handleFile(f);
              }}
            />
            <Button onClick={() => input.current?.click()} loading={parsing}>
              Choose file
            </Button>
            {fileError && (
              <p role="alert" className="text-sm text-red-300">
                {fileError}
              </p>
            )}
          </div>
          <div className="mt-5 grid gap-2 text-sm text-muted sm:grid-cols-2">
            <p>
              <strong className="text-fg">Columns:</strong> full_name (or Name, Player), primary_position (Position, Pos), secondary_position (Secondary, Pos2), age,
              height (cm or feet/inches like 5&apos;10&quot;), jersey_number (Jersey, Number, No), description, base_price (Base, Price).
            </p>
            <p>
              Positions accept codes (PG, SG, SF, PF, C) or names (Point Guard). An empty base price uses the default. Formulas are never evaluated; only cell values are read.
            </p>
          </div>
        </Card>
      )}

      {stage === 'preview' && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <span className="font-semibold">{fileName}</span>
            <Badge className="border-success/50 text-green-300">{counts.ok} OK</Badge>
            <Badge className="border-warning/50 text-yellow-200">{counts.warning} warnings</Badge>
            <Badge className="border-danger/50 text-red-300">{counts.error} errors</Badge>
            <label className="ml-auto flex min-h-[44px] items-center gap-2 text-sm">
              <input type="checkbox" checked={includeDup} onChange={(e) => setIncludeDup(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Import duplicates anyway
            </label>
            <Button variant="secondary" onClick={reset}>
              Choose another file
            </Button>
            <Button onClick={() => void runImport()} loading={importing} disabled={toImport.length === 0}>
              Import {toImport.length} player(s)
            </Button>
          </Card>
          {unmatchedHeaders.length > 0 && (
            <p className="text-sm text-muted">Ignored columns: {unmatchedHeaders.join(', ')}</p>
          )}
          {serverErrors.length > 0 && (
            <div role="alert" className="rounded-btn border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
              Nothing was imported. Rejected rows: {serverErrors.map((e) => `row ${e.row} (${e.reason})`).join(', ')}.
            </div>
          )}
          <TableWrap>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Age</th>
                  <th className="px-3 py-2">Height</th>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Base</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {validated.map((v) => {
                  const willImport = v.status === 'ok' || (v.status === 'warning' && includeDup);
                  return (
                    <tr key={v.rowNumber} className={cn(v.status === 'error' && 'bg-danger/5', !willImport && 'text-muted')}>
                      <td className="px-3 py-2 tabular">{v.rowNumber + 1}</td>
                      <td className="px-3 py-2">
                        {v.status === 'ok' && (
                          <span className="inline-flex items-center gap-1 text-green-300">
                            <CheckCircle2 className="h-4 w-4" aria-hidden /> OK
                          </span>
                        )}
                        {v.status === 'warning' && (
                          <span className="inline-flex items-center gap-1 text-yellow-200">
                            <AlertTriangle className="h-4 w-4" aria-hidden /> Warning
                          </span>
                        )}
                        {v.status === 'error' && (
                          <span className="inline-flex items-center gap-1 text-red-300">
                            <XCircle className="h-4 w-4" aria-hidden /> Error
                          </span>
                        )}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2" title={v.value?.full_name}>
                        {v.value?.full_name ?? String(Object.entries(v.raw).find(([k]) => matchHeader(k) === 'full_name')?.[1] ?? '')}
                      </td>
                      <td className="px-3 py-2">
                        {v.value ? `${v.value.primary_position}${v.value.secondary_position ? ` / ${v.value.secondary_position}` : ''}` : ''}
                      </td>
                      <td className="px-3 py-2 tabular">{v.value?.age ?? ''}</td>
                      <td className="px-3 py-2 tabular">{v.value?.height_cm ? `${v.value.height_cm} cm` : ''}</td>
                      <td className="px-3 py-2 tabular">{v.value?.jersey_number ?? ''}</td>
                      <td className="px-3 py-2 tabular">{v.value?.base_price ?? ''}</td>
                      <td className="px-3 py-2 text-xs">{v.reasons.join('; ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          <p className="text-xs text-muted">{existing.length} players already in the database were checked for duplicates. Row numbers match the spreadsheet (header is row 1).</p>
        </div>
      )}

      {stage === 'done' && result && (
        <Card className="p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <p className="mt-2 font-display text-4xl font-extrabold">{result.inserted} imported</p>
          <p className="text-muted">{result.skipped.length} row(s) skipped</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {result.skipped.length > 0 && (
              <Button variant="secondary" onClick={downloadSkipped}>
                <Download className="h-4 w-4" aria-hidden /> Download skipped rows (CSV)
              </Button>
            )}
            <Button variant="secondary" onClick={reset}>
              Import another file
            </Button>
            <Link href="/admin/players" className="inline-flex min-h-[44px] items-center rounded-btn bg-accent px-4 text-sm font-semibold text-accent-contrast">
              Go to players
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

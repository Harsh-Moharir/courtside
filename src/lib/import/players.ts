/**
 * Pure player-import parsing and validation (6.5). No DOM access, so it is unit-testable.
 * The same zod schema is used by the admin player form.
 */
import Papa from 'papaparse';
import { z } from 'zod';

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 1000;

export const POSITION_CODES = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type PositionCode = (typeof POSITION_CODES)[number];

export type CanonicalField =
  | 'full_name'
  | 'primary_position'
  | 'secondary_position'
  | 'age'
  | 'height_cm'
  | 'jersey_number'
  | 'description'
  | 'base_price';

const ALIASES: Record<CanonicalField, string[]> = {
  full_name: ['fullname', 'name', 'player', 'playername'],
  primary_position: ['primaryposition', 'position', 'pos'],
  secondary_position: ['secondaryposition', 'secondary', 'pos2'],
  age: ['age'],
  height_cm: ['height', 'heightcm'],
  jersey_number: ['jerseynumber', 'jersey', 'number', 'no'],
  description: ['description'],
  base_price: ['baseprice', 'base', 'price'],
};

function normHeader(h: string): string {
  return h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.]+/g, '');
}

/** Maps a raw header cell to a canonical field (case-insensitive, spaces/underscores ignored). */
export function matchHeader(raw: string): CanonicalField | null {
  const n = normHeader(raw);
  if (!n) return null;
  for (const [field, aliases] of Object.entries(ALIASES) as [CanonicalField, string[]][]) {
    if (aliases.includes(n)) return field;
  }
  return null;
}

const FULL_NAMES: Record<string, PositionCode> = {
  pointguard: 'PG',
  shootingguard: 'SG',
  smallforward: 'SF',
  powerforward: 'PF',
  center: 'C',
  centre: 'C',
};

/** Accepts a code (`PG`) or a full name (`Point Guard`), any case. Returns null when empty, undefined when invalid. */
export function parsePosition(raw: unknown): PositionCode | null | undefined {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if ((POSITION_CODES as readonly string[]).includes(up)) return up as PositionCode;
  const n = s.toLowerCase().replace(/[\s_\-.]+/g, '');
  return FULL_NAMES[n] ?? undefined;
}

/**
 * Height in cm from `178`, `178 cm`, `5'10"`, `5' 10`, `5 ft 10 in`, `5ft10`, `6 ft`.
 * Returns null when empty, undefined when unparseable.
 */
export function parseHeight(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const cm = /^(\d{2,3}(?:\.\d+)?)\s*(cm)?$/.exec(s);
  if (cm) return Math.round(Number(cm[1]));
  const ftin = /^(\d)\s*(?:'|ft|feet|foot)\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|''|in|inch|inches)?)?$/.exec(s);
  if (ftin) {
    const ft = Number(ftin[1]);
    const inch = ftin[2] ? Number(ftin[2]) : 0;
    if (inch >= 12) return undefined;
    return Math.round((ft * 12 + inch) * 2.54);
  }
  return undefined;
}

/** Trim and collapse internal whitespace (6.7 item 4). */
export function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

const optInt = (min: number, max: number, label: string) =>
  z
    .number({ error: `${label} must be a whole number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be ${min} to ${max}`)
    .max(max, `${label} must be ${min} to ${max}`)
    .nullable();

/** Shared by the add/edit form and the importer. */
export const playerSchema = z
  .object({
    full_name: z
      .string()
      .transform(cleanName)
      .pipe(z.string().min(1, 'Name is required').max(80, 'Name must be at most 80 characters')),
    primary_position: z.enum(POSITION_CODES, { error: 'Primary position is required' }),
    secondary_position: z.enum(POSITION_CODES).nullable(),
    age: optInt(10, 70, 'Age'),
    height_cm: optInt(120, 250, 'Height (cm)'),
    jersey_number: optInt(0, 99, 'Jersey number'),
    description: z
      .string()
      .max(280, 'Description must be at most 280 characters')
      .nullable()
      .transform((v) => (v && v.trim() ? v.trim() : null)),
    base_price: z.number({ error: 'Base price must be a number' }).int('Base price must be a whole number').min(1, 'Base price must be at least 1'),
  })
  .refine((v) => v.secondary_position === null || v.secondary_position !== v.primary_position, {
    path: ['secondary_position'],
    message: 'Secondary position must differ from the primary position',
  });

export type PlayerInput = z.infer<typeof playerSchema>;

export type RawRow = Record<string, unknown>;

export interface ParsedTable {
  headers: string[];
  rows: RawRow[];
}

/** CSV text (UTF-8, BOM tolerated) to header/rows. */
export function parseCsvText(text: string): ParsedTable {
  const clean = text.replace(/^﻿/, '');
  const res = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy' });
  const data = res.data as unknown[][];
  const headerRow = (data[0] ?? []).map((h) => String(h ?? ''));
  const rows: RawRow[] = data.slice(1).map((cells) => {
    const r: RawRow = {};
    headerRow.forEach((h, i) => {
      r[h] = cells[i] ?? '';
    });
    return r;
  });
  return { headers: headerRow, rows };
}

/** Values-only matrix (header row first), e.g. from an xlsx sheet, to header/rows. */
export function tableFromMatrix(matrix: unknown[][]): ParsedTable {
  const headers = (matrix[0] ?? []).map((h) => String(h ?? ''));
  const rows = matrix
    .slice(1)
    .filter((cells) => cells.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
    .map((cells) => {
      const r: RawRow = {};
      headers.forEach((h, i) => {
        r[h] = cells[i] ?? '';
      });
      return r;
    });
  return { headers, rows };
}

export type RowStatus = 'ok' | 'warning' | 'error';

export interface ValidatedRow {
  /** 1-based data row number (header excluded); the spreadsheet row is rowNumber + 1. */
  rowNumber: number;
  raw: RawRow;
  status: RowStatus;
  reasons: string[];
  value: PlayerInput | null;
}

function emptyToNull(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}

function toNumberOrRaw(v: unknown): unknown {
  const e = emptyToNull(v);
  if (e === null) return null;
  if (typeof e === 'number') return e;
  const s = String(e).replace(/[,\s₹$]/g, '');
  const n = Number(s);
  return Number.isFinite(n) && s !== '' ? n : NaN;
}

export interface ValidateOptions {
  defaultBasePrice: number;
}

/**
 * Validates every row. Duplicates (by lower(full_name), within the file or against `existingNamesLower`)
 * are warnings; invalid values are errors.
 */
export function validateRows(rows: RawRow[], existingNamesLower: Iterable<string>, opts: ValidateOptions = { defaultBasePrice: 100 }): ValidatedRow[] {
  const existing = new Set(Array.from(existingNamesLower, (n) => n.toLowerCase()));
  const seen = new Map<string, number>();
  return rows.map((raw, idx) => {
    const mapped: Partial<Record<CanonicalField, unknown>> = {};
    for (const [k, v] of Object.entries(raw)) {
      const f = matchHeader(k);
      if (f && mapped[f] === undefined) mapped[f] = v;
    }
    const reasons: string[] = [];
    const pp = parsePosition(mapped.primary_position);
    const sp = parsePosition(mapped.secondary_position);
    const h = parseHeight(mapped.height_cm);
    if (pp === undefined) reasons.push(`Unknown primary position "${String(mapped.primary_position)}"`);
    if (sp === undefined) reasons.push(`Unknown secondary position "${String(mapped.secondary_position)}"`);
    if (h === undefined) reasons.push(`Unreadable height "${String(mapped.height_cm)}"`);
    const base = toNumberOrRaw(mapped.base_price);
    const candidate = {
      full_name: String(emptyToNull(mapped.full_name) ?? ''),
      primary_position: pp ?? undefined,
      secondary_position: sp ?? null,
      age: toNumberOrRaw(mapped.age),
      height_cm: h ?? null,
      jersey_number: toNumberOrRaw(mapped.jersey_number),
      description: (emptyToNull(mapped.description) as string | null) === null ? null : String(mapped.description),
      base_price: base === null ? opts.defaultBasePrice : base,
    };
    const parsed = playerSchema.safeParse(candidate);
    let value: PlayerInput | null = null;
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (!reasons.includes(issue.message)) reasons.push(issue.message);
      }
    } else if (reasons.length === 0) {
      value = parsed.data;
    }
    if (reasons.length > 0) return { rowNumber: idx + 1, raw, status: 'error' as const, reasons, value: null };
    const key = (value as PlayerInput).full_name.toLowerCase();
    const warnings: string[] = [];
    if (existing.has(key)) warnings.push('A player with this name already exists');
    const firstSeen = seen.get(key);
    if (firstSeen !== undefined) warnings.push(`Duplicate of row ${firstSeen} in this file`);
    else seen.set(key, idx + 1);
    return { rowNumber: idx + 1, raw, status: warnings.length ? ('warning' as const) : ('ok' as const), reasons: warnings, value };
  });
}

/** Rows to send to import_players (errors never; warnings only when includeDuplicates). */
export function rowsForImport(validated: ValidatedRow[], includeDuplicates: boolean) {
  return validated
    .filter((r) => r.value && (r.status === 'ok' || (r.status === 'warning' && includeDuplicates)))
    .map((r) => ({ row_number: r.rowNumber, ...(r.value as PlayerInput) }));
}

export const TEMPLATE_HEADERS = ['full_name', 'primary_position', 'secondary_position', 'age', 'height', 'jersey_number', 'description', 'base_price'];
export const TEMPLATE_EXAMPLE = [
  ['Aman Verma', 'PG', 'SG', '24', '182', '7', 'Quick guard', '100'],
  ['Rahul Sharma', 'Center', '', '', "6'9\"", '', '', ''],
];

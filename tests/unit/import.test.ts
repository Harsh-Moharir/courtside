import { describe, expect, it } from 'vitest';
import { matchHeader, parseCsvText, parseHeight, parsePosition, rowsForImport, tableFromMatrix, validateRows, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '@/lib/import/players';

describe('player import (6.5)', () => {
  it('matches headers case-insensitively with aliases, ignoring spaces and underscores', () => {
    expect(matchHeader('Player Name')).toBe('full_name');
    expect(matchHeader('NAME')).toBe('full_name');
    expect(matchHeader('pos')).toBe('primary_position');
    expect(matchHeader('Secondary')).toBe('secondary_position');
    expect(matchHeader('Height_CM')).toBe('height_cm');
    expect(matchHeader('No')).toBe('jersey_number');
    expect(matchHeader('Base')).toBe('base_price');
    expect(matchHeader('favourite colour')).toBeNull();
  });
  it('parses positions by code or full name in any case', () => {
    expect(parsePosition('pg')).toBe('PG');
    expect(parsePosition('Point Guard')).toBe('PG');
    expect(parsePosition('CENTER')).toBe('C');
    expect(parsePosition('')).toBeNull();
    expect(parsePosition('Goalkeeper')).toBeUndefined();
  });
  it('parses heights in cm and feet/inches', () => {
    expect(parseHeight('178')).toBe(178);
    expect(parseHeight('178 cm')).toBe(178);
    expect(parseHeight(`5'10"`)).toBe(178);
    expect(parseHeight('5 ft 10 in')).toBe(178);
    expect(parseHeight('')).toBeNull();
    expect(parseHeight('tall')).toBeUndefined();
  });
  it('strips a UTF-8 BOM and reads alias headers', () => {
    const t = parseCsvText('﻿Player Name,Position,Height\nआदित्य कुलकर्णी,Center,6\'2"\n');
    expect(t.headers[0]).toBe('Player Name');
    const v = validateRows(t.rows, []);
    expect(v[0]).toMatchObject({ status: 'ok' });
    expect(v[0]!.value).toMatchObject({ full_name: 'आदित्य कुलकर्णी', primary_position: 'C', height_cm: 188, base_price: 100 });
  });
  it('flags duplicates as warnings and invalid rows as errors', () => {
    const t = parseCsvText('name,pos,base\nAman Verma,PG,200\naman verma,SG,\nRahul,XX,100\nKaran,SF,-5\nExisting Guy,C,100\n');
    const v = validateRows(t.rows, ['existing guy'], { defaultBasePrice: 150 });
    expect(v.map((r) => r.status)).toEqual(['ok', 'warning', 'error', 'error', 'warning']);
    expect(v[1]!.value?.base_price).toBe(150);
    expect(rowsForImport(v, false)).toHaveLength(1);
    expect(rowsForImport(v, true)).toHaveLength(3);
    expect(rowsForImport(v, true)[0]).toMatchObject({ row_number: 1, full_name: 'Aman Verma' });
  });
  it('rejects the same primary and secondary position', () => {
    const v = validateRows([{ name: 'Dev', pos: 'PG', secondary: 'Point Guard' }], []);
    expect(v[0]!.status).toBe('error');
  });
  it('reads xlsx-style value matrices (formulas are never evaluated, cells are values) and skips blank rows', () => {
    const t = tableFromMatrix([
      ['Full Name', 'Primary Position'],
      ['=HYPERLINK("x")', 'PG'],
      [null, ''],
      ['Zubin Menon', 'pf'],
    ]);
    expect(t.rows).toHaveLength(2);
    const v = validateRows(t.rows, []);
    expect(v[0]!.value?.full_name).toBe('=HYPERLINK("x")');
    expect(v[1]!.value?.primary_position).toBe('PF');
  });
  it('limits are 2 MB and 1,000 rows', () => {
    expect(IMPORT_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(IMPORT_MAX_ROWS).toBe(1000);
  });
});

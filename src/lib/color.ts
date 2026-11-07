import type { CSSProperties } from 'react';

/** WCAG 2.x colour helpers (11.2). */
const BG = '#0A0A0A';

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever contrasts more with the background colour. */
export function readableTextOn(hex: string): '#FFFFFF' | '#0A0A0A' {
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#0A0A0A') ? '#FFFFFF' : '#0A0A0A';
}

/** Returns hex if it has >= 3:1 contrast on the page background, else lightens it in 5% steps until it does. */
export function visibleOnDark(hex: string, bg: string = BG): string {
  let rgb = hexToRgb(hex);
  let out = rgbToHex(rgb);
  for (let i = 0; i < 20 && contrastRatio(out, bg) < 3; i++) {
    rgb = rgb.map((v) => v + (255 - v) * 0.05) as [number, number, number];
    out = rgbToHex(rgb);
  }
  return out;
}

export function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

/** CSS variables for a team wrapper (--team-primary, --team-secondary, --team-on-primary, --team-visible). */
export function teamStyle(primary?: string | null, secondary?: string | null): CSSProperties {
  const p = primary && isValidHex(primary) ? primary : '#F97316';
  const s = secondary && isValidHex(secondary) ? secondary : '#111111';
  return {
    ['--team-primary' as string]: p,
    ['--team-secondary' as string]: s,
    ['--team-on-primary' as string]: readableTextOn(p),
    ['--team-visible' as string]: visibleOnDark(p),
  } as CSSProperties;
}

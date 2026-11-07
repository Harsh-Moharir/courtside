'use client';
import { TeamIdentity } from '@/components/team/team-identity';
import { contrastRatio, isValidHex, teamStyle } from '@/lib/color';
import type { TeamWithIdentity } from '@/lib/queries/teams';

function mixWithBlack(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - amount) + 10 * amount));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Darkens the team colour until white text on it reaches 4.5:1 (11.2). Returns null when that is not
 * possible within the allowed range, in which case the header falls back to the surface plus an accent bar.
 */
export function headerTint(primary: string): string | null {
  if (!isValidHex(primary)) return null;
  for (let a = 0.35; a <= 0.8; a += 0.05) {
    const c = mixWithBlack(primary, a);
    if (contrastRatio(c, '#FFFFFF') >= 4.5) return c;
  }
  return null;
}

export function TeamHeader({ team, children }: { team: TeamWithIdentity; children?: React.ReactNode }) {
  const tint = headerTint(team.primary_color);
  return (
    <section
      style={{
        ...teamStyle(team.primary_color, team.secondary_color),
        background: tint ? `linear-gradient(180deg, ${tint} 0%, ${tint} 35%, var(--surface) 100%)` : 'var(--surface)',
      }}
      className="relative overflow-hidden rounded-card border border-border px-4 pb-8 pt-10 sm:px-8"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-2 bg-[var(--team-primary)]" />
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-[var(--team-secondary)] opacity-70" />
      <TeamIdentity team={team} size="page" />
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </section>
  );
}

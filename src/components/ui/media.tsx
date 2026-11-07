'use client';
import { useState } from 'react';
import { publicUrl } from '@/lib/storage';
import { initials } from '@/lib/format';
import { readableTextOn } from '@/lib/color';
import { cn } from './cn';

/** Team logo with a coloured-initials fallback; a failed load swaps to the fallback (12.1 item 7). */
export function TeamLogo({
  logoPath,
  name,
  shortName,
  color,
  size = 48,
  className,
}: {
  logoPath?: string | null;
  name: string;
  shortName?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = publicUrl('team-logos', logoPath);
  const bg = color ?? '#F97316';
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={`${name} logo`}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-full object-contain', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={`${name} logo`}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold', className)}
      style={{ width: size, height: size, background: bg, color: readableTextOn(bg), fontSize: Math.max(10, size * 0.32) }}
    >
      {(shortName ?? initials(name)).slice(0, 4)}
    </span>
  );
}

/** Player photo with an initials placeholder on a neutral background. */
export function PlayerAvatar({
  photoPath,
  name,
  size = 48,
  icon = false,
  className,
  rounded = 'full',
}: {
  photoPath?: string | null;
  name: string;
  size?: number;
  icon?: boolean;
  className?: string;
  rounded?: 'full' | 'card';
}) {
  const [failed, setFailed] = useState(false);
  const url = publicUrl('player-photos', photoPath);
  const ring = icon ? 'ring-[3px] ring-gold ring-offset-2 ring-offset-bg' : '';
  const radius = rounded === 'full' ? 'rounded-full' : 'rounded-card';
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('shrink-0 bg-surface-2 object-cover', radius, ring, className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={cn('inline-flex shrink-0 items-center justify-center bg-[#2a2a2a] font-display font-bold text-[#d4d4d4]', radius, ring, className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

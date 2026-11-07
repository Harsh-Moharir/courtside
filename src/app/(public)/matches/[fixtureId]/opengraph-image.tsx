import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { fetchMatchBundle, isUuid, type MatchTeam } from '@/lib/queries/matches';
import { readableTextOn } from '@/lib/color';
import { publicUrl } from '@/lib/storage';

export const alt = 'Match scoreboard';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function Logo({ team }: { team: MatchTeam | null }) {
  const color = team?.primary_color ?? '#2A2A2A';
  // Satori cannot decode WebP, so only PNG/JPEG logos are drawn; others use the coloured initials badge.
  const url = team?.logo_path && /\.(png|jpe?g)$/i.test(team.logo_path) ? publicUrl('team-logos', team.logo_path) : null;
  if (url) {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img src={url} width={200} height={200} style={{ borderRadius: 100, objectFit: 'contain' }} />;
  }
  return (
    <div
      style={{
        width: 200,
        height: 200,
        borderRadius: 100,
        background: color,
        color: readableTextOn(color),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 72,
        fontWeight: 800,
      }}
    >
      {team?.short_name ?? 'TBD'}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', {
    auth: { persistSession: false },
  });
  const b = isUuid(fixtureId) ? await fetchMatchBundle(supabase, fixtureId, 1).catch(() => null) : null;
  const f = b?.fixture;
  const score = b?.result ?? b?.state ?? null;
  const status = f?.status === 'completed' ? 'FINAL' : f?.status === 'live' ? 'LIVE' : f?.status === 'postponed' ? 'POSTPONED' : 'UPCOMING';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0A0A0A', color: '#fff', padding: 56, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 30, color: '#A3A3A3' }}>
          <span>{f ? `Match ${f.match_number}${b?.playoffLabel ? ` · ${b.playoffLabel}` : ''}` : 'Match'}</span>
          <span style={{ color: status === 'LIVE' ? '#EF4444' : '#F97316', fontWeight: 800 }}>{status}</span>
        </div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 340 }}>
            <Logo team={f?.home ?? null} />
            <div style={{ marginTop: 24, fontSize: 40, fontWeight: 800, textAlign: 'center' }}>{f?.home?.name ?? 'TBD'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 150, fontWeight: 800 }}>
            {score ? `${score.home_score} – ${score.away_score}` : 'VS'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 340 }}>
            <Logo team={f?.away ?? null} />
            <div style={{ marginTop: 24, fontSize: 40, fontWeight: 800, textAlign: 'center' }}>{f?.away?.name ?? 'TBD'}</div>
          </div>
        </div>
        <div style={{ height: 10, background: '#F97316', borderRadius: 5 }} />
      </div>
    ),
    size,
  );
}

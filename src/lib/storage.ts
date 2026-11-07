import { env } from '@/lib/env';

export type Bucket = 'team-logos' | 'player-photos' | 'tournament-assets';

/** The single helper that builds public object URLs (3.2). */
export function publicUrl(bucket: Bucket, path: string | null | undefined): string | null {
  if (!path) return null;
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];

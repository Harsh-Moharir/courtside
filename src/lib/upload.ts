'use client';
import { getBrowserClient } from '@/lib/supabase/browser';
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, type Bucket } from '@/lib/storage';
import { fail, ok, type Result } from '@/lib/result';

/** Downscales an image on a canvas to `maxSide` px and re-encodes it as WebP q0.85 (4.4). */
export async function downscaleImage(file: File, maxSide: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (blob && blob.type === 'image/webp') return blob;
    return file;
  } catch {
    return file;
  }
}

export interface UploadOptions {
  bucket: Bucket;
  tournamentId: string;
  entityId: string;
  file: File;
  maxSide: number;
}

/** Uploads a new image with a fresh random name and returns its storage path. */
export async function uploadImage({ bucket, tournamentId, entityId, file, maxSide }: UploadOptions): Promise<Result<string>> {
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Use a PNG, JPEG or WebP image (SVG is not allowed).', detail: null };
  }
  const blob = await downscaleImage(file, maxSide);
  if (blob.size > MAX_UPLOAD_BYTES) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'The image is larger than 2 MB even after resizing. Choose a smaller image.', detail: null };
  }
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${tournamentId}/${entityId}/${crypto.randomUUID()}.${ext}`;
  try {
    const { error } = await getBrowserClient().storage.from(bucket).upload(path, blob, {
      contentType: blob.type || file.type,
      upsert: false,
      cacheControl: '31536000',
    });
    if (error) return fail(error);
    return ok(path);
  } catch (e) {
    return fail(e);
  }
}

/** Best-effort removal of an old object (never blocks the UI). */
export async function removeObject(bucket: Bucket, path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await getBrowserClient().storage.from(bucket).remove([path]);
  } catch {
    // ignore
  }
}

/**
 * Upload a new image, save its path with `save`, then delete the old object.
 * If saving fails, the new object is deleted so no orphan remains (4.4).
 */
export async function replaceImage(
  opts: UploadOptions & { oldPath: string | null | undefined; save: (path: string) => Promise<Result<unknown>> },
): Promise<Result<string>> {
  const up = await uploadImage(opts);
  if (!up.ok) return up;
  const saved = await opts.save(up.data);
  if (!saved.ok) {
    await removeObject(opts.bucket, up.data);
    return saved;
  }
  if (opts.oldPath && opts.oldPath !== up.data) void removeObject(opts.bucket, opts.oldPath);
  return up;
}

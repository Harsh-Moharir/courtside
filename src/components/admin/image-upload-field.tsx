'use client';
import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { publicUrl, type Bucket } from '@/lib/storage';
import { cn } from '@/components/ui/cn';

/**
 * Image picker showing the current image with Replace and Remove actions. The parent performs the
 * upload (replaceImage) so that the row update and orphan cleanup happen in one place.
 */
export function ImageUploadField({
  label,
  bucket,
  path,
  onPick,
  onRemove,
  busy,
  shape = 'circle',
  hint,
}: {
  label: string;
  bucket: Bucket;
  path: string | null | undefined;
  onPick: (file: File) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  busy?: boolean;
  shape?: 'circle' | 'wide' | 'square';
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  const url = publicUrl(bucket, path);
  const box = shape === 'wide' ? 'h-24 w-48 rounded-btn' : shape === 'square' ? 'h-24 w-24 rounded-btn' : 'h-24 w-24 rounded-full';
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn('flex shrink-0 items-center justify-center overflow-hidden border border-border bg-surface-2', box)}>
          {url && !failed ? (
            <img src={url} alt={`${label} preview`} className="h-full w-full object-contain" onError={() => setFailed(true)} />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={`${label} file`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              setFailed(false);
              if (f) void onPick(f);
            }}
          />
          <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
            {url ? 'Replace' : 'Upload'}
          </Button>
          {url && onRemove && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onRemove()}>
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">{hint ?? 'PNG, JPEG or WebP. Resized in the browser before upload (max 2 MB).'}</p>
    </div>
  );
}

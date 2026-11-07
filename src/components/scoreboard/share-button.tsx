'use client';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** Web Share API with a copy-link fallback (8.11). */
export function ShareButton({ text, path, title, className }: { text: string; path: string; title?: string; className?: string }) {
  async function share() {
    const url = new URL(path, window.location.origin).toString();
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title: title ?? text, text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  }
  return (
    <Button variant="secondary" onClick={share} className={className}>
      <Share2 className="h-4 w-4" aria-hidden /> Share
    </Button>
  );
}

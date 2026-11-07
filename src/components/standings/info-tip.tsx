'use client';
import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/** Small accessible info bubble: hover/focus shows it on desktop, tap toggles it on touch screens. */
export function InfoTip({ text, label = 'More information' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={`${label}: ${text}`}
        aria-expanded={open}
        title={text}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-accent"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-30 mb-1 w-56 -translate-x-1/2 rounded-btn border border-border bg-surface-2 px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-fg shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

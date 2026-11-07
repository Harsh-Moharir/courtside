import { Fragment } from 'react';

const URL_RE = /(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?])/g;

/** Splits text into plain and link segments (pure; unit-testable). */
export function linkifySegments(text: string): { type: 'text' | 'link'; value: string }[] {
  const out: { type: 'text' | 'link'; value: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ type: 'text', value: text.slice(last, i) });
    out.push({ type: 'link', value: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

/** Plain-text announcement body: line breaks preserved, URLs auto-linked, never rendered as HTML (4.5). */
export function AnnouncementBody({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className} style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
      {linkifySegments(text).map((s, i) =>
        s.type === 'link' ? (
          <a key={i} href={s.value} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline underline-offset-2">
            {s.value}
          </a>
        ) : (
          <Fragment key={i}>{s.value}</Fragment>
        ),
      )}
    </p>
  );
}

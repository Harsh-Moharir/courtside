/** RFC 5545 calendar export (7.5): UTC DTSTART with Z, escaped text, 75-octet folding, CRLF line endings. */
export interface IcsEvent {
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  location?: string | null;
  description?: string | null;
}

export function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Folds a content line at 75 octets (UTF-8 aware); continuation lines start with a space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ch;
      curBytes = b;
    } else {
      cur += ch;
      curBytes += b;
    }
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(calName: string, events: IcsEvent[], now: Date = new Date()): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Courtside//Tournament//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEscape(calName)}`];
  for (const e of events) {
    const end = new Date(e.start.getTime() + e.durationMinutes * 60000);
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${icsDate(now)}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsEscape(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

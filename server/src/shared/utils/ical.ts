// iCal (.ics) フォーマット生成ユーティリティ
// RFC 5545 準拠 — Google Calendar / Outlook 対応

export interface ICalEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  dtstart: string;   // ISO 8601 or YYYYMMDD
  dtend: string;
  allDay?: boolean;
  created?: string;
  lastModified?: string;
}

function formatDateTime(iso: string, allDay?: boolean): string {
  if (allDay) {
    // VALUE=DATE format: YYYYMMDD
    return iso.replace(/[-:]/g, '').slice(0, 8);
  }
  // DATETIME format: YYYYMMDDTHHMMSSZ
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// iCal の行は 75 バイト (octet) 以内で折り返す
function foldLine(line: string): string {
  const maxLen = 75;
  if (line.length <= maxLen) return line;
  let result = line.slice(0, maxLen);
  let pos = maxLen;
  while (pos < line.length) {
    result += '\r\n ' + line.slice(pos, pos + maxLen - 1);
    pos += maxLen - 1;
  }
  return result;
}

export function generateICalFeed(calendarName: string, events: ICalEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GMO ONAiR//Studio Calendar//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Tokyo',
    // タイムゾーン定義
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Tokyo',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);

    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateTime(ev.dtstart, true)}`);
      // iCal の終日イベントは翌日を指定 (exclusive end)
      const endDate = new Date(ev.dtend);
      endDate.setDate(endDate.getDate() + 1);
      lines.push(`DTEND;VALUE=DATE:${endDate.toISOString().replace(/[-:]/g, '').slice(0, 8)}`);
    } else {
      lines.push(`DTSTART;TZID=Asia/Tokyo:${formatDateTime(ev.dtstart)}`);
      lines.push(`DTEND;TZID=Asia/Tokyo:${formatDateTime(ev.dtend)}`);
    }

    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.created) lines.push(`CREATED:${formatDateTime(ev.created)}`);
    if (ev.lastModified) lines.push(`LAST-MODIFIED:${formatDateTime(ev.lastModified)}`);

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

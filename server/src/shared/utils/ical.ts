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
  // pg は TIMESTAMP (無time zone) 列を JS Date オブジェクトとして返すため、文字列/Date どちらも受け付ける
  created?: string | Date;
  lastModified?: string | Date;
}

/**
 * CREATED / LAST-MODIFIED は RFC 5545 上つねに UTC ("Z" 終端、TZID 不可) で出力する。
 * DTSTART/DTEND (JST ウォールクロック文字列) とは異なり、こちらは Postgres の
 * TIMESTAMP 列を由来とする実時刻 (文字列 or Date オブジェクト) なのでそのまま UTC 変換する。
 */
function formatUtcTimestamp(value: string | Date): string {
  const dt = value instanceof Date ? value : new Date(value);
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * VEVENT の DTSTART/DTEND は TZID=Asia/Tokyo (ローカル時刻・Z終端なし) で出力する必要がある。
 * DB の start_time/end_time は JST のウォールクロック文字列 (例: "2026-01-15T14:00:00") で
 * 保存されているため、`new Date(iso).toISOString()` を経由すると
 *   ①実行環境のタイムゾーンによって数字がずれる (naive datetime は "ローカル時刻" として解釈される)
 *   ②toISOString() は末尾に "Z" (UTC) を付与するため、TZID パラメータと矛盾し RFC 5545 違反になる
 * という2つの不具合があり、Google Calendar 等での連携が正しく動作しない原因になっていた。
 * 文字列から日時の数字を直接抜き出して組み立てることで、実行環境のタイムゾーンに依存せず
 * 常に「保存された時刻をそのまま Asia/Tokyo のローカル時刻」として出力する。
 */
function formatDateTime(iso: string, allDay?: boolean): string {
  if (allDay) {
    // VALUE=DATE format: YYYYMMDD
    return iso.replace(/[-:]/g, '').slice(0, 8);
  }
  // DATETIME format (TZID 用・Z サフィックスなし): YYYYMMDDTHHMMSS
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    return `${y}${mo}${d}T${h}${mi}${s}`;
  }
  // 想定外フォーマットのフォールバック (日時情報が無い場合など)
  const dt = new Date(iso);
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
}

/** YYYY-MM-DD 文字列に days 日を加算する (タイムゾーンに依存しない純粋な日付計算) */
function addDaysToDateStr(dateStr: string, days: number): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d) + days);
  const dt = new Date(utcMs);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
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
      lines.push(`DTEND;VALUE=DATE:${addDaysToDateStr(ev.dtend, 1)}`);
    } else {
      lines.push(`DTSTART;TZID=Asia/Tokyo:${formatDateTime(ev.dtstart)}`);
      lines.push(`DTEND;TZID=Asia/Tokyo:${formatDateTime(ev.dtend)}`);
    }

    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.created) lines.push(`CREATED:${formatUtcTimestamp(ev.created)}`);
    if (ev.lastModified) lines.push(`LAST-MODIFIED:${formatUtcTimestamp(ev.lastModified)}`);

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

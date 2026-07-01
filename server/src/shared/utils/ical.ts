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
function formatDateTime(iso: string | Date | null | undefined, allDay?: boolean): string {
  if (iso == null) return '';
  const str = iso instanceof Date ? iso.toISOString() : String(iso);
  if (allDay) {
    // VALUE=DATE format: YYYYMMDD
    const md = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return md ? `${md[1]}${md[2]}${md[3]}` : '';
  }
  // DATETIME format (TZID 用・Z サフィックスなし): YYYYMMDDTHHMMSS
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    return `${y}${mo}${d}T${h}${mi}${s}`;
  }
  // 想定外フォーマットのフォールバック (日時情報が壊れている場合)。
  // Invalid Date は toISOString() が RangeError を投げてフィード全体を 500 にするため
  // try/catch で握りつぶし、空文字を返して呼び出し側でイベントごとスキップさせる。
  try {
    const dt = new Date(str);
    if (isNaN(dt.getTime())) return '';
    return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
  } catch {
    return '';
  }
}

/** YYYYMMDDTHHMMSS (JST ウォールクロック) に hours 時間を加算する (タイムゾーン非依存の純算術) */
function addHoursToCompact(compact: string, hours: number): string {
  const m = compact.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) return compact;
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  // ウォールクロックをそのまま UTC として扱い算術 (実 TZ 変換はしない)
  const ms = Date.UTC(y, mo - 1, d, h + hours, mi, s);
  const dt = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}${p(dt.getUTCSeconds())}`;
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

/**
 * iCal の行は 75 オクテット (バイト) 以内で折り返す (RFC 5545 §3.1)。
 * 旧実装は JS の文字数 (UTF-16 コード単位) で切っていたため、日本語 (UTF-8 で1文字3バイト)
 * を含む行は実際のバイト長が上限を大幅に超えてしまい、Outlook 等の厳格なパーサーで
 * 予定表の追加に失敗する一因になっていた。コードポイント単位で分割しつつ、
 * 実際の UTF-8 バイト長を積算して 75 オクテット以内に収める。
 */
function foldLine(line: string): string {
  const maxOctets = 75;
  if (Buffer.byteLength(line, 'utf8') <= maxOctets) return line;

  const chars = Array.from(line); // サロゲートペアを含むコードポイント単位で分割
  const segments: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const ch of chars) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    // 継続行は先頭に半角スペース1バイトを付与するため、実質使える幅は 74 オクテット
    const limit = segments.length === 0 ? maxOctets : maxOctets - 1;
    if (current !== '' && currentBytes + chBytes > limit) {
      segments.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current !== '') segments.push(current);

  return segments.map((seg, i) => (i === 0 ? seg : ' ' + seg)).join('\r\n');
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
    // 購読フィードのリフレッシュ間隔ヒント (Outlook / webcal クライアントが参照)
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
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
    // ── 日時の検証 (壊れた VEVENT を出さない = Outlook が「追加できません」になる主因) ──
    const vevent: string[] = [];
    if (ev.allDay) {
      const ds = formatDateTime(ev.dtstart, true);
      if (!ds) continue; // 開始日が無効ならこのイベントは丸ごと skip
      let de = addDaysToDateStr(ev.dtend, 1); // 終日は翌日を指定 (exclusive end)
      // 終了 <= 開始 (同日/未指定) のときは開始翌日にして最低 1 日を保証
      if (!/^\d{8}$/.test(de) || de <= ds) de = addDaysToDateStr(ev.dtstart, 1);
      vevent.push(`DTSTART;VALUE=DATE:${ds}`);
      vevent.push(`DTEND;VALUE=DATE:${de}`);
    } else {
      const ds = formatDateTime(ev.dtstart);
      if (!ds) continue; // 開始時刻が無効ならこのイベントは丸ごと skip
      let de = formatDateTime(ev.dtend);
      // 終了 <= 開始 (ゼロ/負の長さ) は Outlook が拒否する → 開始 +1 時間にする
      if (!de || de <= ds) de = addHoursToCompact(ds, 1);
      vevent.push(`DTSTART;TZID=Asia/Tokyo:${ds}`);
      vevent.push(`DTEND;TZID=Asia/Tokyo:${de}`);
    }

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    // DTSTAMP は RFC 5545 上 UID と並ぶ必須プロパティ。Google Calendar は欠落を黙って許容するが、
    // Outlook / Exchange は欠落したVEVENTを拒否する (「Outlookに追加できない」の直接原因)。
    lines.push(`DTSTAMP:${formatUtcTimestamp(ev.lastModified || ev.created || new Date())}`);
    lines.push(...vevent);

    // SUMMARY は空だと Outlook が VEVENT を無効扱いすることがあるため必ず非空にする
    const summary = (ev.summary || '').trim() || '（無題の予約）';
    lines.push(`SUMMARY:${escapeText(summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.created) lines.push(`CREATED:${formatUtcTimestamp(ev.created)}`);
    if (ev.lastModified) lines.push(`LAST-MODIFIED:${formatUtcTimestamp(ev.lastModified)}`);

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/**
 * contexts/schedule/services/ics-sync.service.ts
 *
 * マイカレンダーの ICS 購読同期 (Outlook/Google → GMO ONAiR の一方向)。
 * personal_ics_feeds に登録された公開 ICS URL を定期取得し、
 * personal_events (source='ics') に upsert する。
 *
 * - フィード URL は秘密情報のため url_enc (AES-256-GCM) で保存されており、
 *   同期時に decrypt して使う (liveops/crypto.ts を流用)。
 * - 取込ウィンドウ: 過去 30 日〜未来 180 日。ウィンドウ外は取り込まない。
 * - 繰り返し (RRULE) は node-ical の rrule でウィンドウ内に展開し、
 *   1 オカレンス = 1 行 (ics_key = uid + ':' + 開始instant) で保存。
 * - フィードから消えた予定 (ウィンドウ内) は soft-delete して削除を反映。
 * - poller は interactive-poller.service と同型 (setInterval + running フラグ +
 *   フィード単位 try/catch + heartbeat)。
 */
import { randomUUID } from 'crypto';
import axios from 'axios';
import ical from 'node-ical';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { decrypt } from '../../liveops/crypto';

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 分
const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 180;
const MAX_EVENTS_PER_FEED = 1000;
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_MAX_BYTES = 5 * 1024 * 1024; // 5MB

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

interface SyncHeartbeat {
  startedAt: number | null;
  lastRunAt: number | null;
  runCount: number;
  lastFeedCount: number;
}
const heartbeat: SyncHeartbeat = { startedAt: null, lastRunAt: null, runCount: 0, lastFeedCount: 0 };
export function getIcsSyncHeartbeat(): SyncHeartbeat {
  return heartbeat;
}

interface FeedRow {
  id: string;
  user_id: string;
  label: string;
  url_enc: string;
}

interface DesiredEvent {
  title: string;
  all_day: number;
  start_time: string;
  end_time: string;
  location: string | null;
  notes: string | null;
  /**
   * VEVENT の生の UID (繰り返しの回でもマスターの UID)。
   * 書き戻した自分の予定を取り込み直さないための突合にだけ使う。
   * ics_key から切り出さないのは、UID に ':' が入ると壊れるため
   * (繰り返しの ics_key は `uid + ':' + 開始instant`)。
   */
  uid: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * UTC の Date を JST のローカル naive 文字列に変換する。
 * studio_bookings と同じ TEXT 方式 (終日 = YYYY-MM-DD / 時刻あり = YYYY-MM-DDTHH:mm)。
 */
function toJstString(d: Date, allDay: boolean): string {
  const j = new Date(d.getTime() + 9 * 3600_000);
  const date = `${j.getUTCFullYear()}-${pad2(j.getUTCMonth() + 1)}-${pad2(j.getUTCDate())}`;
  if (allDay) return date;
  return `${date}T${pad2(j.getUTCHours())}:${pad2(j.getUTCMinutes())}`;
}

/** ICS の終日 DTEND は exclusive → inclusive の最終日に -1 日して返す */
function allDayEndInclusive(end: Date, start: Date): Date {
  const e = new Date(end.getTime() - 24 * 3600_000);
  return e.getTime() < start.getTime() ? start : e;
}

/**
 * ICS テキストをパースし、取込ウィンドウ内の予定を ics_key → DesiredEvent の Map にする。
 * 単発 = uid、繰り返し = uid + ':' + オカレンス開始 instant (RECURRENCE-ID 上書き・EXDATE 除外を適用)。
 */
export function buildDesiredEvents(icsText: string, now = new Date()): Map<string, DesiredEvent> {
  const winStart = new Date(now.getTime() - WINDOW_PAST_DAYS * 24 * 3600_000);
  const winEnd = new Date(now.getTime() + WINDOW_FUTURE_DAYS * 24 * 3600_000);
  const parsed = ical.parseICS(icsText);
  const desired = new Map<string, DesiredEvent>();

  const put = (key: string, uid: string, title: string, allDay: boolean, start: Date, end: Date, location?: string, notes?: string) => {
    if (desired.size >= MAX_EVENTS_PER_FEED) return;
    const endEff = allDay ? allDayEndInclusive(end, start) : end;
    desired.set(key, {
      uid,
      title: (title || '(タイトルなし)').slice(0, 300),
      all_day: allDay ? 1 : 0,
      start_time: toJstString(start, allDay),
      end_time: toJstString(endEff, allDay),
      location: location ? String(location).slice(0, 300) : null,
      notes: notes ? String(notes).slice(0, 1000) : null,
    });
  };

  for (const ev of Object.values(parsed) as any[]) {
    if (!ev || ev.type !== 'VEVENT') continue;
    const uid: string = String(ev.uid || '');
    if (!uid || !(ev.start instanceof Date)) continue;
    const allDay = !!(ev.start as any).dateOnly;
    const baseEnd: Date = ev.end instanceof Date ? ev.end : ev.start;
    const durationMs = Math.max(0, baseEnd.getTime() - ev.start.getTime());

    if (ev.rrule) {
      // EXDATE の除外セット (正確な instant + dateOnly のときは日付部)
      const exInstants = new Set<string>();
      const exDates = new Set<string>();
      for (const exd of Object.values(ev.exdate || {}) as any[]) {
        if (exd instanceof Date) {
          exInstants.add(exd.toISOString());
          if ((exd as any).dateOnly) exDates.add(exd.toISOString().slice(0, 10));
        }
      }
      let occurrences: Date[] = [];
      try {
        occurrences = ev.rrule.between(winStart, winEnd, true);
      } catch {
        continue; // 壊れた RRULE はこの VEVENT ごとスキップ (フィード全体は止めない)
      }
      for (const occ of occurrences) {
        if (exInstants.has(occ.toISOString()) || exDates.has(occ.toISOString().slice(0, 10))) continue;
        // RECURRENCE-ID 上書き (node-ical は日付文字列キーの recurrences に格納)
        const override = ev.recurrences?.[occ.toISOString().slice(0, 10)];
        const key = `${uid}:${occ.toISOString()}`;
        if (override && override.start instanceof Date) {
          const oEnd = override.end instanceof Date ? override.end : new Date(override.start.getTime() + durationMs);
          put(key, uid, override.summary ?? ev.summary, allDay, override.start, oEnd, override.location ?? ev.location, override.description ?? ev.description);
        } else {
          put(key, uid, ev.summary, allDay, occ, new Date(occ.getTime() + durationMs), ev.location, ev.description);
        }
      }
    } else {
      // 単発 (マスター不在の RECURRENCE-ID 単独上書きは uid が同じため recurrenceid で区別)
      if (baseEnd.getTime() < winStart.getTime() || ev.start.getTime() > winEnd.getTime()) continue;
      const key = ev.recurrenceid instanceof Date ? `${uid}:${ev.recurrenceid.toISOString()}` : uid;
      put(key, uid, ev.summary, allDay, ev.start, baseEnd, ev.location, ev.description);
    }
  }
  return desired;
}

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
  total: number;
}

/** 1 フィードを同期する。成否は personal_ics_feeds の last_synced_at / last_error に記録。 */
export async function syncFeed(feed: FeedRow): Promise<SyncResult> {
  const url = decrypt(feed.url_enc);
  if (!url) throw new Error('URL の復号に失敗しました (ENCRYPTION_KEY を確認してください)');
  const normalized = url.replace(/^webcal:\/\//i, 'https://');
  if (!/^https:\/\//i.test(normalized)) throw new Error('https の URL のみ購読できます');

  const res = await axios.get<string>(normalized, {
    timeout: FETCH_TIMEOUT_MS,
    maxContentLength: FETCH_MAX_BYTES,
    responseType: 'text',
    headers: { 'User-Agent': 'GMO-ONAiR-Calendar/1.0', Accept: 'text/calendar, text/plain, */*' },
    // ICS フィードはリダイレクトすることがある (Google の publish URL 等)
    maxRedirects: 3,
  });
  const text = typeof res.data === 'string' ? res.data : String(res.data);
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('ICS 形式ではありません (URL が公開カレンダーの ICS か確認してください)');

  const desired = buildDesiredEvents(text);

  // 書き戻した自分の手入力予定を、ICS 経由でもう1件取り込まない。
  //
  // Google / Outlook の取込には最初からこの除外があったが
  // (google-calendar.service.ts / ms-calendar.service.ts)、**ICS 取込にだけ無かった**。
  // そのため「書き込み連携あり + 同じカレンダーを ICS でも購読」の人は、
  // ONAiR で作った予定がすべて 2 行になっていた
  // (手入力の素の題名 と 取込側の題名 の2件)。
  //
  // 突合は「書き戻し先のイベント id」で行う。ICS の UID は提供元が
  // `<イベントid>@google.com` の形で出すので、`@` の前と一致するかを見る
  // (Outlook の公開 ICS の UID は Graph の id と一致しないため Outlook 側は拾えない。
  //  そちらは取込自体に除外が入っているので、ICS 併用のときだけ残る既知の穴)。
  const pushed = await queryAll(
    `SELECT external_event_id FROM personal_events
     WHERE user_id = ? AND external_event_id IS NOT NULL
       AND source = 'manual' AND deleted_at IS NULL`,
    [feed.user_id]
  ) as Array<{ external_event_id: string }>;
  if (pushed.length > 0) {
    const pushedIds = new Set(pushed.map((p) => String(p.external_event_id)));
    for (const [key, ev] of [...desired]) {
      // UID そのもの / `@` の前 のどちらかが書き戻し先の id なら、それは自分の予定
      if (pushedIds.has(ev.uid) || pushedIds.has(ev.uid.split('@')[0])) desired.delete(key);
    }
  }

  const existing = await queryAll(
    `SELECT id, ics_key, title, all_day, start_time, end_time, location, notes
     FROM personal_events WHERE feed_id = ? AND deleted_at IS NULL`,
    [feed.id]
  ) as any[];
  const existingByKey = new Map<string, any>(existing.map((r) => [String(r.ics_key), r]));

  let created = 0, updated = 0, removed = 0;

  for (const [key, ev] of desired) {
    const cur = existingByKey.get(key);
    if (cur) {
      const changed = cur.title !== ev.title || Number(cur.all_day) !== ev.all_day ||
        cur.start_time !== ev.start_time || cur.end_time !== ev.end_time ||
        (cur.location || null) !== ev.location || (cur.notes || null) !== ev.notes;
      if (changed) {
        await execute(
          `UPDATE personal_events SET title=?, all_day=?, start_time=?, end_time=?, location=?, notes=?, updated_at=NOW() WHERE id=?`,
          [ev.title, ev.all_day, ev.start_time, ev.end_time, ev.location, ev.notes, cur.id]
        );
        updated++;
      }
    } else {
      await execute(
        `INSERT INTO personal_events (id, user_id, title, all_day, start_time, end_time, location, notes, source, feed_id, ics_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ics', ?, ?)`,
        [randomUUID(), feed.user_id, ev.title, ev.all_day, ev.start_time, ev.end_time, ev.location, ev.notes, feed.id, key]
      );
      created++;
    }
  }

  // フィードから消えた予定を soft-delete (この feed の行は全てウィンドウ内取込なので全比較で良い)
  for (const [key, cur] of existingByKey) {
    if (!desired.has(key)) {
      await execute(`UPDATE personal_events SET deleted_at=NOW(), updated_at=NOW() WHERE id=?`, [cur.id]);
      removed++;
    }
  }

  await execute(
    `UPDATE personal_ics_feeds SET last_synced_at=NOW(), last_error=NULL, event_count=?, updated_at=NOW() WHERE id=?`,
    [desired.size, feed.id]
  );
  return { created, updated, removed, total: desired.size };
}

/** フィード id 指定の即時同期 (手動「今すぐ同期」/ poller 共用)。エラーは last_error に記録して rethrow。 */
export async function syncFeedById(feedId: string): Promise<SyncResult> {
  const feed = await queryOne(
    `SELECT id, user_id, label, url_enc FROM personal_ics_feeds WHERE id = ? AND deleted_at IS NULL`,
    [feedId]
  ) as FeedRow | undefined;
  if (!feed) throw new Error('フィードが見つかりません');
  try {
    return await syncFeed(feed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await execute(
      `UPDATE personal_ics_feeds SET last_error=?, updated_at=NOW() WHERE id=?`,
      [msg.slice(0, 500), feedId]
    ).catch(() => { /* 記録失敗は握りつぶす */ });
    throw err;
  }
}

async function runSyncCycle(): Promise<void> {
  if (running) return;
  running = true;
  try {
    heartbeat.lastRunAt = Date.now();
    heartbeat.runCount++;
    const feeds = await queryAll(
      `SELECT id FROM personal_ics_feeds WHERE enabled = 1 AND deleted_at IS NULL ORDER BY last_synced_at ASC NULLS FIRST`
    ) as Array<{ id: string }>;
    heartbeat.lastFeedCount = feeds.length;
    for (const f of feeds) {
      try {
        await syncFeedById(f.id);
      } catch (err) {
        // 1 フィードの失敗で全体を止めない (エラーは last_error に記録済み)
        console.warn(`[ics-sync] feed=${f.id} sync failed:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error('[ics-sync] cycle error:', err);
  } finally {
    running = false;
  }
}

/** サーバー起動時に呼ぶ。15 分間隔 + 起動 30 秒後に初回同期。 */
export function initIcsSyncPoller(): void {
  if (timer) return;
  heartbeat.startedAt = Date.now();
  setTimeout(() => { void runSyncCycle(); }, 30_000);
  timer = setInterval(() => { void runSyncCycle(); }, SYNC_INTERVAL_MS);
  console.log(`[ics-sync] poller started (interval ${SYNC_INTERVAL_MS / 60000}min)`);
}

export function shutdownIcsSyncPoller(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

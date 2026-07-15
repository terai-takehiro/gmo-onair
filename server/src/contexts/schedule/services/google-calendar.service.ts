/**
 * contexts/schedule/services/google-calendar.service.ts
 *
 * マイカレンダーの Google カレンダー OAuth 同期 (Google → GMO ONAiR の一方向)。
 * personal_google_accounts に保存した refresh_token (暗号化) から access_token を得て
 * Calendar API v3 の primary カレンダーを取得し、personal_events (source='google') に upsert する。
 *
 * - Calendar API は singleEvents=true で取得するため繰り返しは Google 側が展開 (RRULE 解析不要)。
 * - 取込ウィンドウ: 過去 30 日〜未来 180 日 (ICS 同期と同じ)。
 * - 日時は studio_bookings / personal_events と同じ TEXT (JST naive) 方式。
 * - フィード (ics) 同期と同型の「取得→Map化→差分 upsert→消えた分 soft-delete」。
 * - poller は ics-sync と同型 (setInterval + running フラグ + アカウント単位 try/catch + heartbeat)。
 * - refresh_token 保存は liveops/crypto.ts (AES-256-GCM) を流用。
 */
import { randomUUID } from 'crypto';
import axios from 'axios';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { encrypt, decrypt } from '../../liveops/crypto';
import { config } from '../../../config';

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 分
const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 180;
const MAX_EVENTS = 2500;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export function isGoogleConfigured(): boolean {
  return !!(config.googleClientId && config.googleClientSecret);
}

// ─── OAuth トークンやり取り (axios 直叩き — googleapis SDK は追加しない) ─────────

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

/** 認可コード → トークン交換 (callback で使用) */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: config.googleOAuthRedirect,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
  );
  return res.data as GoogleTokenResponse;
}

/** id_token (JWT) の payload から email を取り出す (署名検証は Google からの直接応答なので不要) */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const seg = idToken.split('.')[1];
    if (!seg) return null;
    const json = Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

/** refresh_token を best-effort で revoke (連携解除時) */
export async function revokeToken(refreshToken: string): Promise<void> {
  try {
    await axios.post(REVOKE_URL, new URLSearchParams({ token: refreshToken }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    });
  } catch {
    /* 失効済み等は無視 */
  }
}

interface AccountRow {
  id: string;
  user_id: string;
  google_email: string | null;
  refresh_token_enc: string;
  access_token_enc: string | null;
  token_expiry: string | Date | null;
}

/** アカウントの access_token を返す (キャッシュ有効ならそれ、失効なら refresh で更新) */
async function getAccessToken(account: AccountRow): Promise<string> {
  const cached = account.access_token_enc ? decrypt(account.access_token_enc) : null;
  const expiry = account.token_expiry ? new Date(account.token_expiry).getTime() : 0;
  if (cached && Date.now() < expiry - 60_000) return cached;

  const refreshToken = decrypt(account.refresh_token_enc);
  if (!refreshToken) throw new Error('refresh_token の復号に失敗しました (ENCRYPTION_KEY を確認してください)');

  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
  );
  const accessToken: string = res.data.access_token;
  const ttl: number = res.data.expires_in ?? 3599;
  const newExpiry = new Date(Date.now() + ttl * 1000);
  await execute(
    `UPDATE personal_google_accounts SET access_token_enc=?, token_expiry=?, updated_at=NOW() WHERE id=?`,
    [encrypt(accessToken), newExpiry.toISOString(), account.id]
  ).catch(() => { /* キャッシュ更新失敗は握りつぶす (次回また refresh される) */ });
  return accessToken;
}

// ─── Google events → personal_events マッピング ────────────────────────────────

interface DesiredEvent {
  title: string;
  all_day: number;
  start_time: string;
  end_time: string;
  location: string | null;
  notes: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** UTC の Date を JST の naive 文字列 (YYYY-MM-DDTHH:mm) に変換 (時刻イベント用) */
function toJstDateTime(d: Date): string {
  const j = new Date(d.getTime() + 9 * 3600_000);
  return `${j.getUTCFullYear()}-${pad2(j.getUTCMonth() + 1)}-${pad2(j.getUTCDate())}T${pad2(j.getUTCHours())}:${pad2(j.getUTCMinutes())}`;
}

/** 終日の end.date (exclusive, YYYY-MM-DD) を inclusive の最終日に -1 日 (文字列演算・TZ 非依存) */
function allDayEndInclusive(endDate: string, startDate: string): string {
  const d = new Date(`${endDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const inclusive = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return inclusive < startDate ? startDate : inclusive;
}

/**
 * Calendar API の items[] を ics_key (= event.id) → DesiredEvent の Map にする。
 * singleEvents=true 取得なので繰り返しは展開済み。cancelled はスキップ。
 */
export function buildDesiredFromGoogle(items: any[]): Map<string, DesiredEvent> {
  const desired = new Map<string, DesiredEvent>();
  for (const ev of items || []) {
    if (!ev || ev.status === 'cancelled') continue;
    const key: string = String(ev.id || '');
    if (!key || !ev.start) continue;

    let allDay: boolean;
    let startTime: string;
    let endTime: string;
    if (ev.start.date) {
      // 終日
      allDay = true;
      startTime = String(ev.start.date).slice(0, 10);
      const endDate = ev.end?.date ? String(ev.end.date).slice(0, 10) : startTime;
      endTime = allDayEndInclusive(endDate, startTime);
    } else if (ev.start.dateTime) {
      // 時刻あり (dateTime は TZ 付き RFC3339 → 正しい instant に変換)
      allDay = false;
      const s = new Date(ev.start.dateTime);
      const e = ev.end?.dateTime ? new Date(ev.end.dateTime) : s;
      if (Number.isNaN(s.getTime())) continue;
      startTime = toJstDateTime(s);
      endTime = toJstDateTime(Number.isNaN(e.getTime()) ? s : e);
    } else {
      continue;
    }

    desired.set(key, {
      title: String(ev.summary || '(タイトルなし)').slice(0, 300),
      all_day: allDay ? 1 : 0,
      start_time: startTime,
      end_time: endTime,
      location: ev.location ? String(ev.location).slice(0, 300) : null,
      notes: ev.description ? String(ev.description).slice(0, 1000) : null,
    });
  }
  return desired;
}

/** primary カレンダーの events を取得 (singleEvents 展開・ウィンドウ内) */
async function listEvents(accessToken: string, now = new Date()): Promise<any[]> {
  const timeMin = new Date(now.getTime() - WINDOW_PAST_DAYS * 24 * 3600_000).toISOString();
  const timeMax = new Date(now.getTime() + WINDOW_FUTURE_DAYS * 24 * 3600_000).toISOString();
  const res = await axios.get(CALENDAR_EVENTS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: MAX_EVENTS,
      timeMin,
      timeMax,
    },
    timeout: 20_000,
  });
  return Array.isArray(res.data?.items) ? res.data.items : [];
}

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
  total: number;
  email?: string | null;
}

/** 1 アカウントを同期する。成否は personal_google_accounts の last_synced_at / last_error に記録。 */
export async function syncGoogleAccount(accountId: string): Promise<SyncResult> {
  const account = await queryOne(
    `SELECT id, user_id, google_email, refresh_token_enc, access_token_enc, token_expiry
     FROM personal_google_accounts WHERE id = ? AND deleted_at IS NULL`,
    [accountId]
  ) as AccountRow | undefined;
  if (!account) throw new Error('連携アカウントが見つかりません');

  try {
    const accessToken = await getAccessToken(account);
    const items = await listEvents(accessToken);
    const desired = buildDesiredFromGoogle(items);

    const existing = await queryAll(
      `SELECT id, ics_key, title, all_day, start_time, end_time, location, notes
       FROM personal_events WHERE google_account_id = ? AND deleted_at IS NULL`,
      [account.id]
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
          `INSERT INTO personal_events (id, user_id, title, all_day, start_time, end_time, location, notes, source, google_account_id, ics_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'google', ?, ?)`,
          [randomUUID(), account.user_id, ev.title, ev.all_day, ev.start_time, ev.end_time, ev.location, ev.notes, account.id, key]
        );
        created++;
      }
    }
    // Google から消えた予定を soft-delete (ウィンドウ内取込なので全比較で良い)
    for (const [key, cur] of existingByKey) {
      if (!desired.has(key)) {
        await execute(`UPDATE personal_events SET deleted_at=NOW(), updated_at=NOW() WHERE id=?`, [cur.id]);
        removed++;
      }
    }

    await execute(
      `UPDATE personal_google_accounts SET last_synced_at=NOW(), last_error=NULL, event_count=?, updated_at=NOW() WHERE id=?`,
      [desired.size, account.id]
    );
    return { created, updated, removed, total: desired.size, email: account.google_email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await execute(
      `UPDATE personal_google_accounts SET last_error=?, updated_at=NOW() WHERE id=?`,
      [msg.slice(0, 500), account.id]
    ).catch(() => { /* 記録失敗は握りつぶす */ });
    throw err;
  }
}

/** ユーザーの Google アカウントを即時同期 (無ければ no-op) */
export async function syncGoogleForUser(userId: string): Promise<SyncResult | null> {
  const acct = await queryOne(
    `SELECT id FROM personal_google_accounts WHERE user_id = ? AND enabled = 1 AND deleted_at IS NULL`,
    [userId]
  ) as { id: string } | undefined;
  if (!acct) return null;
  return syncGoogleAccount(acct.id);
}

// ─── poller (ics-sync と同型) ─────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function runSyncCycle(): Promise<void> {
  if (running || !isGoogleConfigured()) return;
  running = true;
  try {
    const accounts = await queryAll(
      `SELECT id FROM personal_google_accounts WHERE enabled = 1 AND deleted_at IS NULL ORDER BY last_synced_at ASC NULLS FIRST`
    ) as Array<{ id: string }>;
    for (const a of accounts) {
      try {
        await syncGoogleAccount(a.id);
      } catch (err) {
        console.warn(`[google-sync] account=${a.id} sync failed:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error('[google-sync] cycle error:', err);
  } finally {
    running = false;
  }
}

export function initGoogleSyncPoller(): void {
  if (timer) return;
  if (!isGoogleConfigured()) {
    console.log('[google-sync] disabled (GOOGLE_CLIENT_ID/SECRET not set)');
    return;
  }
  setTimeout(() => { void runSyncCycle(); }, 45_000);
  timer = setInterval(() => { void runSyncCycle(); }, SYNC_INTERVAL_MS);
  console.log(`[google-sync] poller started (interval ${SYNC_INTERVAL_MS / 60000}min)`);
}

export function shutdownGoogleSyncPoller(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

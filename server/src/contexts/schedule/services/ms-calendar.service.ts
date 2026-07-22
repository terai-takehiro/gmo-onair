/**
 * contexts/schedule/services/ms-calendar.service.ts
 *
 * マイカレンダーの Outlook (Microsoft 365) カレンダー OAuth 同期 (Outlook → GMO ONAiR の一方向)。
 * personal_ms_accounts に保存した refresh_token (暗号化) から access_token を得て
 * Microsoft Graph の calendarView を取得し、personal_events (source='outlook') に upsert する。
 *
 * - Graph の calendarView は繰り返しをサーバー側で展開する (Google の singleEvents=true 相当)。
 * - `Prefer: outlook.timezone="Tokyo Standard Time"` を付けて時刻を JST で受け取る
 *   → 変換不要でそのまま naive JST 文字列にできる。
 * - 取込ウィンドウ: 過去 30 日〜未来 180 日 (Google/ICS と同じ)。
 * - google-calendar.service と対称の「取得→Map化→差分 upsert→消えた分 soft-delete」。
 * - poller は同型 (setInterval + running フラグ + アカウント単位 try/catch)。
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
const MAX_EVENTS = 1000;
const GRAPH_CALENDAR_VIEW_URL = 'https://graph.microsoft.com/v1.0/me/calendarView';

export function isMsConfigured(): boolean {
  return !!(config.msClientId && config.msClientSecret && config.msTenantId);
}

function tokenUrl(): string {
  return `https://login.microsoftonline.com/${config.msTenantId}/oauth2/v2.0/token`;
}
function authorizeUrl(): string {
  return `https://login.microsoftonline.com/${config.msTenantId}/oauth2/v2.0/authorize`;
}
export { authorizeUrl as msAuthorizeUrl };

// v2 エンドポイントのスコープ (Graph 委任 + refresh_token 用 offline_access + id_token 用 openid/email)
// Calendars.ReadWrite = 取込 + ONAiR→Outlook の書き戻しの両方に必要。
// 旧 Calendars.Read で連携済みのアカウントは can_write=0 のまま → UI が再連携を促す。
export const MS_SCOPE = 'https://graph.microsoft.com/Calendars.ReadWrite offline_access openid email profile';

// ─── OAuth トークンやり取り (axios 直叩き) ─────────────────────────────────────

export interface MsTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

/** 認可コード → トークン交換 (callback で使用) */
export async function exchangeCodeForTokens(code: string): Promise<MsTokenResponse> {
  const res = await axios.post(
    tokenUrl(),
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.msClientId,
      client_secret: config.msClientSecret,
      redirect_uri: config.msOAuthRedirect,
      scope: MS_SCOPE,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
  );
  return res.data as MsTokenResponse;
}

/** id_token (JWT) の payload から email を取り出す (Microsoft は email / preferred_username / upn) */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const seg = idToken.split('.')[1];
    if (!seg) return null;
    const json = Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const p = JSON.parse(json);
    return (typeof p.email === 'string' && p.email) ||
      (typeof p.preferred_username === 'string' && p.preferred_username) ||
      (typeof p.upn === 'string' && p.upn) || null;
  } catch {
    return null;
  }
}

interface AccountRow {
  id: string;
  user_id: string;
  ms_email: string | null;
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
    tokenUrl(),
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.msClientId,
      client_secret: config.msClientSecret,
      scope: MS_SCOPE,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
  );
  const accessToken: string = res.data.access_token;
  const ttl: number = res.data.expires_in ?? 3599;
  const newExpiry = new Date(Date.now() + ttl * 1000);
  // Microsoft はローテーションで新しい refresh_token を返すことがある → あれば更新
  const newRefresh = typeof res.data.refresh_token === 'string' ? res.data.refresh_token : null;
  await execute(
    `UPDATE personal_ms_accounts SET access_token_enc=?, token_expiry=?, ${newRefresh ? 'refresh_token_enc=?, ' : ''}updated_at=NOW() WHERE id=?`,
    newRefresh
      ? [encrypt(accessToken), newExpiry.toISOString(), encrypt(newRefresh), account.id]
      : [encrypt(accessToken), newExpiry.toISOString(), account.id]
  ).catch(() => { /* キャッシュ更新失敗は握りつぶす */ });
  return accessToken;
}

// ─── Graph events → personal_events マッピング ─────────────────────────────────

interface DesiredEvent {
  title: string;
  all_day: number;
  start_time: string;
  end_time: string;
  location: string | null;
  notes: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 終日の end (exclusive, YYYY-MM-DD...) を inclusive の最終日に -1 日 (文字列演算・TZ 非依存) */
function allDayEndInclusive(endDate: string, startDate: string): string {
  const d = new Date(`${endDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const inclusive = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return inclusive < startDate ? startDate : inclusive;
}

/**
 * Graph calendarView の value[] を ics_key (= event.id) → DesiredEvent の Map にする。
 * calendarView は繰り返し展開済み。isCancelled はスキップ。
 * Prefer: outlook.timezone="Tokyo Standard Time" のため start/end.dateTime は既に JST naive。
 */
export function buildDesiredFromMs(items: any[]): Map<string, DesiredEvent> {
  const desired = new Map<string, DesiredEvent>();
  for (const ev of items || []) {
    if (!ev || ev.isCancelled) continue;
    const key: string = String(ev.id || '');
    if (!key || !ev.start?.dateTime) continue;

    const allDay = !!ev.isAllDay;
    let startTime: string;
    let endTime: string;
    if (allDay) {
      startTime = String(ev.start.dateTime).slice(0, 10);
      const endDate = ev.end?.dateTime ? String(ev.end.dateTime).slice(0, 10) : startTime;
      endTime = allDayEndInclusive(endDate, startTime);
    } else {
      // "2026-07-15T10:00:00.0000000" → "2026-07-15T10:00" (Tokyo tz で受信済み)
      startTime = String(ev.start.dateTime).slice(0, 16);
      endTime = ev.end?.dateTime ? String(ev.end.dateTime).slice(0, 16) : startTime;
    }

    desired.set(key, {
      title: String(ev.subject || '(タイトルなし)').slice(0, 300),
      all_day: allDay ? 1 : 0,
      start_time: startTime,
      end_time: endTime,
      location: ev.location?.displayName ? String(ev.location.displayName).slice(0, 300) : null,
      notes: ev.bodyPreview ? String(ev.bodyPreview).slice(0, 1000) : null,
    });
  }
  return desired;
}

/** primary カレンダーの calendarView を取得 (繰り返し展開・ウィンドウ内・ページング対応)。
 *  安全上限 (MAX_EVENTS / 25ページ) に達しても @odata.nextLink がまだ残っている場合は
 *  truncated=true を返し、呼び出し側は削除フェーズをスキップして取りこぼしを「消えた予定」と
 *  誤認するのを防ぐ。 */
async function listEvents(accessToken: string, now = new Date()): Promise<{ items: any[]; truncated: boolean }> {
  const startDateTime = new Date(now.getTime() - WINDOW_PAST_DAYS * 24 * 3600_000).toISOString();
  const endDateTime = new Date(now.getTime() + WINDOW_FUTURE_DAYS * 24 * 3600_000).toISOString();
  const items: any[] = [];
  let url: string | null =
    `${GRAPH_CALENDAR_VIEW_URL}?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$top=100&$orderby=${encodeURIComponent('start/dateTime')}&$select=${encodeURIComponent('id,subject,start,end,isAllDay,isCancelled,location,bodyPreview')}`;
  let guard = 0;
  while (url && items.length < MAX_EVENTS && guard < 25) {
    guard++;
    const res: any = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="Tokyo Standard Time"',
      },
      timeout: 20_000,
    });
    if (Array.isArray(res.data?.value)) items.push(...res.data.value);
    url = typeof res.data?.['@odata.nextLink'] === 'string' ? res.data['@odata.nextLink'] : null;
  }
  return { items, truncated: Boolean(url) }; // url が残っていれば取りきれていない
}

// ─── 書き戻し (GMO ONAiR → Outlook の一方向・手入力の個人予定のみ) ────────────────
// Calendars.ReadWrite で連携し can_write=1 のアカウントのみ対象。

const GRAPH_EVENTS_URL = 'https://graph.microsoft.com/v1.0/me/events';
const MS_TZ = 'Tokyo Standard Time';

export interface ManualEventInput {
  title: string;
  all_day: number | boolean;
  start_time: string;   // YYYY-MM-DD (終日) または YYYY-MM-DDTHH:mm
  end_time: string;     // 終日は inclusive の最終日
  location?: string | null;
  notes?: string | null;
}

/** 終日の inclusive 最終日 → Graph の exclusive end (+1 日) */
function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function msEventBody(ev: ManualEventInput): Record<string, unknown> {
  const base: Record<string, unknown> = {
    subject: ev.title,
    body: { contentType: 'text', content: ev.notes || '' },
    location: ev.location ? { displayName: ev.location } : undefined,
  };
  if (ev.all_day) {
    return {
      ...base,
      isAllDay: true,
      start: { dateTime: `${ev.start_time.slice(0, 10)}T00:00:00`, timeZone: MS_TZ },
      end: { dateTime: `${addOneDay(ev.end_time || ev.start_time)}T00:00:00`, timeZone: MS_TZ },
    };
  }
  return {
    ...base,
    isAllDay: false,
    start: { dateTime: `${ev.start_time.slice(0, 16)}:00`, timeZone: MS_TZ },
    end: { dateTime: `${(ev.end_time || ev.start_time).slice(0, 16)}:00`, timeZone: MS_TZ },
  };
}

/** 書き込み可能な Outlook 連携アカウントを返す (無ければ null) */
export async function getWritableMsAccount(userId: string): Promise<AccountRow | null> {
  const row = await queryOne(
    `SELECT id, user_id, ms_email, refresh_token_enc, access_token_enc, token_expiry
     FROM personal_ms_accounts
     WHERE user_id = ? AND enabled = 1 AND can_write = 1 AND deleted_at IS NULL`,
    [userId]
  ) as AccountRow | undefined;
  return row ?? null;
}

/** 手入力予定を Outlook に作成 → 外部イベント id を返す (書込不可なら null) */
export async function pushEventToMs(userId: string, ev: ManualEventInput): Promise<string | null> {
  const account = await getWritableMsAccount(userId);
  if (!account) return null;
  const accessToken = await getAccessToken(account);
  const res = await axios.post(GRAPH_EVENTS_URL, msEventBody(ev), {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    timeout: 15_000,
  });
  return typeof res.data?.id === 'string' ? res.data.id : null;
}

/** Outlook 側の既存イベントを更新 */
export async function updateMsEvent(userId: string, externalId: string, ev: ManualEventInput): Promise<void> {
  const account = await getWritableMsAccount(userId);
  if (!account) return;
  const accessToken = await getAccessToken(account);
  await axios.patch(`${GRAPH_EVENTS_URL}/${encodeURIComponent(externalId)}`, msEventBody(ev), {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    timeout: 15_000,
  });
}

/** Outlook 側の既存イベントを削除 (既に無い場合の 404 は無視) */
export async function deleteMsEvent(userId: string, externalId: string): Promise<void> {
  const account = await getWritableMsAccount(userId);
  if (!account) return;
  const accessToken = await getAccessToken(account);
  try {
    await axios.delete(`${GRAPH_EVENTS_URL}/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15_000,
    });
  } catch (err: any) {
    const status = err?.response?.status;
    if (status !== 404 && status !== 410) throw err;
  }
}

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
  total: number;
  email?: string | null;
}

/** 1 アカウントを同期する。成否は personal_ms_accounts の last_synced_at / last_error に記録。 */
export async function syncMsAccount(accountId: string): Promise<SyncResult> {
  const account = await queryOne(
    `SELECT id, user_id, ms_email, refresh_token_enc, access_token_enc, token_expiry
     FROM personal_ms_accounts WHERE id = ? AND deleted_at IS NULL`,
    [accountId]
  ) as AccountRow | undefined;
  if (!account) throw new Error('連携アカウントが見つかりません');

  try {
    const accessToken = await getAccessToken(account);
    const { items, truncated } = await listEvents(accessToken);
    const desired = buildDesiredFromMs(items);

    // 書き戻しで自分が作った手入力予定は、pull で source='outlook' の重複として取り込まない
    const pushed = await queryAll(
      `SELECT external_event_id FROM personal_events
       WHERE user_id = ? AND external_provider = 'outlook' AND external_event_id IS NOT NULL
         AND source = 'manual' AND deleted_at IS NULL`,
      [account.user_id]
    ) as Array<{ external_event_id: string }>;
    for (const p of pushed) desired.delete(String(p.external_event_id));

    const existing = await queryAll(
      `SELECT id, ics_key, title, all_day, start_time, end_time, location, notes
       FROM personal_events WHERE ms_account_id = ? AND deleted_at IS NULL`,
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
          `INSERT INTO personal_events (id, user_id, title, all_day, start_time, end_time, location, notes, source, ms_account_id, ics_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'outlook', ?, ?)`,
          [randomUUID(), account.user_id, ev.title, ev.all_day, ev.start_time, ev.end_time, ev.location, ev.notes, account.id, key]
        );
        created++;
      }
    }
    // Outlook から消えた予定を soft-delete (ウィンドウ内取込なので全比較で良い)。
    // ただし全ページを取得しきれなかった (truncated) 場合はスキップする — 取りこぼした
    // 実在イベントを「消えた予定」と誤認して削除するのを防ぐ。
    if (!truncated) {
      for (const [key, cur] of existingByKey) {
        if (!desired.has(key)) {
          await execute(`UPDATE personal_events SET deleted_at=NOW(), updated_at=NOW() WHERE id=?`, [cur.id]);
          removed++;
        }
      }
    }

    await execute(
      `UPDATE personal_ms_accounts SET last_synced_at=NOW(), last_error=NULL, event_count=?, updated_at=NOW() WHERE id=?`,
      [desired.size, account.id]
    );
    return { created, updated, removed, total: desired.size, email: account.ms_email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await execute(
      `UPDATE personal_ms_accounts SET last_error=?, updated_at=NOW() WHERE id=?`,
      [msg.slice(0, 500), account.id]
    ).catch(() => { /* 記録失敗は握りつぶす */ });
    throw err;
  }
}

/** ユーザーの Outlook アカウントを即時同期 (無ければ no-op) */
export async function syncMsForUser(userId: string): Promise<SyncResult | null> {
  const acct = await queryOne(
    `SELECT id FROM personal_ms_accounts WHERE user_id = ? AND enabled = 1 AND deleted_at IS NULL`,
    [userId]
  ) as { id: string } | undefined;
  if (!acct) return null;
  return syncMsAccount(acct.id);
}

// ─── poller ────────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function runSyncCycle(): Promise<void> {
  if (running || !isMsConfigured()) return;
  running = true;
  try {
    const accounts = await queryAll(
      `SELECT id FROM personal_ms_accounts WHERE enabled = 1 AND deleted_at IS NULL ORDER BY last_synced_at ASC NULLS FIRST`
    ) as Array<{ id: string }>;
    for (const a of accounts) {
      try {
        await syncMsAccount(a.id);
      } catch (err) {
        console.warn(`[ms-sync] account=${a.id} sync failed:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error('[ms-sync] cycle error:', err);
  } finally {
    running = false;
  }
}

export function initMsSyncPoller(): void {
  if (timer) return;
  if (!isMsConfigured()) {
    console.log('[ms-sync] disabled (MS_CLIENT_ID/SECRET/TENANT_ID not set)');
    return;
  }
  setTimeout(() => { void runSyncCycle(); }, 60_000);
  timer = setInterval(() => { void runSyncCycle(); }, SYNC_INTERVAL_MS);
  console.log(`[ms-sync] poller started (interval ${SYNC_INTERVAL_MS / 60000}min)`);
}

export function shutdownMsSyncPoller(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

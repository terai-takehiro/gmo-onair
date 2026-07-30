import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { encrypt, decrypt, mask } from '../../liveops/crypto';
import { syncFeedById } from '../services/ics-sync.service';
import {
  getWritableGoogleAccount, pushEventToGoogle, updateGoogleEvent, deleteGoogleEvent,
  type ManualEventInput,
} from '../services/google-calendar.service';
import {
  getWritableMsAccount, pushEventToMs, updateMsEvent, deleteMsEvent,
} from '../services/ms-calendar.service';

// マイカレンダー (個人予定 + ICS 購読フィード) — 本人 + 共有された相手のみ。
// 個人予定 (source='manual') は本人のみが起点だが、personal_event_shares で共有された
// メンバーにも表示され、共有メンバーは内容を編集できる (予定自体の削除は作成者のみ)。
// ICS/Google/Outlook 同期分は本人のみ・読み取り専用 (外部側で編集)。
// 権限: partner_schedule / editor (マイカレンダーの利用 = 記入を伴うため editor 基準)。

const router = Router();
const canUse = [requireAuth, requirePermission('partner_schedule', 'editor')] as const;

// ─── 外部カレンダーへの書き戻し (連携済みに自動・Google 優先。best-effort) ─────────

function toManualInput(row: {
  title: string; all_day: number; start_time: string; end_time: string;
  location: string | null; notes: string | null;
}): ManualEventInput {
  return {
    title: row.title, all_day: row.all_day, start_time: row.start_time,
    end_time: row.end_time, location: row.location, notes: row.notes,
  };
}

/** 手入力予定を連携済み外部カレンダーへ作成 (Google 優先→Outlook)。返り値は反映先 or null */
async function pushToExternal(ownerId: string, ev: ManualEventInput): Promise<{ provider: string; externalId: string } | null> {
  try {
    if (await getWritableGoogleAccount(ownerId)) {
      const id = await pushEventToGoogle(ownerId, ev);
      if (id) return { provider: 'google', externalId: id };
    }
    if (await getWritableMsAccount(ownerId)) {
      const id = await pushEventToMs(ownerId, ev);
      if (id) return { provider: 'outlook', externalId: id };
    }
  } catch (err) {
    console.warn('[personal] external push failed:', err instanceof Error ? err.message : err);
  }
  return null;
}

async function updateExternal(ownerId: string, provider: string, externalId: string, ev: ManualEventInput): Promise<void> {
  try {
    if (provider === 'google') await updateGoogleEvent(ownerId, externalId, ev);
    else if (provider === 'outlook') await updateMsEvent(ownerId, externalId, ev);
  } catch (err) {
    console.warn('[personal] external update failed:', err instanceof Error ? err.message : err);
  }
}

async function deleteExternal(ownerId: string, provider: string, externalId: string): Promise<void> {
  try {
    if (provider === 'google') await deleteGoogleEvent(ownerId, externalId);
    else if (provider === 'outlook') await deleteMsEvent(ownerId, externalId);
  } catch (err) {
    console.warn('[personal] external delete failed:', err instanceof Error ? err.message : err);
  }
}

// ─── 個人予定 ────────────────────────────────────────────────────────────────

// 一覧 (?from=&to= 任意。TEXT 文字列比較の重なり判定)。本人の予定 + 自分に共有された予定。
router.get('/personal', ...canUse, async (req, res) => {
  const me = req.user!.id;
  const from = req.query.from ? String(req.query.from).slice(0, 10) : null;
  const to = req.query.to ? String(req.query.to).slice(0, 10) : null;

  const overlap = (alias: string) => {
    let sql = '';
    const p: unknown[] = [];
    if (from) { sql += ` AND substr(${alias}.end_time, 1, 10) >= ?`; p.push(from); }
    if (to) { sql += ` AND substr(${alias}.start_time, 1, 10) <= ?`; p.push(to); }
    return { sql, p };
  };

  // 1. 本人の予定
  const ow = overlap('pe');
  const owned = await queryAll(
    `SELECT pe.*, f.label AS feed_label
     FROM personal_events pe
     LEFT JOIN personal_ics_feeds f ON f.id = pe.feed_id
     WHERE pe.user_id = ? AND pe.deleted_at IS NULL${ow.sql}
     ORDER BY pe.start_time`,
    [me, ...ow.p]
  ) as any[];

  // 2. 自分に共有された予定 (別ユーザーが作成)
  const sw = overlap('pe');
  const sharedIn = await queryAll(
    `SELECT pe.*, u.name AS owner_name
     FROM personal_event_shares s
     JOIN personal_events pe ON pe.id = s.event_id
     JOIN users u ON u.id = pe.user_id
     WHERE s.user_id = ? AND pe.deleted_at IS NULL${sw.sql}
     ORDER BY pe.start_time`,
    [me, ...sw.p]
  ) as any[];

  // 3. 本人の予定に対する共有先 (誰に共有しているか)
  const ownedIds = owned.map((r) => r.id);
  const sharesByEvent = new Map<string, Array<{ id: string; name: string }>>();
  if (ownedIds.length) {
    const placeholders = ownedIds.map(() => '?').join(',');
    const shareRows = await queryAll(
      `SELECT s.event_id, s.user_id, u.name
       FROM personal_event_shares s JOIN users u ON u.id = s.user_id
       WHERE s.event_id IN (${placeholders})`,
      ownedIds
    ) as Array<{ event_id: string; user_id: string; name: string }>;
    for (const r of shareRows) {
      const arr = sharesByEvent.get(r.event_id) || [];
      arr.push({ id: r.user_id, name: r.name });
      sharesByEvent.set(r.event_id, arr);
    }
  }

  const ownedOut = owned.map((r) => {
    const shared_with = sharesByEvent.get(r.id) || [];
    return { ...r, is_owner: true, shared: shared_with.length > 0, shared_with, can_edit: true };
  });
  const sharedOut = sharedIn.map((r) => ({
    ...r, is_owner: false, shared: true, owner_id: r.user_id, can_edit: true, shared_with: [],
  }));

  res.json({ success: true, data: [...ownedOut, ...sharedOut] });
});

// 共有先を同期する (作成者のみ。渡された user_ids に完全一致させる)
async function syncShares(eventId: string, ownerId: string, userIds: unknown): Promise<void> {
  if (!Array.isArray(userIds)) return;
  const ids = [...new Set(userIds.map((x) => String(x)).filter((x) => x && x !== ownerId))];
  const existing = await queryAll(
    `SELECT user_id FROM personal_event_shares WHERE event_id = ?`, [eventId]
  ) as Array<{ user_id: string }>;
  const existingSet = new Set(existing.map((r) => r.user_id));
  const nextSet = new Set(ids);
  // 追加
  for (const uid of ids) {
    if (!existingSet.has(uid)) {
      await execute(
        `INSERT INTO personal_event_shares (id, event_id, user_id, created_by) VALUES (?, ?, ?, ?)
         ON CONFLICT (event_id, user_id) DO NOTHING`,
        [randomUUID(), eventId, uid, ownerId]
      );
    }
  }
  // 削除
  for (const uid of existingSet) {
    if (!nextSet.has(uid)) {
      await execute(`DELETE FROM personal_event_shares WHERE event_id = ? AND user_id = ?`, [eventId, uid]);
    }
  }
}

// 作成 (手入力のみ)。share_user_ids で共有先を指定可。連携済み外部カレンダーへ書き戻し。
router.post('/personal', ...canUse, async (req, res) => {
  const { title, all_day, start_time, end_time, location, notes, share_user_ids } = req.body ?? {};
  if (!title || !start_time || !end_time) throw new AppError(400, 'VALIDATION_ERROR', 'タイトル・開始・終了は必須です');
  const id = randomUUID();
  const me = req.user!.id;
  await execute(
    `INSERT INTO personal_events (id, user_id, title, all_day, start_time, end_time, location, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
    [id, me, String(title).slice(0, 300), all_day ? 1 : 0, String(start_time), String(end_time),
     location ? String(location).slice(0, 300) : null, notes ? String(notes).slice(0, 1000) : null]
  );

  await syncShares(id, me, share_user_ids);

  // 外部カレンダーへ書き戻し (best-effort)
  const row = await queryOne(`SELECT * FROM personal_events WHERE id = ?`, [id]) as any;
  const pushed = await pushToExternal(me, toManualInput(row));
  if (pushed) {
    await execute(
      `UPDATE personal_events SET external_provider=?, external_event_id=?, external_synced_at=NOW() WHERE id=?`,
      [pushed.provider, pushed.externalId, id]
    );
  }

  res.status(201).json({ success: true, data: await queryOne(`SELECT * FROM personal_events WHERE id = ?`, [id]) });
});

// 更新 (作成者 or 共有メンバー)。ICS/Google/Outlook 同期分は不可。外部書き戻しに反映。
router.put('/personal/:id', ...canUse, async (req, res) => {
  const me = req.user!.id;
  const existing = await queryOne(
    `SELECT * FROM personal_events WHERE id = ? AND deleted_at IS NULL`,
    [String(req.params.id)]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '予定が見つかりません');

  const isOwner = existing.user_id === me;
  if (!isOwner) {
    const share = await queryOne(
      `SELECT id FROM personal_event_shares WHERE event_id = ? AND user_id = ?`, [existing.id, me]) as any;
    if (!share) throw new AppError(404, 'NOT_FOUND', '予定が見つかりません');
  }
  if (existing.source === 'ics' || existing.source === 'google' || existing.source === 'outlook') {
    throw new AppError(400, 'VALIDATION_ERROR', '同期された予定は編集できません (Outlook/Google 側で編集してください)');
  }

  const b = req.body ?? {};
  await execute(
    `UPDATE personal_events SET title=?, all_day=?, start_time=?, end_time=?, location=?, notes=?, updated_at=NOW() WHERE id=?`,
    [b.title != null ? String(b.title).slice(0, 300) : existing.title,
     b.all_day != null ? (b.all_day ? 1 : 0) : existing.all_day,
     b.start_time != null ? String(b.start_time) : existing.start_time,
     b.end_time != null ? String(b.end_time) : existing.end_time,
     b.location !== undefined ? (b.location ? String(b.location).slice(0, 300) : null) : existing.location,
     b.notes !== undefined ? (b.notes ? String(b.notes).slice(0, 1000) : null) : existing.notes,
     existing.id]
  );

  // 共有先の変更は作成者のみ
  if (isOwner && b.share_user_ids !== undefined) {
    await syncShares(existing.id, existing.user_id, b.share_user_ids);
  }

  // 外部書き戻しは作成者のカレンダーへ反映 (共有メンバーの編集も作成者側に反映される)
  const updated = await queryOne(`SELECT * FROM personal_events WHERE id = ?`, [existing.id]) as any;
  if (updated.external_provider && updated.external_event_id) {
    await updateExternal(existing.user_id, updated.external_provider, updated.external_event_id, toManualInput(updated));
    await execute(`UPDATE personal_events SET external_synced_at=NOW() WHERE id=?`, [existing.id]);
  }

  res.json({ success: true, data: updated });
});

// 削除。作成者は予定を論理削除 (外部からも削除)。共有メンバーは自分の共有を外すのみ。
router.delete('/personal/:id', ...canUse, async (req, res) => {
  const me = req.user!.id;
  const existing = await queryOne(
    `SELECT * FROM personal_events WHERE id = ? AND deleted_at IS NULL`,
    [String(req.params.id)]) as any;
  if (!existing) throw new AppError(404, 'NOT_FOUND', '予定が見つかりません');

  if (existing.user_id === me) {
    // 作成者: 予定全体を削除 (外部・共有も)
    if (existing.external_provider && existing.external_event_id && existing.source === 'manual') {
      await deleteExternal(existing.user_id, existing.external_provider, existing.external_event_id);
    }
    await execute(`DELETE FROM personal_event_shares WHERE event_id = ?`, [existing.id]);
    await execute(`UPDATE personal_events SET deleted_at=NOW(), updated_at=NOW() WHERE id=?`, [existing.id]);
    res.json({ success: true, data: { deleted: true } });
    return;
  }

  // 共有メンバー: 自分の共有だけ解除 (予定自体は残す)
  const share = await queryOne(
    `SELECT id FROM personal_event_shares WHERE event_id = ? AND user_id = ?`, [existing.id, me]) as any;
  if (!share) throw new AppError(404, 'NOT_FOUND', '予定が見つかりません');
  await execute(`DELETE FROM personal_event_shares WHERE event_id = ? AND user_id = ?`, [existing.id, me]);
  res.json({ success: true, data: { left: true } });
});

// ─── ICS 購読フィード ─────────────────────────────────────────────────────────

function feedForClient(row: any) {
  // URL は秘密情報のため復号したうえで末尾 4 文字だけマスク表示
  const url = decrypt(row.url_enc);
  return {
    id: row.id, label: row.label, enabled: !!row.enabled,
    url_masked: mask(url), last_synced_at: row.last_synced_at,
    last_error: row.last_error, event_count: row.event_count, created_at: row.created_at,
  };
}

// フィード一覧
router.get('/feeds', ...canUse, async (req, res) => {
  const rows = await queryAll(
    `SELECT * FROM personal_ics_feeds WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at`,
    [req.user!.id]) as any[];
  res.json({ success: true, data: rows.map(feedForClient) });
});

/**
 * 保存する URL。**取得にそのまま使うので、削るのは webcal → https だけ**。
 *
 * ここで形を整えてはいけない。URL に埋め込んだ資格情報 (`https://user:pass@host/…`) は
 * Nextcloud / Zimbra / CalDAV 系が普通に配る形で、axios はそれを Basic 認証に使う
 * (`axios/dist/node/axios.cjs` の `if (!auth && (parsed.username || parsed.password))`)。
 * 末尾のスラッシュが意味を持つ提供元もある。**突合のための整形は別関数** (下の
 * `feedCompareKey`) に分け、保存と取得には触れないこと。
 */
function storableFeedUrl(raw: string): string {
  return String(raw ?? '').trim().replace(/^webcal:\/\//i, 'https://');
}

/**
 * 購読 URL を突き合わせるための鍵 (v3.1.2)。**保存はしない・取得にも使わない**。
 *
 * `url_enc` は AES-GCM で毎回ランダムな IV を使うので、**同じ URL でも暗号文は毎回違う**。
 * 列に一意索引を張っても効かないため、登録時にその人の既存フィードを復号して
 * この鍵に揃えたもので比べる (1人あたり数件なので現実的なコスト)。
 *
 * 畳むのは「同じ URL の書き方の違い」だけに留める:
 *   - webcal:// → https://    (同じフィードの別スキーム表記)
 *   - スキームとホストは小文字 (RFC 上 case-insensitive)
 *   - 末尾のスラッシュと `#fragment` を落とす
 *
 * **畳まないもの**:
 *   - パスとクエリの大小 — Google の「iCal 形式の非公開 URL」はパスに秘密の文字列が
 *     入っており、小文字化すると別のフィードを同一と誤判定する
 *   - 資格情報 (`user:pass@`) — 同じホスト・同じパスでも**利用者が違えば別のカレンダー**
 */
export function feedCompareKey(raw: string): string {
  const trimmed = storableFeedUrl(raw);
  try {
    const u = new URL(trimmed);
    const auth = u.username || u.password ? `${u.username}:${u.password}@` : '';
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol.toLowerCase()}//${auth}${u.hostname.toLowerCase()}${u.port ? `:${u.port}` : ''}${path}${u.search}`;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

/**
 * ONAiR 自身が出しているカレンダーを「自分の予定」として購読しようとしていないか。
 *
 * スタジオ予約の ICS を配る URL と ICS を追加する欄が同じヘッダーに隣接しているため、
 * 実際に取り違えられる。取り込むと **スタジオ予約が「自分」レイヤーにも複製されて出る**
 * (しかも `【本番】案件名 (26/08/12)｜ラベル` という別表記になる)。
 */
function isOwnCalendarUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (/\/studios\/calendar\.ics$/i.test(u.pathname)) return true;
    const clientUrl = process.env.CLIENT_URL;
    if (clientUrl) {
      const own = new URL(clientUrl);
      if (own.hostname.toLowerCase() === u.hostname.toLowerCase()) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// フィード追加 (body: { label, url }) — 追加後すぐに初回同期を試みる
router.post('/feeds', ...canUse, async (req, res) => {
  const { label, url } = req.body ?? {};
  if (!label || !url) throw new AppError(400, 'VALIDATION_ERROR', 'ラベルと ICS URL は必須です');
  // **保存する値は削らない** (資格情報つき URL や末尾スラッシュが意味を持つ提供元があるため)
  const normalized = storableFeedUrl(String(url));
  if (!/^https:\/\//i.test(normalized)) throw new AppError(400, 'VALIDATION_ERROR', 'https:// (または webcal://) で始まる公開 ICS URL を入力してください');

  // ONAiR 自身のカレンダーは購読させない (取り込むと予約が二重に見える)
  if (isOwnCalendarUrl(normalized)) {
    throw new AppError(400, 'OWN_CALENDAR', 'これは ONAiR 自身が出しているカレンダーの URL です。ここに入れると同じ予定が「自分の予定」としてもう1件並んでしまいます。スタジオ予約はカレンダーにそのまま出ているので、購読は不要です');
  }

  // 同じ URL を2回登録させない (登録できてしまうと、以後その人のすべての予定が2行になる)。
  // 比べるのは整形した鍵だけで、保存する値には触らない。
  const key = feedCompareKey(normalized);
  const mine = await queryAll(
    `SELECT id, label, url_enc FROM personal_ics_feeds WHERE user_id = ? AND deleted_at IS NULL`,
    [req.user!.id]) as Array<{ id: string; label: string; url_enc: string }>;
  for (const f of mine) {
    const plain = decrypt(f.url_enc);
    // 復号できない行 (鍵を入れ替えた等) は突合できない。**黙って通さず**理由を返す —
    // 通すと「以後すべての予定が2行」になり、原因が分からないまま残る。
    if (!plain) {
      throw new AppError(400, 'FEED_UNREADABLE', `既に登録されている「${f.label}」の URL を読めないため、同じ URL かどうか確かめられません。「${f.label}」の連携を解除してから登録し直してください`);
    }
    if (feedCompareKey(plain) === key) {
      throw new AppError(400, 'DUPLICATE_FEED', `この URL は「${f.label}」として既に登録されています。同じ URL を2回登録すると、同じ予定が2件ずつ並びます`);
    }
  }

  let urlEnc: string;
  try {
    urlEnc = encrypt(normalized);
  } catch {
    throw new AppError(500, 'ENCRYPTION_UNAVAILABLE', 'サーバーの暗号化設定 (ENCRYPTION_KEY) が未構成のため保存できません。管理者に連絡してください');
  }

  const id = randomUUID();
  await execute(
    `INSERT INTO personal_ics_feeds (id, user_id, label, url_enc) VALUES (?, ?, ?, ?)`,
    [id, req.user!.id, String(label).slice(0, 100), urlEnc]
  );

  // 初回同期 (失敗しても登録自体は成立。エラーは last_error に記録されて一覧に出る)
  let sync: unknown = null;
  try { sync = await syncFeedById(id); } catch { /* last_error に記録済み */ }

  const row = await queryOne(`SELECT * FROM personal_ics_feeds WHERE id = ?`, [id]) as any;
  res.status(201).json({ success: true, data: { ...feedForClient(row), sync } });
});

// 手動即時同期
router.post('/feeds/:id/sync', ...canUse, async (req, res) => {
  const feed = await queryOne(
    `SELECT id FROM personal_ics_feeds WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [String(req.params.id), req.user!.id]) as any;
  if (!feed) throw new AppError(404, 'NOT_FOUND', 'フィードが見つかりません');
  try {
    const result = await syncFeedById(feed.id);
    res.json({ success: true, data: result });
  } catch (err) {
    throw new AppError(400, 'SYNC_FAILED', `同期に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// フィード削除 (同期済みの予定も一括 soft-delete)
router.delete('/feeds/:id', ...canUse, async (req, res) => {
  const feed = await queryOne(
    `SELECT id FROM personal_ics_feeds WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [String(req.params.id), req.user!.id]) as any;
  if (!feed) throw new AppError(404, 'NOT_FOUND', 'フィードが見つかりません');
  await execute(`UPDATE personal_ics_feeds SET deleted_at=NOW(), updated_at=NOW() WHERE id=?`, [feed.id]);
  await execute(`UPDATE personal_events SET deleted_at=NOW(), updated_at=NOW() WHERE feed_id=? AND deleted_at IS NULL`, [feed.id]);
  res.json({ success: true, data: { deleted: true } });
});

export default router;

import { Router } from 'express';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryOne, execute } from '../../../shared/db/connection';
import { config } from '../../../config';
import { encrypt } from '../../liveops/crypto';
import {
  isMsConfigured,
  msAuthorizeUrl,
  MS_SCOPE,
  exchangeCodeForTokens,
  emailFromIdToken,
  syncMsAccount,
  syncMsForUser,
} from '../services/ms-calendar.service';

// マイカレンダー Outlook (Microsoft 365) カレンダー OAuth 連携。
//   GET  /schedule/ms/status   — 連携状態
//   GET  /schedule/ms/start    — Microsoft 認可画面へ 302 (state で CSRF 防止)
//   GET  /schedule/ms/callback — 認可コード → refresh_token 保存 + 即時同期 → マイカレンダーへ
//   POST /schedule/ms/sync     — 手動即時同期
//   DELETE /schedule/ms        — 連携解除 (アカウント + 同期済み予定を soft-delete)
//
// google-oauth.routes と対称。callback は requireAuth のみ (cookie 認証、CSRF は state)。

const router = Router();
const canUse = [requireAuth, requirePermission('sales', 'editor')] as const;
const STATE_TTL_MS = 10 * 60 * 1000;

function signState(userId: string): string {
  const payload = `${userId}:${randomUUID()}:${Date.now()}`;
  const b64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = createHmac('sha256', config.jwtSecret).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifyState(state: string, expectedUserId: string): boolean {
  if (!state || !state.includes('.')) return false;
  const [b64, sig] = state.split('.');
  const expectedSig = createHmac('sha256', config.jwtSecret).update(b64).digest('base64url');
  const a = Buffer.from(sig || '', 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const [userId, , issuedAtStr] = Buffer.from(b64, 'base64url').toString('utf8').split(':');
    if (userId !== expectedUserId) return false;
    const issuedAt = Number(issuedAtStr);
    if (!issuedAt || Date.now() - issuedAt > STATE_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

// 連携状態
router.get('/ms/status', ...canUse, async (req, res) => {
  const configured = isMsConfigured();
  const acct = await queryOne(
    `SELECT ms_email, last_synced_at, last_error, event_count, can_write
     FROM personal_ms_accounts WHERE user_id = ? AND deleted_at IS NULL`,
    [req.user!.id]
  ) as any;
  res.json({
    success: true,
    data: {
      configured,
      connected: !!acct,
      email: acct?.ms_email ?? null,
      last_synced_at: acct?.last_synced_at ?? null,
      last_error: acct?.last_error ?? null,
      event_count: acct?.event_count ?? null,
      can_write: !!acct?.can_write,
    },
  });
});

// 認可開始 → Microsoft へ 302
router.get('/ms/start', ...canUse, (req, res) => {
  if (!isMsConfigured()) {
    throw new AppError(503, 'MS_NOT_CONFIGURED', 'Outlook 連携が未設定です (管理者に MS_CLIENT_ID の設定を依頼してください)');
  }
  const state = signState(req.user!.id);
  const params = new URLSearchParams({
    client_id: config.msClientId,
    response_type: 'code',
    redirect_uri: config.msOAuthRedirect,
    response_mode: 'query',
    scope: MS_SCOPE,
    prompt: 'select_account',
    state,
  });
  if (req.user!.email) params.set('login_hint', req.user!.email);
  res.redirect(`${msAuthorizeUrl()}?${params.toString()}`);
});

// コールバック (requireAuth のみ)
router.get('/ms/callback', requireAuth, async (req, res) => {
  // **戻り先は ④ 設定／外部カレンダー。** 旧「自分の予定」(`/studio/my-calendar`) は
  // v4 ネイティブUI化（バックログB）で退役した。連携の状態を出す画面はここへ移設済み
  // （`CalendarSettingsPage.tsx` の `feed` タブ・`FeedsTab.tsx`）
  const back = (status: 'linked' | 'error') => res.redirect(`${config.clientUrl}/studio/settings?tab=feed&outlook=${status}`);
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (req.query.error || !code) return back('error');
    if (!isMsConfigured()) return back('error');
    if (!verifyState(state, req.user!.id)) return back('error');

    const tokens = await exchangeCodeForTokens(code);
    const email = emailFromIdToken(tokens.id_token);
    // 付与されたスコープに Calendars.ReadWrite が含まれていれば書き戻し可
    const grantedScope = String((tokens as any).scope || '');
    const canWrite = /Calendars\.ReadWrite/i.test(grantedScope) ? 1 : 0;

    // user_id は UNIQUE なので、解除済み (deleted_at セット) の行も含めて既存行を探す。
    // deleted_at IS NULL で絞ると、一度解除した人の再連携で INSERT に回り UNIQUE 違反になる。
    const existing = await queryOne(
      `SELECT id, refresh_token_enc FROM personal_ms_accounts WHERE user_id = ?`,
      [req.user!.id]
    ) as { id: string; refresh_token_enc: string } | undefined;

    const refreshEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.refresh_token_enc;
    if (!refreshEnc) return back('error');

    let accountId: string;
    if (existing) {
      accountId = existing.id;
      // 解除済みの行なら deleted_at=NULL で復活させる
      await execute(
        `UPDATE personal_ms_accounts
         SET ms_email=?, refresh_token_enc=?, access_token_enc=NULL, token_expiry=NULL,
             enabled=1, last_error=NULL, can_write=?, deleted_at=NULL, updated_at=NOW()
         WHERE id=?`,
        [email, refreshEnc, canWrite, accountId]
      );
    } else {
      accountId = randomUUID();
      await execute(
        `INSERT INTO personal_ms_accounts (id, user_id, ms_email, refresh_token_enc, can_write)
         VALUES (?, ?, ?, ?, ?)`,
        [accountId, req.user!.id, email, refreshEnc, canWrite]
      );
    }

    try { await syncMsAccount(accountId); } catch { /* last_error に記録済み */ }
    return back('linked');
  } catch (err) {
    console.warn('[ms-oauth] callback failed:', err instanceof Error ? err.message : err);
    return back('error');
  }
});

// 手動即時同期
router.post('/ms/sync', ...canUse, async (req, res) => {
  try {
    const result = await syncMsForUser(req.user!.id);
    if (!result) throw new AppError(404, 'NOT_CONNECTED', 'Outlook カレンダーが未連携です');
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'SYNC_FAILED', `同期に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// 連携解除 (アカウント + 同期済み予定を一括 soft-delete)
router.delete('/ms', ...canUse, async (req, res) => {
  const acct = await queryOne(
    `SELECT id FROM personal_ms_accounts WHERE user_id = ? AND deleted_at IS NULL`,
    [req.user!.id]
  ) as { id: string } | undefined;
  if (!acct) throw new AppError(404, 'NOT_CONNECTED', 'Outlook カレンダーが未連携です');

  await execute(`UPDATE personal_ms_accounts SET deleted_at=NOW(), enabled=0, updated_at=NOW() WHERE id=?`, [acct.id]);
  await execute(`UPDATE personal_events SET deleted_at=NOW(), updated_at=NOW() WHERE ms_account_id=? AND deleted_at IS NULL`, [acct.id]);
  res.json({ success: true, data: { deleted: true } });
});

export default router;

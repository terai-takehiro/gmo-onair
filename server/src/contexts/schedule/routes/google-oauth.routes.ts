import { Router } from 'express';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryOne, execute } from '../../../shared/db/connection';
import { config } from '../../../config';
import { encrypt, decrypt } from '../../liveops/crypto';
import {
  isGoogleConfigured,
  exchangeCodeForTokens,
  emailFromIdToken,
  revokeToken,
  syncGoogleAccount,
  syncGoogleForUser,
} from '../services/google-calendar.service';

// マイカレンダー Google カレンダー OAuth 連携。
//   GET  /schedule/google/status   — 連携状態 (configured / connected / email / 最終同期 …)
//   GET  /schedule/google/start    — Google 認可画面へ 302 リダイレクト (state で CSRF 防止)
//   GET  /schedule/google/callback — 認可コード → refresh_token 保存 + 即時同期 → マイカレンダーへ
//   POST /schedule/google/sync     — 手動即時同期
//   DELETE /schedule/google        — 連携解除 (revoke + 同期済み予定 soft-delete)
//
// callback は Google からのトップレベル GET リダイレクトで叩かれるため、
// requirePermission (403 で block) は付けず requireAuth のみ (認証は cookie、CSRF は state)。

const router = Router();
const canUse = [requireAuth, requirePermission('partner_schedule', 'editor')] as const;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// calendar.events = イベントの読み取り + 書き込み (取込と ONAiR→Google の書き戻しの両方に必要)。
// 旧 calendar.readonly で連携済みのアカウントは can_write=0 のまま → UI が再連携を促す。
const SCOPE = 'https://www.googleapis.com/auth/calendar.events openid email';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 分

// state = base64url(payload).hmac  (payload = userId:nonce:issuedAt)
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
router.get('/google/status', ...canUse, async (req, res) => {
  const configured = isGoogleConfigured();
  const acct = await queryOne(
    `SELECT google_email, last_synced_at, last_error, event_count, can_write
     FROM personal_google_accounts WHERE user_id = ? AND deleted_at IS NULL`,
    [req.user!.id]
  ) as any;
  res.json({
    success: true,
    data: {
      configured,
      connected: !!acct,
      email: acct?.google_email ?? null,
      last_synced_at: acct?.last_synced_at ?? null,
      last_error: acct?.last_error ?? null,
      event_count: acct?.event_count ?? null,
      can_write: !!acct?.can_write,
    },
  });
});

// 認可開始 → Google へ 302
router.get('/google/start', ...canUse, (req, res) => {
  if (!isGoogleConfigured()) {
    throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google 連携が未設定です (管理者に GOOGLE_CLIENT_ID の設定を依頼してください)');
  }
  const state = signState(req.user!.id);
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleOAuthRedirect,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (req.user!.email) params.set('login_hint', req.user!.email);
  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

// コールバック (requireAuth のみ — Google からのトップレベル GET、認証は cookie)
router.get('/google/callback', requireAuth, async (req, res) => {
  const back = (status: 'linked' | 'error') => res.redirect(`${config.clientUrl}/studio/my-calendar?google=${status}`);
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (req.query.error || !code) return back('error');
    if (!isGoogleConfigured()) return back('error');
    if (!verifyState(state, req.user!.id)) return back('error');

    const tokens = await exchangeCodeForTokens(code);
    const email = emailFromIdToken(tokens.id_token);
    // 付与されたスコープに calendar.events (書込) が含まれていれば書き戻し可
    const grantedScope = String((tokens as any).scope || '');
    const canWrite = /calendar\.events|auth\/calendar(\s|$)/.test(grantedScope) ? 1 : 0;

    const existing = await queryOne(
      `SELECT id, refresh_token_enc FROM personal_google_accounts WHERE user_id = ? AND deleted_at IS NULL`,
      [req.user!.id]
    ) as { id: string; refresh_token_enc: string } | undefined;

    // Google は再連携時に refresh_token を返さないことがある → 既存を温存
    const refreshEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.refresh_token_enc;
    if (!refreshEnc) return back('error'); // 初回で refresh_token が取れなければ失敗扱い

    let accountId: string;
    if (existing) {
      accountId = existing.id;
      await execute(
        `UPDATE personal_google_accounts
         SET google_email=?, refresh_token_enc=?, access_token_enc=NULL, token_expiry=NULL,
             enabled=1, last_error=NULL, can_write=?, updated_at=NOW()
         WHERE id=?`,
        [email, refreshEnc, canWrite, accountId]
      );
    } else {
      accountId = randomUUID();
      await execute(
        `INSERT INTO personal_google_accounts (id, user_id, google_email, refresh_token_enc, can_write)
         VALUES (?, ?, ?, ?, ?)`,
        [accountId, req.user!.id, email, refreshEnc, canWrite]
      );
    }

    // 即時同期 (失敗しても連携自体は成立、エラーは last_error に記録)
    try { await syncGoogleAccount(accountId); } catch { /* last_error に記録済み */ }
    return back('linked');
  } catch (err) {
    console.warn('[google-oauth] callback failed:', err instanceof Error ? err.message : err);
    return back('error');
  }
});

// 手動即時同期
router.post('/google/sync', ...canUse, async (req, res) => {
  try {
    const result = await syncGoogleForUser(req.user!.id);
    if (!result) throw new AppError(404, 'NOT_CONNECTED', 'Google カレンダーが未連携です');
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'SYNC_FAILED', `同期に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
  }
});

// 連携解除 (revoke + 同期済み予定を一括 soft-delete)
router.delete('/google', ...canUse, async (req, res) => {
  const acct = await queryOne(
    `SELECT id, refresh_token_enc FROM personal_google_accounts WHERE user_id = ? AND deleted_at IS NULL`,
    [req.user!.id]
  ) as { id: string; refresh_token_enc: string } | undefined;
  if (!acct) throw new AppError(404, 'NOT_CONNECTED', 'Google カレンダーが未連携です');

  const token = decrypt(acct.refresh_token_enc);
  if (token) await revokeToken(token);

  await execute(`UPDATE personal_google_accounts SET deleted_at=NOW(), enabled=0, updated_at=NOW() WHERE id=?`, [acct.id]);
  await execute(`UPDATE personal_events SET deleted_at=NOW(), updated_at=NOW() WHERE google_account_id=? AND deleted_at IS NULL`, [acct.id]);
  res.json({ success: true, data: { deleted: true } });
});

export default router;

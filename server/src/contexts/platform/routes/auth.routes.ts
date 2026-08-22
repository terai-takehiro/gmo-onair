import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { queryOne, queryAll, execute } from '../../../shared/db/connection';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { signToken } from '../../../shared/auth/jwt';
import { hashPassword, verifyPassword } from '../../../shared/auth/password';
import { sendSms, generateOtp } from '../../../shared/auth/sms';
import { sendMail } from '../../../shared/auth/email';
import { config } from '../../../config';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'リクエスト回数が上限に達しました。しばらく待ってください。' } },
  skipSuccessfulRequests: true,
});

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '認証コードの入力回数が上限に達しました。' } },
});

const OTP_EXPIRES_MINUTES = 5;

// パスワード強度チェック
function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'パスワードは8文字以上です';
  if (!/[a-zA-Z]/.test(pw)) return 'パスワードに英字を含めてください';
  if (!/[0-9]/.test(pw)) return 'パスワードに数字を含めてください';
  return null;
}

// ============================================================
// 認証モード情報
// ============================================================
router.get('/mode', (_req, res) => {
  res.json({ success: true, data: { mode: config.authMode } });
});

// ============================================================
// 招待 (system_admin のみ)
// ============================================================
router.post('/invite', requireAuth, requireRole('system_admin'), wrap(async (req, res) => {
  const { email, name, role, phone, permissions } = req.body;
  if (!email || !name) throw new AppError(400, 'VALIDATION_ERROR', 'メールアドレスと氏名は必須です');

  // 既存チェック
  const existing = await queryOne('SELECT id, status FROM users WHERE email = ? AND deleted_at IS NULL', [email]) as any;
  if (existing) {
    if (existing.status === 'invited') {
      // 再招待 — トークン再発行
    } else {
      throw new AppError(409, 'ALREADY_EXISTS', 'このメールアドレスは既に登録されています');
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7日

  if (existing) {
    // 再招待
    await execute(
      `UPDATE users SET name=?, role=?, phone=?, invitation_token=?, invitation_expires_at=?, status='invited', updated_at=NOW() WHERE id=?`,
      [name, role || 'staff', phone || null, token, expiresAt.toISOString(), existing.id],
    );
  } else {
    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO users (id, name, email, role, phone, status, invitation_token, invitation_expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'invited', ?, ?, ?)`,
      [id, name, email, role || 'staff', phone || null, token, expiresAt.toISOString(), (req.user as any)?.id],
    );

    // 権限設定
    if (permissions && typeof permissions === 'object') {
      for (const [module, level] of Object.entries(permissions)) {
        await execute(
          `INSERT INTO user_permissions (id, user_id, module, access_level) VALUES (?, ?, ?, ?)`,
          [crypto.randomUUID(), existing?.id || id, module, level],
        );
      }
    }
  }

  // 招待メール送信
  const clientUrl = process.env.CLIENT_URL || config.clientUrl || 'http://localhost:5173';
  const inviteUrl = `${clientUrl}/auth/accept-invitation?token=${token}`;
  await sendMail({
    to: email,
    subject: 'GMO ONAiR — アカウント招待',
    html: `
      <h2>GMO ONAiR へようこそ</h2>
      <p><strong>${name}</strong> 様</p>
      <p>GMO ONAiR へ招待されました。下記のリンクからパスワードを設定してください。</p>
      <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#005bac;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">アカウントを有効化</a></p>
      <p style="color:#666;font-size:12px;">このリンクは7日間有効です。</p>
      <hr>
      <p style="color:#999;font-size:11px;">GMO GLOBAL STUDIO</p>
    `,
  });

  res.status(201).json({ success: true, message: `${email} に招待メールを送信しました` });
}));

// ============================================================
// 招待受諾 — パスワード設定
// ============================================================
router.get('/invitation', wrap(async (req, res) => {
  const token = req.query.token as string;
  if (!token) throw new AppError(400, 'VALIDATION_ERROR', 'トークンが必要です');
  const user = await queryOne(
    `SELECT id, name, email, status, invitation_expires_at FROM users
     WHERE invitation_token = ? AND deleted_at IS NULL`,
    [token],
  ) as any;
  if (!user) throw new AppError(404, 'NOT_FOUND', '無効な招待リンクです');
  if (user.status !== 'invited') throw new AppError(400, 'ALREADY_ACCEPTED', '既にアカウントが有効化されています');
  if (new Date(user.invitation_expires_at) < new Date()) throw new AppError(410, 'EXPIRED', '招待リンクの有効期限が切れています');
  res.json({ success: true, data: { name: user.name, email: user.email } });
}));

router.post('/accept-invitation', authLimiter, wrap(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) throw new AppError(400, 'VALIDATION_ERROR', 'トークンとパスワードは必須です');
  const pwErr = validatePassword(password);
  if (pwErr) throw new AppError(400, 'VALIDATION_ERROR', pwErr);

  const user = await queryOne(
    `SELECT id, email, status, invitation_expires_at FROM users
     WHERE invitation_token = ? AND deleted_at IS NULL`,
    [token],
  ) as any;
  if (!user) throw new AppError(404, 'NOT_FOUND', '無効な招待リンクです');
  if (user.status !== 'invited') throw new AppError(400, 'ALREADY_ACCEPTED', '既にアカウントが有効化されています');
  if (new Date(user.invitation_expires_at) < new Date()) throw new AppError(410, 'EXPIRED', '招待リンクの有効期限が切れています');

  const hash = await hashPassword(password);
  await execute(
    `UPDATE users SET password_hash=?, status='active', invitation_token=NULL, invitation_accepted_at=NOW(), updated_at=NOW() WHERE id=?`,
    [hash, user.id],
  );

  res.json({ success: true, message: 'アカウントが有効化されました。ログインしてください。' });
}));

// ============================================================
// ログイン Step 1: Email + Password → SMS OTP送信
// ============================================================
router.post('/login', authLimiter, wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError(400, 'VALIDATION_ERROR', 'メールアドレスとパスワードは必須です');

  // ログイン試行記録
  const ip = req.ip || req.socket.remoteAddress || '';

  const user = await queryOne(
    `SELECT id, name, email, role, password_hash, phone, status FROM users WHERE email = ? AND deleted_at IS NULL`,
    [email],
  ) as any;

  if (!user || !user.password_hash) {
    await execute('INSERT INTO login_attempts (email, ip_address, success) VALUES (?, ?, false)', [email, ip]);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'メールアドレスまたはパスワードが正しくありません');
  }
  if (user.status === 'invited') throw new AppError(403, 'NOT_ACTIVATED', 'アカウントが未有効化です。招待メールのリンクからパスワードを設定してください。');
  if (user.status === 'disabled') throw new AppError(403, 'DISABLED', 'アカウントが無効化されています。管理者にお問い合わせください。');

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await execute('INSERT INTO login_attempts (email, ip_address, success) VALUES (?, ?, false)', [email, ip]);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'メールアドレスまたはパスワードが正しくありません');
  }

  // パスワードOK — 2FA
  if (user.phone) {
    // SMS OTP送信
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

    // 既存の未使用コードを無効化
    await execute(`UPDATE verification_codes SET used_at=NOW() WHERE user_id=? AND type='sms' AND used_at IS NULL`, [user.id]);
    await execute(
      `INSERT INTO verification_codes (user_id, code, type, expires_at) VALUES (?, ?, 'sms', ?)`,
      [user.id, code, expiresAt.toISOString()],
    );

    await sendSms(user.phone, `GMO ONAiR 認証コード: ${code}\n${OTP_EXPIRES_MINUTES}分以内に入力してください。`);

    res.json({
      success: true,
      data: {
        requires_2fa: true,
        user_id: user.id,
        phone_masked: user.phone.replace(/(.{3})(.*)(.{4})/, '$1****$3'),
      },
    });
    return;
  }

  // 電話番号未設定 → 2FAスキップ(パスワードのみでログイン)
  await execute('INSERT INTO login_attempts (email, ip_address, success) VALUES (?, ?, true)', [email, ip]);
  await execute('UPDATE users SET last_login_at=NOW() WHERE id=?', [user.id]);

  const jwtToken = signToken({ userId: user.id, email: user.email, role: user.role, name: user.name });
  res.cookie('gmo_onair_token', jwtToken, {
    domain: process.env.COOKIE_DOMAIN || undefined,
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  const isProduction = process.env.NODE_ENV === 'production';
  res.json({
    success: true,
    data: isProduction
      ? { requires_2fa: false }
      : { token: jwtToken, requires_2fa: false },
  });
}));

// ============================================================
// ログイン Step 2: SMS OTP検証 → JWT発行
// ============================================================
router.post('/verify-2fa', otpLimiter, wrap(async (req, res) => {
  const { user_id, code } = req.body;
  if (!user_id || !code) throw new AppError(400, 'VALIDATION_ERROR', 'ユーザーIDと認証コードは必須です');

  const vc = await queryOne(
    `SELECT id, code, expires_at FROM verification_codes
     WHERE user_id = ? AND type = 'sms' AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [user_id],
  ) as any;
  if (!vc) throw new AppError(401, 'INVALID_CODE', '認証コードが見つかりません。再度ログインしてください。');
  if (new Date(vc.expires_at) < new Date()) throw new AppError(401, 'EXPIRED', '認証コードの有効期限が切れています。再度ログインしてください。');
  if (vc.code !== String(code).trim()) throw new AppError(401, 'INVALID_CODE', '認証コードが正しくありません');

  // コードを使用済みに
  await execute('UPDATE verification_codes SET used_at=NOW() WHERE id=?', [vc.id]);

  const user = await queryOne('SELECT id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL', [user_id]) as any;
  if (!user) throw new AppError(404, 'NOT_FOUND', 'ユーザーが見つかりません');

  const ip = req.ip || req.socket.remoteAddress || '';
  await execute('INSERT INTO login_attempts (email, ip_address, success) VALUES (?, ?, true)', [user.email, ip]);
  await execute('UPDATE users SET last_login_at=NOW() WHERE id=?', [user.id]);

  const jwtToken = signToken({ userId: user.id, email: user.email, role: user.role, name: user.name });
  res.cookie('gmo_onair_token', jwtToken, {
    domain: process.env.COOKIE_DOMAIN || undefined,
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  const isProduction = process.env.NODE_ENV === 'production';
  res.json({
    success: true,
    data: isProduction ? {} : { token: jwtToken },
  });
}));

// ============================================================
// OTP再送信
// ============================================================
router.post('/resend-otp', authLimiter, wrap(async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) throw new AppError(400, 'VALIDATION_ERROR', 'user_idは必須です');
  const user = await queryOne('SELECT id, phone FROM users WHERE id = ? AND deleted_at IS NULL', [user_id]) as any;
  if (!user?.phone) throw new AppError(400, 'NO_PHONE', '電話番号が登録されていません');

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);
  await execute(`UPDATE verification_codes SET used_at=NOW() WHERE user_id=? AND type='sms' AND used_at IS NULL`, [user_id]);
  await execute(`INSERT INTO verification_codes (user_id, code, type, expires_at) VALUES (?, ?, 'sms', ?)`, [user_id, code, expiresAt.toISOString()]);
  await sendSms(user.phone, `GMO ONAiR 認証コード: ${code}\n${OTP_EXPIRES_MINUTES}分以内に入力してください。`);
  res.json({ success: true, message: '認証コードを再送信しました' });
}));

// ============================================================
// Mock Login (開発用 — authMode === 'mock' 時のみ)
// ============================================================
router.post('/mock-login', wrap(async (req, res) => {
  if (config.authMode === 'password') throw new AppError(400, 'NOT_AVAILABLE', '開発用ログインは本番環境で無効です');
  const { userId } = req.body;
  if (!userId) throw new AppError(400, 'VALIDATION_ERROR', 'userId is required');
  const user = await queryOne('SELECT id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  res.json({ success: true, data: user });
}));

router.get('/users', wrap(async (_req, res) => {
  if (config.authMode === 'password') throw new AppError(400, 'NOT_AVAILABLE', '開発用ユーザー一覧は本番環境で無効です');
  const users = await queryAll('SELECT id, name, email, role FROM users WHERE deleted_at IS NULL ORDER BY name');
  res.json({ success: true, data: users });
}));

// ============================================================
// パスワード変更 (自分自身)
// ============================================================
router.post('/change-password', requireAuth, wrap(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) throw new AppError(400, 'VALIDATION_ERROR', '現在のパスワードと新しいパスワードは必須です');
  const npErr = validatePassword(new_password);
  if (npErr) throw new AppError(400, 'VALIDATION_ERROR', npErr);

  const user = await queryOne('SELECT id, password_hash FROM users WHERE id = ? AND deleted_at IS NULL', [(req.user as any).id]) as any;
  if (!user?.password_hash) throw new AppError(400, 'NO_PASSWORD', 'パスワードが設定されていません');

  const valid = await verifyPassword(current_password, user.password_hash);
  if (!valid) throw new AppError(401, 'INVALID_PASSWORD', '現在のパスワードが正しくありません');

  const hash = await hashPassword(new_password);
  await execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, user.id]);
  res.json({ success: true, message: 'パスワードを変更しました' });
}));

// ============================================================
// 管理者: ユーザーのパスワードリセット (再招待)
// ============================================================
router.post('/reset-password', requireAuth, requireRole('system_admin'), wrap(async (req, res) => {
  const { user_id, new_password } = req.body;
  if (!user_id) throw new AppError(400, 'VALIDATION_ERROR', 'user_idは必須です');

  const target = await queryOne('SELECT id, email FROM users WHERE id = ? AND deleted_at IS NULL', [user_id]) as any;
  if (!target) throw new AppError(404, 'NOT_FOUND', 'ユーザーが見つかりません');

  if (new_password) {
    // 直接パスワード設定
    if (new_password.length < 8) throw new AppError(400, 'VALIDATION_ERROR', 'パスワードは8文字以上です');
    const hash = await hashPassword(new_password);
    await execute('UPDATE users SET password_hash = ?, status = ?, updated_at = NOW() WHERE id = ?', [hash, 'active', user_id]);
    res.json({ success: true, message: `${target.email} のパスワードをリセットしました` });
  } else {
    // 招待メール再送
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await execute(
      `UPDATE users SET invitation_token = ?, invitation_expires_at = ?, status = 'invited', password_hash = NULL, updated_at = NOW() WHERE id = ?`,
      [token, expiresAt.toISOString(), user_id],
    );
    const clientUrl = process.env.CLIENT_URL || config.clientUrl;
    const inviteUrl = `${clientUrl}/auth/accept-invitation?token=${token}`;
    await sendMail({
      to: target.email,
      subject: 'GMO ONAiR — パスワードリセット',
      html: `<h2>パスワードリセット</h2><p>下記のリンクから新しいパスワードを設定してください。</p><p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#005bac;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">パスワードを再設定</a></p><p style="color:#666;font-size:12px;">7日間有効です。</p>`,
    });
    res.json({
      success: true,
      message: `${target.email} にリセットメールを送信しました`,
    });
  }
}));

// ============================================================
// 共通
// ============================================================
router.post('/logout', (_req, res) => {
  res.clearCookie('gmo_onair_token', {
    domain: process.env.COOKIE_DOMAIN || undefined,
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.json({ success: true, message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});

// 権限診断: 認証済みユーザーなら誰でも呼べる (staff が自分の状態を確認するために使用)
router.get('/debug', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const userInDb = await queryOne(
    'SELECT id, name, email, role, status, deleted_at FROM users WHERE id = ?',
    [userId],
  );
  const permissionsInDb = await queryAll(
    'SELECT module, access_level FROM user_permissions WHERE user_id = ? ORDER BY module',
    [userId],
  );
  res.json({
    success: true,
    data: {
      userFromJwt: req.user,
      userInDb,
      permissionsInDb,
      permissionsLoaded: req.user!.permissions ?? {},
      version: process.env.npm_package_version || 'unknown',
    },
  });
});

// requirePermissionロジックを直接シミュレートして全モジュールの判定結果を返す
router.get('/permission-test', requireAuth, wrap(async (req, res) => {
  const LEVEL_ORDER: Record<string, number> = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3, full: 4 };
  // 権限モデル単純化（migration 210）で区画はブロックアプリ単位に統合済み。
  // 技術資料アプリの削除（migration 211）で `techsheet` を外し、計時・視聴者の
  // ミニアプリ化フェーズ2（migration 232）で `liveops` を `qsheet` へ統合し、いまは5つ。
  // `permission-role.service.ts` の `ROLE_MODULES` と同じ並びにすること
  const MODULES = ['sales', 'equipment', 'dailyops', 'qsheet', 'awards'];

  // DB から直接クエリして最新値を取得
  const dbRows = await queryAll(
    'SELECT module, access_level FROM user_permissions WHERE user_id = ? ORDER BY module',
    [req.user!.id],
  );
  const dbPerms: Record<string, string> = {};
  for (const r of dbRows) { dbPerms[r.module as string] = r.access_level as string; }

  const reqPerms = req.user!.permissions ?? {};
  const isAdmin = req.user!.role === 'system_admin';

  const tests = MODULES.map((mod) => {
    const reqLevel = reqPerms[mod];
    const dbLevel = dbPerms[mod];
    const reqNum = LEVEL_ORDER[reqLevel] ?? 0;
    const dbNum = LEVEL_ORDER[dbLevel] ?? 0;
    const minNum = LEVEL_ORDER['reader'];
    return {
      module: mod,
      req_level: reqLevel ?? null,
      db_level: dbLevel ?? null,
      req_numeric: reqNum,
      db_numeric: dbNum,
      min_required: 'reader',
      would_pass_from_req: isAdmin || !(!reqLevel || reqNum < minNum),
      would_pass_from_db: isAdmin || !(!dbLevel || dbNum < minNum),
    };
  });

  res.json({
    success: true,
    data: {
      user: { id: req.user!.id, role: req.user!.role },
      is_admin: isAdmin,
      req_permissions: reqPerms,
      req_perm_count: Object.keys(reqPerms).length,
      db_permissions: dbPerms,
      db_perm_count: Object.keys(dbPerms).length,
      module_tests: tests,
      all_pass: tests.every((t) => t.would_pass_from_req),
    },
  });
}));

export default router;

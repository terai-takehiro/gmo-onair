import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { signToken } from '../../../shared/auth/jwt';
import { sendSms, generateOtp } from '../../../shared/auth/sms';
import { OTP_CHALLENGE_COOKIE, otpCookieOptions, verifyOtpChallenge } from '../../../shared/auth/otpChallenge';
import { config } from '../../../config';

const router = Router();
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const limit = (max: number) => rateLimit({
  windowMs: 5 * 60 * 1000, max,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '認証コードの操作回数が上限に達しました。しばらく待ってください。' } },
});

function requireChallenge(req: Request): string {
  const userId: unknown = req.body?.user_id;
  if (!verifyOtpChallenge(req.cookies?.[OTP_CHALLENGE_COOKIE], userId, config.jwtSecret)) {
    throw new AppError(401, 'LOGIN_REQUIRED', '再度メールアドレスとパスワードでログインしてください。');
  }
  return userId as string;
}

router.post('/verify-2fa', limit(5), wrap(async (req, res) => {
  const userId = requireChallenge(req);
  const code: unknown = req.body?.code;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
    throw new AppError(400, 'VALIDATION_ERROR', '6桁の認証コードを入力してください。');
  }
  const user = await queryOne(
    "SELECT id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL AND status = 'active'", [userId],
  ) as { id: string; name: string; email: string; role: string } | undefined;
  if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'このアカウントではログインできません。');

  // 検証と消費を1文にする。並行リクエストで同じOTPを2回使わせない。
  const consumed = await queryOne(
    `UPDATE verification_codes SET used_at = NOW()
     WHERE id = (SELECT id FROM verification_codes
       WHERE user_id = ? AND type = 'sms' AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1)
       AND used_at IS NULL AND expires_at > NOW() AND code = ?
     RETURNING id`, [userId, code.trim()],
  );
  if (!consumed) throw new AppError(401, 'INVALID_CODE', '認証コードが正しくないか、有効期限が切れています。');

  const ip = req.ip || req.socket.remoteAddress || '';
  await execute('INSERT INTO login_attempts (email, ip_address, success) VALUES (?, ?, true)', [user.email, ip]);
  await execute('UPDATE users SET last_login_at=NOW() WHERE id=?', [user.id]);
  const token = signToken({ userId: user.id, email: user.email, role: user.role, name: user.name });
  res.clearCookie(OTP_CHALLENGE_COOKIE, otpCookieOptions(config.isProduction));
  res.cookie('gmo_onair_token', token, {
    domain: process.env.COOKIE_DOMAIN || undefined, httpOnly: true,
    secure: config.isProduction, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ success: true, data: config.isProduction ? {} : { token } });
}));

// 成功した再送も数える。skipSuccessfulRequests だとSMSを無制限に送れてしまう。
router.post('/resend-otp', limit(3), wrap(async (req, res) => {
  const userId = requireChallenge(req);
  const user = await queryOne(
    "SELECT id, phone FROM users WHERE id = ? AND deleted_at IS NULL AND status = 'active'", [userId],
  ) as { id: string; phone: string | null } | undefined;
  if (!user?.phone) throw new AppError(400, 'NO_PHONE', '電話番号が登録されていないか、アカウントが無効です。');
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await execute("UPDATE verification_codes SET used_at=NOW() WHERE user_id=? AND type='sms' AND used_at IS NULL", [user.id]);
  await execute("INSERT INTO verification_codes (user_id, code, type, expires_at) VALUES (?, ?, 'sms', ?)", [user.id, code, expiresAt.toISOString()]);
  await sendSms(user.phone, `GMO ONAiR 認証コード: ${code}\n5分以内に入力してください。`);
  res.json({ success: true, message: '認証コードを再送信しました' });
}));

export default router;

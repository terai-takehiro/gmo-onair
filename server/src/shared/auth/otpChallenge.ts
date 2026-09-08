import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// パスワードを確認したブラウザだけが、次の5分間OTPを検証・再送できる。
// ログインJWTとは別形式にし、この証明だけでは通常のAPIを認証できなくする。
export const OTP_CHALLENGE_COOKIE = 'gmo_onair_otp_challenge';
export const OTP_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const otpCookieOptions = (secure: boolean) => ({
  httpOnly: true, secure, sameSite: 'strict' as const, path: '/api/v1/internal/auth',
});

export function createOtpChallenge(userId: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({
    userId, expiresAt: now + OTP_CHALLENGE_TTL_MS, nonce: randomBytes(16).toString('hex'),
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(`otp:${payload}`).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyOtpChallenge(value: unknown, userId: unknown, secret: string, now = Date.now()): boolean {
  if (typeof value !== 'string' || value.length > 2048 || typeof userId !== 'string' || !userId) return false;
  const parts = value.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = createHmac('sha256', secret).update(`otp:${payload}`).digest('base64url');
  const received = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (received.length !== wanted.length || !timingSafeEqual(received, wanted)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.userId === userId && Number.isFinite(data.expiresAt) && data.expiresAt > now;
  } catch { return false; }
}

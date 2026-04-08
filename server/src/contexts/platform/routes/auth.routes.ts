import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import rateLimit from 'express-rate-limit';
import { queryOne, queryAll } from '../../../shared/db/connection';
import { requireAuth } from '../../../shared/middleware/auth';
import { signToken } from '../../../shared/auth/jwt';
import { config } from '../../../config';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();

// Rate limit: auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'リクエスト回数が上限に達しました。しばらく待ってから再試行してください。' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// Google OAuth (有効時のみ設定)
// ============================================================
if (config.authMode === 'oauth') {
  passport.use(new GoogleStrategy(
    {
      clientID: config.googleClientId,
      clientSecret: config.googleClientSecret,
      callbackURL: config.oauthCallbackUrl,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(null, false, { message: 'Googleアカウントにメールアドレスがありません' });

        // メールアドレスで既存ユーザーを検索
        const user = await queryOne(
          'SELECT id, name, email, role FROM users WHERE email = ? AND deleted_at IS NULL',
          [email]
        );

        if (!user) {
          return done(null, false, { message: '招待されていないユーザーです。管理者にお問い合わせください。' });
        }

        done(null, user as unknown as Express.User);
      } catch (err) {
        done(err as Error);
      }
    }
  ));

  // Google OAuth 開始
  router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  }));

  // Google OAuth コールバック
  router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${config.clientUrl}/login?error=auth_failed` }),
    (req, res) => {
      const user = req.user as { id: string; email: string; role: string };
      const token = signToken({ userId: user.id, email: user.email, role: user.role });

      // Set HTTP-only cookie + redirect to client
      res.cookie('gmo_onair_token', token, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      res.redirect(`${config.clientUrl}/auth/callback?token=${token}`);
    }
  );
}

// ============================================================
// 認証モード情報
// ============================================================
router.get('/mode', (_req, res) => {
  res.json({
    success: true,
    data: {
      mode: config.authMode,
      googleClientId: config.authMode === 'oauth' ? config.googleClientId : null,
    },
  });
});

// ============================================================
// Mock Login (開発用、authMode === 'mock' 時のみ動作)
// ============================================================
router.post('/login', authLimiter, async (req, res) => {
  if (config.authMode === 'oauth') {
    throw new AppError(400, 'NOT_AVAILABLE', '開発用ログインは本番環境で無効です');
  }
  const { userId } = req.body;
  if (!userId) throw new AppError(400, 'VALIDATION_ERROR', 'userId is required');
  const user = await queryOne('SELECT id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  res.json({ success: true, data: user });
});

router.get('/users', async (_req, res) => {
  if (config.authMode === 'oauth') {
    throw new AppError(400, 'NOT_AVAILABLE', '開発用ユーザー一覧は本番環境で無効です');
  }
  const users = await queryAll('SELECT id, name, email, role FROM users WHERE deleted_at IS NULL ORDER BY name');
  res.json({ success: true, data: users });
});

// ============================================================
// 共通
// ============================================================
router.post('/logout', (_req, res) => {
  res.clearCookie('gmo_onair_token');
  res.json({ success: true, message: 'Logged out' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});

export default router;

import { randomBytes } from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';

// Fail fast: 本番環境で必須の環境変数
if (isProduction) {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'ALLOWED_ORIGINS'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  if ((process.env.JWT_SECRET || '').length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters. Generate with: openssl rand -hex 32');
    process.exit(1);
  }
}

// Auth mode: env override > NODE_ENV-based default
// v2.5.0: dev でも本番同様の email/password 認証を使えるよう AUTH_MODE 環境変数で上書き可能に。
const explicitAuthMode = (process.env.AUTH_MODE || '').toLowerCase();
const authMode: 'password' | 'mock' =
  explicitAuthMode === 'password' ? 'password'
  : explicitAuthMode === 'mock' ? 'mock'
  : isProduction ? 'password'
  : 'mock';

// JWT secret resolution
// - 本番: env で必須 (上で検証済み)
// - 開発: env が未設定なら起動時に毎回ランダムな値を生成 (再起動でセッション失効するが、既知の値で署名されるリスクを排除)
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (isProduction) {
    // 上で process.exit 済みのはずだが念のため
    throw new Error('JWT_SECRET is required in production');
  }
  const generated = randomBytes(32).toString('hex');
  console.warn(
    '[config] JWT_SECRET not set — generated an ephemeral secret for this dev process. ' +
    'Sessions will be invalidated on restart. Set JWT_SECRET in .env to persist.'
  );
  return generated;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/onair_db',

  // Auth mode: 'password' (本番) / 'mock' (開発デフォルト) — AUTH_MODE で上書き可能
  authMode,

  // JWT — 本番では env 必須 / dev は起動時生成のエフェメラル値
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: '7d',

  // Client URL
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // MCP サーバー (/api/v1/mcp) — 未設定なら機能無効 (503)。本番必須にはしない。
  mcpApiKey: process.env.MCP_API_KEY || '',
  // MCP 経由の書き込みで created_by に記録される actor 識別子
  mcpActorId: process.env.MCP_ACTOR_ID || 'mcp-claude',

  // Google カレンダー OAuth 連携 (マイカレンダー) — 未設定なら機能無効 (503 / ボタン非表示)
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  // 既定は同一オリジンの内部コールバック (nginx /api プロキシ経由・設定変更不要)
  googleOAuthRedirect:
    process.env.GOOGLE_OAUTH_REDIRECT ||
    `${process.env.CLIENT_URL || 'http://localhost:5173'}/api/v1/internal/schedule/google/callback`,

  // Outlook (Microsoft 365) カレンダー OAuth 連携 — 未設定なら機能無効 (503 / ボタン非表示)
  msClientId: process.env.MS_CLIENT_ID || '',
  msClientSecret: process.env.MS_CLIENT_SECRET || '',
  msTenantId: process.env.MS_TENANT_ID || '',
  msOAuthRedirect:
    process.env.MS_OAUTH_REDIRECT ||
    `${process.env.CLIENT_URL || 'http://localhost:5173'}/api/v1/internal/schedule/ms/callback`,
};

// CORS 許可オリジン — HTTP (app.ts) と Socket.IO (socket.ts) で共有
// 本番では ALLOWED_ORIGINS 必須 (上で検証済み)、dev はローカル Vite ポートを許可
export function getAllowedOrigins(): string[] {
  // 開発時の許可オリジン。**ここに無いポートは Socket.IO のハンドシェイクが
  // 400 で落ちる** (allowRequest が Origin を見るため) ので、
  // クライアントを追加したら必ずここにも足すこと。
  // 5180 (client-daily) が抜けていて日常業務アプリのリアルタイムが開発時に
  // 使えなくなっていた。127.0.0.1 でも同じことが起きるので両表記を入れる。
  const devPorts = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 3000];
  const devOrigins = isProduction
    ? []
    : devPorts.flatMap((p) => [`http://localhost:${p}`, `http://127.0.0.1:${p}`]);
  const envOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [];
  return [...devOrigins, ...envOrigins];
}

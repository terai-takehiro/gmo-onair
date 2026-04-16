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

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/onair_db',

  // Auth mode: 'password' (本番) / 'mock' (開発)
  authMode: isProduction ? 'password' as const : 'mock' as const,

  // JWT — 本番ではフォールバックなし（上で検証済み）
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-do-not-use-in-production',
  jwtExpiresIn: '7d',

  // Client URL
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};

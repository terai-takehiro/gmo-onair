export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/onair_db',

  // Auth mode: 'oauth' when Google credentials are set, 'mock' otherwise
  authMode: (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ? 'oauth' as const : 'mock' as const,

  // Google OAuth 2.0
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  oauthCallbackUrl: process.env.OAUTH_CALLBACK_URL || 'http://localhost:3000/api/v1/auth/google/callback',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-do-not-use-in-production',
  jwtExpiresIn: '7d',

  // Client URL (for OAuth redirect after login)
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};

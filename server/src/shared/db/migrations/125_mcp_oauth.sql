-- MCP OAuth 2.1 認可サーバー用テーブル (v2.9.194)
-- claude.ai 組織カスタムコネクタが要求する OAuth (DCR + authorization_code + PKCE) を
-- MCP サーバー自身で提供するための最小構成。認証は ONAiR ログイン連携 (per-user)。
-- アクセストークンは JWT (ステートレス) のため DB 不要。リフレッシュは失効可能に DB 保持。

-- 動的クライアント登録 (RFC 7591) で登録された OAuth クライアント (= claude.ai コネクタ)
CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id                   TEXT PRIMARY KEY,
  client_name                 TEXT,
  redirect_uris               JSONB NOT NULL DEFAULT '[]'::jsonb,
  token_endpoint_auth_method  TEXT NOT NULL DEFAULT 'none',
  grant_types                 JSONB NOT NULL DEFAULT '["authorization_code","refresh_token"]'::jsonb,
  response_types              JSONB NOT NULL DEFAULT '["code"]'::jsonb,
  scope                       TEXT,
  raw                         JSONB,                       -- 登録時の全メタデータ
  client_id_issued_at         BIGINT NOT NULL,             -- unix 秒
  created_at                  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 認可コード (単回使用・短命)。ONAiR ユーザーと PKCE challenge を束ねる。
CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
  code            TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL,
  redirect_uri    TEXT NOT NULL,
  code_challenge  TEXT NOT NULL,                            -- PKCE S256
  user_id         TEXT NOT NULL,                            -- 認可した ONAiR ユーザー
  scope           TEXT,
  resource        TEXT,                                     -- RFC 8707 (任意)
  expires_at      TIMESTAMP NOT NULL,                       -- 発行から 10 分
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expires ON mcp_oauth_codes(expires_at);

-- リフレッシュトークン (失効可能にするため DB 保持)
CREATE TABLE IF NOT EXISTS mcp_oauth_refresh_tokens (
  token       TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  scope       TEXT,
  expires_at  TIMESTAMP NOT NULL,                           -- 30 日
  revoked_at  TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_refresh_user ON mcp_oauth_refresh_tokens(user_id);

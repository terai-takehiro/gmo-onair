import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createAuthMiddleware } from './shared/middleware/auth';
import { errorHandler } from './shared/middleware/errorHandler';
import { createRoutes } from './routes';
import { createMcpRoutes } from './contexts/mcp';
import { registerMcpOAuthMetadata, createMcpOAuthRouter } from './contexts/mcp/oauth/routes';
import { getAllowedOrigins } from './config';

export function createApp(): express.Express {
  // Express 4.x: async ルートハンドラで throw/reject した場合に自動で next(err) を呼ぶパッチ。
  // これにより全ルートで try/catch や wrap() がなくても errorHandler に到達する。
  // ※ express の handle_request はハンドラの戻り値 (Promise) を return しないため、
  //   元実装をラップして戻り値を拾う方式では捕捉できない (旧パッチは常に undefined を見ていて
  //   無効だった = async throw が unhandled rejection になりリクエストがハングしていた)。
  //   ハンドラを自前で呼び出して Promise を直接 .catch(next) する。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Layer = require('express/lib/router/layer');
  const _origHandleReq = Layer.prototype.handle_request as (req: unknown, res: unknown, next: (err?: unknown) => void) => unknown;
  Layer.prototype.handle_request = function(req: unknown, res: unknown, next: (err?: unknown) => void) {
    const fn = (this as { handle?: unknown }).handle;
    if (typeof fn === 'function' && fn.length <= 3) {
      try {
        const ret = fn(req, res, next);
        if (ret !== null && typeof (ret as Promise<unknown>)?.catch === 'function') {
          (ret as Promise<unknown>).catch(next);
        }
      } catch (err) {
        next(err);
      }
      return;
    }
    // error handler 等 (arity > 3) は元実装に委譲
    return _origHandleReq.call(this, req, res, next);
  };

  const app = express();
  const appVersion = process.env.npm_package_version || 'unknown';

  const isProduction = process.env.NODE_ENV === 'production';
  const hasHttps = !!process.env.HTTPS_ENABLED || isProduction;

  // Nginx経由のリクエストでクライアントIPを正しく取得
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.ytimg.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        frameSrc: ["https://www.youtube.com", "https://youtube.com"],
        upgradeInsecureRequests: hasHttps ? [] : null,
      },
    },
    hsts: hasHttps,
    crossOriginOpenerPolicy: hasHttps,
    originAgentCluster: hasHttps,
  }));

  // CORS — 本番では ALLOWED_ORIGINS 必須 (config.ts で検証済み)。
  // 許可オリジンの構築は getAllowedOrigins() に集約 (Socket.IO と共有)。
  const configuredOrigins = getAllowedOrigins();
  app.use(cors({
    origin: configuredOrigins.length > 0 ? configuredOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  if (!isProduction) app.use(morgan('dev'));

  // Auth middleware
  app.use(createAuthMiddleware());

  // Routes
  app.use('/api/v1/internal', createRoutes());

  // MCP OAuth 2.1 認可サーバー (claude.ai 組織カスタムコネクタ用)。
  //   - ルート直下の well-known メタデータ (RFC 8414 / RFC 9728)
  //   - /api/v1/mcp/oauth/{authorize,token,register,revoke}
  // 保護対象の /api/v1/mcp より前にマウントする (oauth/* が /mcp プレフィックスに食われないように、
  // また well-known は SPA catch-all より前に処理する必要があるため)。
  registerMcpOAuthMetadata(app);
  app.use('/api/v1/mcp/oauth', createMcpOAuthRouter());

  // MCP サーバー (Claude Code 等の MCP クライアント / claude.ai コネクタ用)。
  // 認証は「静的 APIキー (?key=/Bearer/X-API-Key) または OAuth アクセストークン」の二本立て。
  app.use('/api/v1/mcp', createMcpRoutes());

  // Health check — 最小限の情報のみ返す
  app.get('/health', async (_req, res) => {
    try {
      const { queryOne } = require('./shared/db/connection');
      await queryOne('SELECT 1');
      res.json({ status: 'ok', version: appVersion });
    } catch {
      res.status(503).json({ status: 'error' });
    }
  });

  // Static file serving — dist が存在すれば常に配信 (本番・検証共通)
  {
    const fs = require('fs');
    const clientDistPath = path.join(__dirname, '../../client/dist');

    if (fs.existsSync(clientDistPath)) {
      const staticOptions: Parameters<typeof express.static>[1] = {
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      };

      const serveApp = (prefix: string, distPath: string) => {
        app.use(prefix, express.static(distPath, staticOptions));
        app.get(prefix, (_req, res) => {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.sendFile(path.join(distPath, 'index.html'));
        });
        app.get(`${prefix}/*`, (_req, res) => {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.sendFile(path.join(distPath, 'index.html'));
        });
      };

      serveApp('/equipment', path.join(__dirname, '../../client-equipment/dist'));
      serveApp('/qsheet', path.join(__dirname, '../../client-qsheet/dist'));
      serveApp('/live', path.join(__dirname, '../../client-live/dist'));
      // '/awards' (リアルタイムCG) は廃止。配信を止めただけでコードは client-awards/ に残す
      // (client-awards/CLAUDE.md 参照)。復活させるならこの行を戻すだけでよい。
      serveApp('/daily', path.join(__dirname, '../../client-daily/dist'));

      app.use(express.static(clientDistPath, staticOptions));
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(clientDistPath, 'index.html'));
      });
    }
  }

  app.use(errorHandler);
  return app;
}

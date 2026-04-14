import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import path from 'path';
import { createAuthMiddleware } from './shared/middleware/auth';
import { errorHandler } from './shared/middleware/errorHandler';
import { createRoutes } from './routes';
import { config } from './config';

export function createApp(): express.Express {
  const app = express();

  // Middleware
  const isProduction = process.env.NODE_ENV === 'production';
  const hasHttps = !!process.env.HTTPS_ENABLED;
  app.use(helmet({
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://accounts.google.com", "https://apis.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com", "https://*.ytimg.com"],
        connectSrc: ["'self'", "ws:", "wss:", "https://accounts.google.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        frameSrc: ["https://accounts.google.com", "https://www.youtube.com", "https://youtube.com"],
        upgradeInsecureRequests: hasHttps ? [] : null,
      },
    } : false,
    hsts: hasHttps,
    crossOriginOpenerPolicy: hasHttps,
    originAgentCluster: hasHttps,
  }));
  const devOrigins = isProduction ? [] : [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://localhost:3000',
  ];
  const configuredOrigins = [
    ...devOrigins,
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
  ];
  // If no origins configured in production, allow all (same-origin requests work via Nginx)
  const corsOrigin = configuredOrigins.length > 0 ? configuredOrigins : true;
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(morgan('dev'));

  // Passport initialization (Google OAuth — 将来用、現在はEmail/Password)
  if ((config.authMode as string) === 'oauth') {
    app.use(passport.initialize());
  }

  // Auto-select auth middleware: jwtAuth (OAuth mode) or mockAuth (dev mode)
  app.use(createAuthMiddleware());

  // Routes
  app.use('/api/v1/internal', createRoutes());

  // Health check + debug
  app.get('/health', async (_req, res) => {
    try {
      const { queryAll, queryOne } = require('./shared/db/connection');
      const tables = await queryAll("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'interactive%' ORDER BY tablename");
      const eventCount = await queryOne('SELECT COUNT(*)::int as c FROM interactive_events');
      const userCount = await queryOne('SELECT COUNT(*)::int as c FROM users');
      const migrations = await queryAll('SELECT name FROM _migrations ORDER BY name');

      // Check if youtube_url column exists
      const cols = await queryAll("SELECT column_name FROM information_schema.columns WHERE table_name='interactive_events' AND column_name IN ('youtube_url','banner_url','admin_comment','accepting','survey_url')");

      res.json({
        status: 'ok',
        name: 'GMO ONAiR API',
        db: {
          tables: tables.map((t: any) => t.tablename),
          event_columns: cols.map((c: any) => c.column_name),
          event_count: eventCount?.c,
          user_count: userCount?.c,
          migrations_count: migrations.length,
          last_migration: migrations[migrations.length - 1]?.name,
        },
      });
    } catch (err: any) {
      res.json({ status: 'error', error: err.message });
    }
  });

  // In production, serve React client build
  if (process.env.NODE_ENV === 'production') {
    const fs = require('fs');

    // Debug endpoint — verify file paths
    app.get('/api/debug/paths', (_req, res) => {
      const qsheetDist = path.join(__dirname, '../../client-qsheet/dist');
      const qsheetIndex = path.join(qsheetDist, 'index.html');
      let indexContent = '';
      try { indexContent = fs.readFileSync(qsheetIndex, 'utf8').slice(0, 300); } catch (e: any) { indexContent = `ERROR: ${e.message}`; }

      res.json({
        __dirname,
        qsheetDist,
        qsheetExists: fs.existsSync(qsheetDist),
        qsheetIndexExists: fs.existsSync(qsheetIndex),
        qsheetIndexStart: indexContent,
        qsheetFiles: fs.existsSync(qsheetDist) ? fs.readdirSync(qsheetDist) : [],
        assetsFiles: fs.existsSync(path.join(qsheetDist, 'assets')) ? fs.readdirSync(path.join(qsheetDist, 'assets')) : [],
      });
    });
    // Static file options: no-cache for HTML, immutable cache for hashed assets
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
      // SPA fallback: both /prefix and /prefix/* return index.html
      app.get(prefix, (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(path.join(distPath, 'index.html'));
      });
      app.get(`${prefix}/*`, (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    };

    serveApp('/equipment', path.join(__dirname, '../../client-equipment/dist'));
    serveApp('/qsheet', path.join(__dirname, '../../client-qsheet/dist'));
    serveApp('/interactive', path.join(__dirname, '../../client-interactive/dist'));
    serveApp('/techsheet', path.join(__dirname, '../../client-techsheet/dist'));

    // Main ONAiR client at /*
    const clientDistPath = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDistPath, staticOptions));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  // Error handler
  app.use(errorHandler);

  return app;
}

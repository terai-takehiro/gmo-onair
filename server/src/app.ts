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
        imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
        connectSrc: ["'self'", "ws:", "wss:", "https://accounts.google.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        frameSrc: ["https://accounts.google.com"],
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
  const allowedOrigins = [
    ...devOrigins,
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
  ];
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(morgan('dev'));

  // Passport initialization (required for Google OAuth strategy)
  if (config.authMode === 'oauth') {
    app.use(passport.initialize());
  }

  // Auto-select auth middleware: jwtAuth (OAuth mode) or mockAuth (dev mode)
  app.use(createAuthMiddleware());

  // Routes
  app.use('/api/v1/internal', createRoutes());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', name: 'GMO ONAiR API' });
  });

  // In production, serve React client build
  if (process.env.NODE_ENV === 'production') {
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
      app.get(`${prefix}/*`, (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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

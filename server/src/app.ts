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
  app.use(helmet({
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://accounts.google.com", "https://apis.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
        connectSrc: ["'self'", "ws:", "wss:", "https://accounts.google.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        frameSrc: ["https://accounts.google.com"],
      },
    } : false,
    hsts: isProduction,
    crossOriginOpenerPolicy: isProduction,
    originAgentCluster: isProduction,
  }));
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://localhost:3000',
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

  // In production, serve both React client builds
  if (process.env.NODE_ENV === 'production') {
    // Equipment client at /equipment/*
    const equipmentDistPath = path.join(__dirname, '../../client-equipment/dist');
    app.use('/equipment', express.static(equipmentDistPath));
    app.get('/equipment/*', (_req, res) => {
      res.sendFile(path.join(equipmentDistPath, 'index.html'));
    });

    // Qsheet client at /qsheet/*
    const qsheetDistPath = path.join(__dirname, '../../client-qsheet/dist');
    app.use('/qsheet', express.static(qsheetDistPath));
    app.get('/qsheet/*', (_req, res) => {
      res.sendFile(path.join(qsheetDistPath, 'index.html'));
    });

    // Interactive client at /interactive/*
    const interactiveDistPath = path.join(__dirname, '../../client-interactive/dist');
    app.use('/interactive', express.static(interactiveDistPath));
    app.get('/interactive/*', (_req, res) => {
      res.sendFile(path.join(interactiveDistPath, 'index.html'));
    });

    // TechSheet client at /techsheet/*
    const techsheetDistPath = path.join(__dirname, '../../client-techsheet/dist');
    app.use('/techsheet', express.static(techsheetDistPath));
    app.get('/techsheet/*', (_req, res) => {
      res.sendFile(path.join(techsheetDistPath, 'index.html'));
    });

    // Main ONAiR client at /*
    const clientDistPath = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDistPath));

    // SPA fallback: any non-API, non-equipment route serves main index.html
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  // Error handler
  app.use(errorHandler);

  return app;
}

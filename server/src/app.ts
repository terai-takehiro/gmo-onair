import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { mockAuth } from './shared/middleware/auth';
import { errorHandler } from './shared/middleware/errorHandler';
import { createRoutes } from './routes';

export function createApp(): express.Express {
  const app = express();

  // Middleware
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(helmet({
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    } : false,
    hsts: isProduction,
    crossOriginOpenerPolicy: isProduction,
    originAgentCluster: isProduction,
  }));
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
  ];
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('dev'));
  app.use(mockAuth);

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

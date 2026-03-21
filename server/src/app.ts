import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { mockAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { createRoutes } from './routes';

export function createApp(): express.Express {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));
  app.use(express.json());
  app.use(morgan('dev'));
  app.use(mockAuth);

  // Routes
  app.use('/api/v1/internal', createRoutes());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', name: 'GMO ONAiR API' });
  });

  // In production, serve the React client build
  if (process.env.NODE_ENV === 'production') {
    const clientDistPath = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDistPath));

    // SPA fallback: any non-API route serves index.html
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  // Error handler
  app.use(errorHandler);

  return app;
}

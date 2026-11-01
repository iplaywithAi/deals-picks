import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import './db.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import trackingRoutes from './routes/tracking.js';

// Builds the Express app without starting it, so tests can mount it on any port
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  if (config.env === 'production') app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/tracking', trackingRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', productRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // In production the API also serves the built React app
  const indexFile = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(express.static(config.clientDist));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) return res.sendFile(indexFile);
      next();
    });
  }

  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side' : err.message });
  });

  return app;
}

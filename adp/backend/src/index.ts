import dotenv from 'dotenv';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer } from 'http';
import { CronJob } from 'cron';

import { initDb } from './utils/db';
import { runMigrations } from './utils/migrations';
import { logger } from './utils/logger';
import { initWebSocket } from './services/websocket';
import { syncAllStatuses } from './services/processManager';
import { recordMetrics } from './routes/monitoring';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import serversRouter from './routes/servers';
import filesRouter from './routes/files';
import databasesRouter from './routes/databases';
import monitoringRouter from './routes/monitoring';
import apiTokensRouter from './routes/api-tokens';
import auditRouter from './routes/audit';

const ENV_PATH = path.resolve(__dirname, '../../.env');
if (fs.existsSync(ENV_PATH)) dotenv.config({ path: ENV_PATH, override: false });

const app = express();
const httpServer = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
    },
  },
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/servers', serversRouter);
app.use('/api/v1/projects', filesRouter);
app.use('/api/v1/databases', databasesRouter);
app.use('/api/v1/monitoring', monitoringRouter);
app.use('/api/v1/tokens', apiTokensRouter);
app.use('/api/v1/audit', auditRouter);

// Health check (public)
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version || '1.0.0', uptime: process.uptime() });
});

// Serve frontend from /dist/frontend
const FRONTEND_DIST = path.join(__dirname, '../../frontend/dist');
app.use(express.static(FRONTEND_DIST));
app.get('*', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { err });
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = parseInt(process.env.PORT || '3000');

async function main() {
  try {
    await initDb();
    await runMigrations();
    initWebSocket(httpServer);

    // Cron: record metrics every minute
    new CronJob('* * * * *', recordMetrics, null, true);
    // Cron: sync PM2 statuses every 30 seconds
    setInterval(syncAllStatuses, 30000);

    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`ADP running on port ${PORT}`);
    });
  } catch (err) {
    // Keep startup failures visible even if a file logger/transport fails.
    console.error('[ADP] Startup failed:', err instanceof Error ? (err.stack || err.message) : err);
    try { logger.error('Startup failed', { err }); } catch (logErr) { console.error('[ADP] Could not write startup error to logger:', logErr); }
    process.exitCode = 1;
  }
}

main();

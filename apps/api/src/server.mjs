import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './core/config.mjs';
import { createDatabase } from './core/db.mjs';
import { createRedis } from './core/redis.mjs';
import { errorPayload } from './core/errors.mjs';
import { createHealthHandler } from './routes/health.mjs';

const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);
await redis.connect();

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { req.requestId = req.header('x-request-id') || randomUUID(); res.setHeader('x-request-id', req.requestId); next(); });

app.get('/v1/health', createHealthHandler({ db, redis, providers: [] }));
app.get('/v1', (_req, res) => res.json({ ok: true, service: 'jareed-api', version: '0.2.0' }));
app.use((_req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }));
app.use((error, req, res, _next) => {
  console.error(JSON.stringify({ level: 'error', requestId: req.requestId, code: error.code, message: error.message }));
  res.status(error.status || 500).json(errorPayload(error, req.requestId));
});

const server = app.listen(config.port, () => console.log(JSON.stringify({ level: 'info', event: 'server_started', port: config.port })));
async function shutdown(signal) { console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal })); server.close(); await Promise.allSettled([db.close(), redis.close()]); process.exit(0); }
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

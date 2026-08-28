import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { loadConfig } from './core/config.mjs';
import { createDatabase } from './core/db.mjs';
import { createRedis } from './core/redis.mjs';
import { errorPayload } from './core/errors.mjs';
import { createHealthHandler } from './routes/health.mjs';
import { createAuthMiddleware } from './core/sessions.mjs';
import { createAuthRouter } from './routes/auth.mjs';
import { createMailboxRouter } from './routes/mailboxes.mjs';
import { createOAuthRouter } from './routes/oauth.mjs';
import { createContactRouter } from './routes/contacts.mjs';
import { createCampaignRouter } from './routes/campaigns.mjs';
import { createPublicRouter } from './routes/public.mjs';
import { createKnowledgeRouter } from './routes/knowledge.mjs';
import { createWebhookRouter } from './routes/webhooks.mjs';
import { createInsightRouter } from './routes/insights.mjs';
import { createInboxRouter } from './routes/inbox.mjs';
import { createWebRouter } from './routes/web.mjs';
import { createProviderResolver } from './providers/resolver.mjs';
import { createEmailQueue } from './queue/email-queue.mjs';

const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);
await redis.connect();
const auth=createAuthMiddleware(db);
const providerResolver=createProviderResolver({db,config});
const emailQueue=createEmailQueue(redis.client);

const app = express();
app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins=new Set([config.webOrigin,'http://localhost','https://localhost','capacitor://localhost']);
app.use(cors({ origin: (origin,callback) => callback(null,!origin||allowedOrigins.has(origin)), credentials: true }));
app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use((req, res, next) => { req.requestId = req.header('x-request-id') || randomUUID(); res.setHeader('x-request-id', req.requestId); next(); });

app.get('/v1/health', createHealthHandler({ db, redis, providers: [{name:'gmail'},{name:'microsoft_graph'},{name:'smtp'},{name:'resend'},{name:'postmark'},{name:'test_sink'}] }));
app.get('/v1', (_req, res) => res.json({ ok: true, service: 'jareed-api', version: '0.2.0' }));
app.use('/v1/auth',createAuthRouter({db,auth}));
app.use('/v1',createWebRouter({db,auth,config,providerResolver,emailQueue,redis}));
app.use('/v1/oauth',createOAuthRouter({db,config,auth}));
app.use('/v1/mailboxes',createMailboxRouter({db,config,auth,providerResolver}));
app.use('/v1/contacts',createContactRouter({db,auth}));
app.use('/v1/campaigns',createCampaignRouter({db,auth,emailQueue,config}));
app.use('/v1/knowledge',createKnowledgeRouter({db,auth,config}));
app.use('/v1/insights',createInsightRouter({db,auth}));
app.use('/v1/inbox',createInboxRouter({db,auth}));
app.use('/v1/public',createPublicRouter({db,config}));
app.use('/v1/webhooks',createWebhookRouter({db,config}));

// Production web UI is bundled into the API image so the free second service can be reserved for the queue worker.
if (process.env.WEB_DIST_DIR) {
  const webDist = resolve(process.env.WEB_DIST_DIR);
  app.use(express.static(webDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/v1/') && req.accepts('html')) return res.sendFile(resolve(webDist, 'index.html'));
    next();
  });
}

app.use((_req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }));
app.use((error, req, res, _next) => {
  console.error(JSON.stringify({ level: 'error', requestId: req.requestId, code: error.code, message: error.message }));
  res.status(error.status || 500).json(errorPayload(error, req.requestId));
});

const server = app.listen(config.port, () => console.log(JSON.stringify({ level: 'info', event: 'server_started', port: config.port })));
async function shutdown(signal) { console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal })); server.close(); await Promise.allSettled([emailQueue.close(),db.close(), redis.close()]); process.exit(0); }
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

import { Worker } from 'bullmq';
import { loadConfig } from './core/config.mjs';
import { createDatabase } from './core/db.mjs';
import { createRedis } from './core/redis.mjs';
import { emailSuppressionHash } from './core/crypto.mjs';
import { maySend } from './core/scheduling.mjs';

const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);
await redis.connect();

const worker = new Worker('email-delivery', async (job) => {
  const { campaignId, recipientId, mailboxId } = job.data;
  const { rows } = await db.query(`
    select r.id recipient_id, r.email, r.status recipient_status,
           m.id mailbox_id, m.status mailbox_status, m.sent_today, m.effective_daily_limit
    from campaign_recipients r join mailboxes m on m.id = $3
    where r.id = $2 and r.campaign_id = $1`, [campaignId, recipientId, mailboxId]);
  if (!rows[0]) throw new Error('Delivery record or mailbox not found');
  const hash = emailSuppressionHash(rows[0].email);
  const suppressed = (await db.query('select 1 from suppressions where tenant_id = (select tenant_id from mailboxes where id = $1) and email_hash = $2', [mailboxId, hash])).rowCount > 0;
  const decision = maySend({ mailboxStatus: rows[0].mailbox_status, sentToday: rows[0].sent_today, effectiveDailyLimit: rows[0].effective_daily_limit, suppressed });
  if (!decision.allowed) {
    await db.query("update campaign_recipients set status = 'blocked', last_error_code = $2, updated_at = now() where id = $1", [recipientId, decision.reason]);
    return { status: 'blocked', reason: decision.reason };
  }
  // Provider resolution requires decrypting this mailbox's credential envelope.
  // It is intentionally not guessed or reported as successful until configured.
  throw new Error('MAILBOX_PROVIDER_RESOLVER_NOT_CONFIGURED');
}, { connection: redis.client, concurrency: 10 });

worker.on('failed', (job, error) => console.error(JSON.stringify({ level: 'error', event: 'delivery_failed', jobId: job?.id, message: error.message })));
worker.on('completed', (job, result) => console.log(JSON.stringify({ level: 'info', event: 'delivery_completed', jobId: job.id, result })));

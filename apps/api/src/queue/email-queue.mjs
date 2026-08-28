import { deterministicJitterMs } from '../core/scheduling.mjs';

export function computeRetrySchedule({ attemptsMade, maxAttempts, retryBaseDelayMs }) {
  const nextAttempt = Number(attemptsMade || 0) + 1;
  const willRetry = nextAttempt < Number(maxAttempts || 1);
  const retryDelayMs = Math.min(86_400_000, Number(retryBaseDelayMs || 30_000) * (2 ** Math.max(0, nextAttempt - 1)));
  return { nextAttempt, willRetry, retryDelayMs };
}

export function createEmailQueue(db) {
  return {
    async schedule(job, options) {
      const result = await db.query(`update scheduled_messages
        set status='QUEUED',scheduled_at=$2,max_attempts=$3,retry_base_delay_ms=$4,
          lease_owner=null,lease_expires_at=null,updated_at=now()
        where id=$1 and tenant_id=$5 and status in ('SCHEDULED','QUEUED','FAILED')
        returning id`, [job.scheduledMessageId, options.dueAt, options.attempts, options.retryBaseDelayMs, job.tenantId]);
      return {
        id: job.scheduledMessageId,
        jareedCreated: result.rowCount > 0,
        jareedWasExisting: result.rowCount === 0,
        remove: async () => db.query(`update scheduled_messages set status='SCHEDULED',lease_owner=null,
          lease_expires_at=null,updated_at=now() where id=$1 and status='QUEUED'`, [job.scheduledMessageId])
      };
    },
    async getJobCounts() {
      const { rows } = await db.query(`select
        count(*) filter (where status='QUEUED' and scheduled_at<=now())::int waiting,
        count(*) filter (where status='SENDING')::int active,
        count(*) filter (where status='QUEUED' and scheduled_at>now())::int delayed,
        count(*) filter (where status='FAILED')::int failed
        from scheduled_messages`);
      return rows[0];
    },
    async getWorkerHeartbeat() {
      const { rows } = await db.query("select heartbeat_at from worker_heartbeats where worker_name='email-delivery'");
      return rows[0]?.heartbeat_at || null;
    },
    async close() {}
  };
}

export async function enqueueRecipient(queue, job, { maxJitterMs = 120_000, jitterSecret, scheduledAt = new Date() }) {
  if (!job.scheduledMessageId) throw new Error('scheduledMessageId is required for the PostgreSQL queue');
  return enqueueScheduledMessage(queue, job, { maxJitterMs, jitterSecret, scheduledAt });
}

export async function enqueueScheduledMessage(queue, job, { maxJitterMs = 120_000, jitterSecret, scheduledAt = new Date(), attempts = 4, retryBaseDelayMs = 30_000 }) {
  const jitterMs = deterministicJitterMs({ campaignId: job.campaignId, recipientId: job.scheduledMessageId, maxJitterMs, secret: jitterSecret });
  const dueAt = new Date(Math.max(Date.now(), new Date(scheduledAt).getTime()) + jitterMs);
  return queue.schedule(job, { dueAt, attempts, retryBaseDelayMs });
}

import { Queue } from 'bullmq';
import { deterministicJitterMs } from '../core/scheduling.mjs';
import { recipientJobId, scheduledMessageJobId } from '../core/job-id.mjs';

export function createEmailQueue(redisConnection) {
  return new Queue('email-delivery', { connection: redisConnection, defaultJobOptions: { attempts: 4, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
}

export async function enqueueRecipient(queue, job, { maxJitterMs = 120_000, jitterSecret, scheduledAt = new Date() }) {
  const baseDelay=Math.max(0,new Date(scheduledAt).getTime()-Date.now());
  const delay = baseDelay+deterministicJitterMs({ campaignId: job.campaignId, recipientId: job.recipientId, maxJitterMs, secret: jitterSecret });
  return queue.add('send-recipient', job, { jobId: recipientJobId(job), delay });
}

export async function enqueueScheduledMessage(queue, job, { maxJitterMs = 120_000, jitterSecret, scheduledAt = new Date(), attempts = 4, retryBaseDelayMs = 30_000 }) {
  const baseDelay = Math.max(0, new Date(scheduledAt).getTime() - Date.now());
  const delay = baseDelay + deterministicJitterMs({ campaignId: job.campaignId, recipientId: job.scheduledMessageId, maxJitterMs, secret: jitterSecret });
  const jobId = scheduledMessageJobId(job);
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (['completed', 'failed'].includes(state)) await existing.remove();
    else { existing.jareedWasExisting = true; return existing; }
  }
  const created = await queue.add('send-scheduled-message', job, { jobId, delay, attempts, backoff: { type: 'exponential', delay: retryBaseDelayMs } });
  created.jareedCreated = true;
  return created;
}

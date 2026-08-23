import { Queue } from 'bullmq';
import { deterministicJitterMs } from '../core/scheduling.mjs';

export function createEmailQueue(redisConnection) {
  return new Queue('email-delivery', { connection: redisConnection, defaultJobOptions: { attempts: 4, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
}

export async function enqueueRecipient(queue, job, { maxJitterMs = 120_000, jitterSecret, scheduledAt = new Date() }) {
  const baseDelay=Math.max(0,new Date(scheduledAt).getTime()-Date.now());
  const delay = baseDelay+deterministicJitterMs({ campaignId: job.campaignId, recipientId: job.recipientId, maxJitterMs, secret: jitterSecret });
  return queue.add('send-recipient', job, { jobId: `${job.campaignId}:${job.recipientId}`, delay });
}

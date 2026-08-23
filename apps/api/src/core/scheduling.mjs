import { createHmac } from 'node:crypto';

export function deterministicJitterMs({ campaignId, recipientId, maxJitterMs, secret }) {
  if (!Number.isInteger(maxJitterMs) || maxJitterMs < 0) throw new TypeError('maxJitterMs must be a non-negative integer');
  if (maxJitterMs === 0) return 0;
  const digest = createHmac('sha256', secret).update(`${campaignId}:${recipientId}`).digest();
  return digest.readUInt32BE(0) % (maxJitterMs + 1);
}

export function rampLimit({ day, start = 10, multiplier = 1.35, ceiling }) {
  if (!Number.isInteger(day) || day < 1) throw new TypeError('day must be >= 1');
  if (!Number.isInteger(ceiling) || ceiling < 1) throw new TypeError('ceiling must be >= 1');
  return Math.min(ceiling, Math.max(1, Math.floor(start * multiplier ** (day - 1))));
}

export function maySend({ mailboxStatus, sentToday, effectiveDailyLimit, suppressed }) {
  if (suppressed) return { allowed: false, reason: 'RECIPIENT_SUPPRESSED' };
  if (mailboxStatus !== 'healthy') return { allowed: false, reason: 'MAILBOX_NOT_HEALTHY' };
  if (sentToday >= effectiveDailyLimit) return { allowed: false, reason: 'DAILY_LIMIT_REACHED' };
  return { allowed: true, reason: null };
}

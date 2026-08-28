import test from 'node:test';
import assert from 'node:assert/strict';
import { rankEligibleSenders } from '../src/core/sender-rotation.mjs';
import { recipientJobId, scheduledMessageJobId } from '../src/core/job-id.mjs';

test('rotation excludes unhealthy, disabled and exhausted senders', () => {
  const ranked = rankEligibleSenders([
    { id: 'a', status: 'healthy', sent_today: 10, effective_daily_limit: 10 },
    { id: 'b', status: 'unhealthy', sent_today: 0, effective_daily_limit: 10 },
    { id: 'c', status: 'disabled', sent_today: 0, effective_daily_limit: 10 },
    { id: 'd', status: 'healthy', sent_today: 2, effective_daily_limit: 10 }
  ]);
  assert.deepEqual(ranked.map((sender) => sender.id), ['d']);
  assert.equal(ranked[0].remaining, 8);
});

test('rotation prefers lowest utilization and then configured priority', () => {
  const ranked = rankEligibleSenders([
    { id: 'low-priority', status: 'healthy', sent_today: 1, effective_daily_limit: 10, priority: 0 },
    { id: 'high-priority', status: 'healthy', sent_today: 2, effective_daily_limit: 20, priority: 10 },
    { id: 'more-used', status: 'healthy', sent_today: 4, effective_daily_limit: 10, priority: 99 }
  ]);
  assert.deepEqual(ranked.map((sender) => sender.id), ['high-priority', 'low-priority', 'more-used']);
});

test('BullMQ recipient job IDs are stable and contain no forbidden colon', () => {
  const value = recipientJobId({ campaignId: 'campaign-1', recipientId: 'recipient-2' });
  assert.equal(value, 'send_campaign-1_recipient-2');
  assert.equal(value.includes(':'), false);
});

test('scheduled-message jobs are idempotent and BullMQ-safe', () => {
  const value = scheduledMessageJobId({ scheduledMessageId: '11111111-1111-4111-8111-111111111111' });
  assert.equal(value, 'message_11111111-1111-4111-8111-111111111111');
  assert.equal(value.includes(':'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicJitterMs, rampLimit, maySend } from '../src/core/scheduling.mjs';
import { decryptCredential, emailSuppressionHash, encryptCredential } from '../src/core/crypto.mjs';
import { accepted, isRetryableStatus } from '../src/providers/provider-result.mjs';

test('jitter is deterministic and bounded', () => {
  const input={campaignId:'c1',recipientId:'r1',maxJitterMs:120000,secret:'secret'};
  const first=deterministicJitterMs(input); assert.equal(first,deterministicJitterMs(input)); assert.ok(first>=0&&first<=120000);
});
test('warm-up limit grows without exceeding ceiling',()=>{assert.equal(rampLimit({day:1,ceiling:100}),10);assert.equal(rampLimit({day:100,ceiling:100}),100)});
test('suppression and mailbox health block delivery',()=>{assert.equal(maySend({mailboxStatus:'healthy',sentToday:0,effectiveDailyLimit:10,suppressed:true}).reason,'RECIPIENT_SUPPRESSED');assert.equal(maySend({mailboxStatus:'unhealthy',sentToday:0,effectiveDailyLimit:10,suppressed:false}).reason,'MAILBOX_NOT_HEALTHY')});
test('credential envelope round trips using AES-GCM',()=>{const key=Buffer.alloc(32,7);const value='top-secret';assert.equal(decryptCredential(encryptCredential(value,key),key),value)});
test('email suppression hash is normalized',()=>{assert.equal(emailSuppressionHash(' USER@Example.COM '),emailSuppressionHash('user@example.com'))});
test('provider success requires upstream message id',()=>{assert.throws(()=>accepted({provider:'x'}));assert.equal(accepted({provider:'x',messageId:'42'}).status,'accepted')});
test('only transient HTTP statuses are retryable',()=>{assert.equal(isRetryableStatus(429),true);assert.equal(isRetryableStatus(503),true);assert.equal(isRetryableStatus(401),false);assert.equal(isRetryableStatus(422),false)});

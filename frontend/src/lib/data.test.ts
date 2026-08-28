import { describe, expect, it } from 'vitest';
import { extractList, hasConnectionProof, hasSendProof } from './data';

describe('provider proof guards', () => {
  it('rejects nominal success without a provider acknowledgement', () => {
    expect(hasConnectionProof({ ok: true })).toBe(false);
    expect(hasSendProof({ ok: true })).toBe(false);
  });

  it('accepts only connection and send evidence', () => {
    expect(hasConnectionProof({ smtpStatus: 'CONNECTED' })).toBe(true);
    expect(hasSendProof({ messageId: 'provider-id' })).toBe(true);
  });
});

describe('list envelopes', () => {
  it('reads arrays and item envelopes', () => {
    expect(extractList([1, 2])).toEqual([1, 2]);
    expect(extractList({ items: [3] })).toEqual([3]);
  });
});

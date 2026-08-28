import test from 'node:test';
import assert from 'node:assert/strict';
import { addClickTracking, clickSignature, validClickSignature } from '../src/core/tracking.mjs';

test('click tracking signs the exact scheduled message and target', () => {
  const input = { messageId: '11111111-1111-4111-8111-111111111111', target: Buffer.from('https://example.com/a').toString('base64url'), secret: 'secret' };
  const signature = clickSignature(input);
  assert.equal(validClickSignature({ ...input, signature }), true);
  assert.equal(validClickSignature({ ...input, signature, target: `${input.target}x` }), false);
});

test('click tracking rewrites only absolute HTTP links', () => {
  const html = addClickTracking('<a href="https://example.com/a">A</a><a href="/local">B</a>', { publicApiUrl: 'https://api.example.test', messageId: 'id', secret: 'secret' });
  assert.match(html, /\/v1\/public\/click\/id\?target=/);
  assert.match(html, /href="\/local"/);
});

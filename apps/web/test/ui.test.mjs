import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const nativeCss = readFileSync(new URL('../native.css', import.meta.url), 'utf8');

test('all direct id selectors exist in the page', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const selectors = [...script.matchAll(/\$\('#([A-Za-z][\w-]*)/g)].map((match) => match[1]);
  const missing = [...new Set(selectors)].filter((id) => !ids.has(id));
  assert.deepEqual(missing, []);
});

test('async form handlers do not dereference event.currentTarget after await', () => {
  assert.doesNotMatch(script, /event\.currentTarget\.[A-Za-z]/);
  assert.doesNotMatch(script, /formData\(event\.currentTarget\)/);
});

test('dashboard and settings expose real local counters', () => {
  for (const id of ['mailboxCount', 'healthyMailboxCount', 'sentTodayCount', 'contactCount', 'campaignCount', 'universityCount', 'outboxCount', 'replyCount', 'settingsForm']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('all eight navigation destinations fit in two native rows', () => {
  assert.equal((html.match(/data-page=/g) || []).length, 8);
  assert.match(nativeCss, /grid-template-columns:\s*repeat\(4/);
  assert.match(nativeCss, /grid-template-rows:\s*repeat\(2/);
});

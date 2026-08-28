import { createHmac, timingSafeEqual } from 'node:crypto';

export function clickSignature({ messageId, target, secret }) {
  return createHmac('sha256', secret).update(`${messageId}.${target}`).digest('base64url');
}

export function validClickSignature({ messageId, target, signature, secret }) {
  const expected = Buffer.from(clickSignature({ messageId, target, secret }));
  const supplied = Buffer.from(String(signature || ''));
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function addClickTracking(html, { publicApiUrl, messageId, secret }) {
  return String(html || '').replace(/href=(['"])(https?:\/\/[^'"\s>]+)\1/gi, (_match, quote, url) => {
    const target = Buffer.from(url).toString('base64url');
    const sig = clickSignature({ messageId, target, secret });
    return `href=${quote}${publicApiUrl}/v1/public/click/${messageId}?target=${encodeURIComponent(target)}&sig=${encodeURIComponent(sig)}${quote}`;
  });
}

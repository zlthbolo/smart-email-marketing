const intentRules = [
  ['unsubscribe', /(?:إلغاء\s*الاشتراك|الغاء\s*الاشتراك|لا\s*تراسل(?:ني|ونا)?|احذف(?:ني|ونا)?|توقف\s*عن\s*الإرسال|unsubscribe|remove\s+me|stop\s+emailing)/iu],
  ['out_of_office', /(?:خارج\s*المكتب|في\s*إجازة|اجازة|رد\s*تلقائي|out\s+of\s+(?:the\s+)?office|automatic\s+reply|away\s+until)/iu],
  ['not_interested', /(?:غير\s*مهتم|لسنا\s*مهتمين|لا\s*أرغب|لا\s*نرغب|لا\s*شكرا|not\s+interested|no\s+thanks|not\s+for\s+me)/iu],
  ['interested', /(?:أنا\s*مهتم|انا\s*مهتم|نحن\s*مهتمون|أرسل\s*(?:لي|لنا)?\s*التفاصيل|ارسل\s*(?:لي|لنا)?\s*التفاصيل|sounds\s+good|i(?:'m|\s+am)\s+interested|send\s+(?:me\s+)?(?:more\s+)?details)/iu],
  ['question', /(?:[؟?]|\b(?:what|how|when|where|who|why)\b|(?:^|\s)(?:كيف|كم|متى|أين|اين|لماذا|هل)(?:\s|$))/iu]
];

export function normalizeReplyText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20_000);
}

export function classifyReplyIntent(value) {
  const text = normalizeReplyText(value);
  if (!text) return { intent: 'unknown', requiresHuman: true, confidence: 0, summary: null };
  const match = intentRules.find(([, pattern]) => pattern.test(text));
  const intent = match?.[0] || 'unknown';
  return {
    intent,
    requiresHuman: intent !== 'unsubscribe',
    confidence: match ? 0.8 : 0.2,
    summary: text.slice(0, 240)
  };
}

export function extractInboundReply(payload = {}) {
  const detail = payload.detail && typeof payload.detail === 'object' ? payload.detail : {};
  const text = detail.textBody ?? detail.text ?? detail.body ?? payload.textBody ?? payload.text ?? null;
  const html = detail.htmlBody ?? detail.html ?? payload.htmlBody ?? payload.html ?? null;
  return {
    subject: String(detail.subject ?? payload.subject ?? '').trim().slice(0, 500) || null,
    textBody: normalizeReplyText(text || html) || null,
    htmlBody: html ? String(html).slice(0, 100_000) : null,
    receivedAt: detail.receivedAt ?? payload.receivedAt ?? null
  };
}

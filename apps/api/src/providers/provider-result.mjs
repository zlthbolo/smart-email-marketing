export function accepted({ provider, messageId, response, acceptedAt = new Date().toISOString() }) {
  if (!messageId) throw new Error('Provider acknowledgement must include messageId');
  return { status: 'accepted', provider, providerMessageId: messageId, acceptedAt, response };
}

export function rejected({ provider, code, message, retryable, response }) {
  return { status: 'rejected', provider, error: { code, message, retryable }, response };
}

export function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

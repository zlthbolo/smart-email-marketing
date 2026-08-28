export function extractList<T>(data: T[] | { items?: T[]; results?: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

export function hasSendProof(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return Boolean(
    data.messageId ||
    (Array.isArray(data.accepted) && data.accepted.length > 0) ||
    data.providerMessageId,
  );
}

export function hasConnectionProof(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  const statuses = [data.smtpStatus, data.imapStatus, data.authenticationStatus].map((item) => String(item || '').toUpperCase());
  return data.verified === true || data.authenticated === true || statuses.some((status) => ['CONNECTED', 'VERIFIED', 'AUTHENTICATED', 'OK'].includes(status));
}

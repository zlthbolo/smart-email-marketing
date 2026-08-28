const numberFormatter = new Intl.NumberFormat('ar', { notation: 'compact', maximumFractionDigits: 1 });
const fullNumberFormatter = new Intl.NumberFormat('ar');

export const formatCompact = (value?: number | null) => numberFormatter.format(value ?? 0);
export const formatNumber = (value?: number | null) => fullNumberFormatter.format(value ?? 0);

export function formatDate(value?: string | null, includeTime = true) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('ar', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(parsed);
}

export function formatPercent(numerator?: number, denominator?: number) {
  if (!denominator) return '—';
  return `${new Intl.NumberFormat('ar', { maximumFractionDigits: 1 }).format(((numerator ?? 0) / denominator) * 100)}٪`;
}

export const statusLabels: Record<string, string> = {
  ACTIVE: 'نشطة',
  PAUSED: 'متوقفة',
  DRAFT: 'مسودة',
  COMPLETED: 'مكتملة',
  HEALTHY: 'سليم',
  WARNING: 'تحذير',
  PROBLEM: 'مشكلة',
  CONNECTED: 'متصل',
  DISCONNECTED: 'غير متصل',
  VERIFIED: 'موثّق',
  FAILED: 'فشل',
  QUEUED: 'في الانتظار',
  SCHEDULED: 'مجدولة',
  SENDING: 'قيد الإرسال',
  SENT: 'أُرسلت',
  DELIVERED: 'تم التسليم',
  BOUNCED: 'مرتدة',
  REPLIED: 'تم الرد',
  UNSUBSCRIBED: 'ألغى الاشتراك',
  UNKNOWN: 'غير معروف',
  BLOCKED: 'محظور',
  INTERESTED: 'مهتم',
  NOT_INTERESTED: 'غير مهتم',
  QUESTION: 'سؤال',
  OUT_OF_OFFICE: 'خارج المكتب',
  UNSUBSCRIBE: 'إلغاء اشتراك',
  OTHER: 'أخرى',
};

export function statusLabel(status?: string | null) {
  return status ? statusLabels[status.toUpperCase()] || status : 'غير معروف';
}

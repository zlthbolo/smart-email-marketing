export type ISODate = string;

export interface ApiMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AdminProfile {
  id: string;
  email: string;
  name?: string;
}

export type HealthState = 'HEALTHY' | 'WARNING' | 'PROBLEM' | 'UNKNOWN' | string;
export type AccountState = 'ACTIVE' | 'PAUSED' | string;

export interface EmailAccount {
  id: string;
  email: string;
  provider: string;
  senderName: string;
  smtpStatus: string;
  imapStatus: string;
  authenticationStatus: string;
  dailyLimit: number;
  sentToday: number;
  remainingToday: number;
  health: HealthState;
  lastError?: string | null;
  lastSuccessfulSendAt?: ISODate | null;
  state: AccountState;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replies: number;
  positiveReplies: number;
  bounced: number;
  failed: number;
  unsubscribed: number;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | string;
  leadCount?: number;
  senderCount?: number;
  metrics: CampaignMetrics;
  timezone?: string;
  startsAt?: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface SequenceStep {
  id?: string;
  position: number;
  type: 'EMAIL' | 'DELAY';
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  delayAmount?: number;
  delayUnit?: 'MINUTES' | 'HOURS' | 'DAYS';
  trackOpens?: boolean;
  trackClicks?: boolean;
}

export interface Lead {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  university?: string | null;
  major?: string | null;
  company?: string | null;
  tags?: string[];
  customFields?: Record<string, string>;
  status: string;
  lastContactedAt?: ISODate | null;
  replyStatus?: string | null;
  bounceStatus?: string | null;
  campaignMemberships?: Array<{ id: string; name: string; status?: string }>;
}

export interface DailyPoint {
  date: string;
  sent?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  replies?: number;
  bounced?: number;
  failed?: number;
}

export interface DashboardData {
  campaigns: { total: number; active: number; paused: number };
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replies: number;
  positiveReplies: number;
  bounced: number;
  failed: number;
  unsubscribed: number;
  senderAccounts: { total: number; healthy: number; problem: number };
  scheduledToday: number;
  queueSize: number;
  dailySeries: DailyPoint[];
  queue?: { waiting?: number; active?: number; delayed?: number; failed?: number };
  worker?: { status?: string; lastHeartbeatAt?: ISODate | null };
}

export type InboxCategory =
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'QUESTION'
  | 'OUT_OF_OFFICE'
  | 'UNSUBSCRIBE'
  | 'OTHER';

export interface InboxThread {
  id: string;
  subject: string;
  senderAccount: Pick<EmailAccount, 'id' | 'email' | 'senderName'>;
  lead: Pick<Lead, 'id' | 'email' | 'firstName' | 'lastName'>;
  campaign?: Pick<Campaign, 'id' | 'name'> | null;
  category: InboxCategory;
  isRead: boolean;
  isArchived?: boolean;
  messageCount?: number;
  snippet?: string;
  lastMessageAt: ISODate;
}

export interface InboxMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  from: string;
  to: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  sentAt: ISODate;
  status?: string;
}

export interface ThreadDetail extends InboxThread {
  messages: InboxMessage[];
}

export interface SenderAnalytics {
  id: string;
  email: string;
  provider: string;
  sent: number;
  delivered: number;
  replies: number;
  bounced: number;
  failed: number;
  deliveryRate?: number;
  replyRate?: number;
}

export interface LogEntry {
  id: string;
  campaign?: { id: string; name: string } | null;
  lead?: { id: string; email: string } | null;
  sender?: { id: string; email: string } | null;
  provider?: string | null;
  startedAt: ISODate;
  finishedAt?: ISODate | null;
  providerResponse?: unknown;
  messageId?: string | null;
  status: string;
  errorCode?: string | null;
  errorDetails?: string | null;
  retryCount: number;
}

export interface AppSettings {
  sending: {
    defaultDailyLimit: number;
    delayBetweenMessagesSeconds: number;
    retryMaxAttempts: number;
    retryBaseDelaySeconds: number;
  };
  tracking: { openTracking: boolean; clickTracking: boolean };
  leads?: { dedupeMode?: 'GLOBAL' | 'PER_CAMPAIGN' };
  secrets?: Record<string, boolean>;
}

export interface SystemStatus {
  database: { status: string; latencyMs?: number };
  queue: { status: string; size?: number };
  worker: { status: string; lastHeartbeatAt?: ISODate | null };
  lastBackgroundJob?: { name?: string; status?: string; finishedAt?: ISODate | null } | null;
  version: string;
}

alter type delivery_status add value if not exists 'unknown';

create table if not exists campaign_senders (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  mailbox_id uuid not null references mailboxes(id) on delete restrict,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (campaign_id, mailbox_id)
);
create index if not exists campaign_senders_mailbox_idx on campaign_senders (mailbox_id, campaign_id);

alter table campaign_recipients add column if not exists mailbox_id uuid references mailboxes(id) on delete set null;
create index if not exists campaign_recipients_mailbox_status_idx on campaign_recipients (mailbox_id, status);

insert into campaign_senders (campaign_id, mailbox_id)
select id, mailbox_id from campaigns where mailbox_id is not null
on conflict (campaign_id, mailbox_id) do nothing;

create table if not exists operation_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  operation text not null,
  campaign_id uuid references campaigns(id) on delete set null,
  campaign_recipient_id uuid references campaign_recipients(id) on delete set null,
  mailbox_id uuid references mailboxes(id) on delete set null,
  provider text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  provider_message_id text,
  provider_response jsonb,
  status text not null,
  error_code text,
  error_detail text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists operation_logs_tenant_time_idx on operation_logs (tenant_id, created_at desc);
create index if not exists operation_logs_campaign_time_idx on operation_logs (campaign_id, created_at desc);

alter table inbound_messages add column if not exists is_read boolean not null default false;
alter table inbound_messages add column if not exists archived_at timestamptz;

create table if not exists outbound_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_recipient_id uuid not null references campaign_recipients(id) on delete cascade,
  scheduled_message_id uuid references scheduled_messages(id) on delete set null,
  mailbox_id uuid references mailboxes(id) on delete set null,
  provider_message_id text,
  in_reply_to text,
  from_email text not null,
  to_email text not null,
  subject text,
  text_body text,
  html_body text,
  status text not null check (status in ('SENT','UNKNOWN','FAILED')),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists outbound_messages_thread_time_idx on outbound_messages (campaign_recipient_id,sent_at);
create index if not exists outbound_messages_tenant_time_idx on outbound_messages (tenant_id,sent_at desc);
create unique index if not exists outbound_messages_provider_message_idx on outbound_messages (provider_message_id) where provider_message_id is not null;
create unique index if not exists outbound_messages_scheduled_message_idx on outbound_messages (scheduled_message_id) where scheduled_message_id is not null;

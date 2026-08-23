create table if not exists inbound_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_recipient_id uuid not null references campaign_recipients(id) on delete cascade,
  mailbox_id uuid references mailboxes(id) on delete set null,
  provider mailbox_provider not null,
  provider_event_id text not null,
  provider_message_id text not null,
  from_email text not null,
  subject text,
  text_body text,
  html_body text,
  intent text not null default 'unknown' check (intent in ('interested','not_interested','question','out_of_office','unsubscribe','unknown')),
  intent_source text not null default 'rules' check (intent_source in ('rules','manual')),
  requires_human boolean not null default true,
  handled_at timestamptz,
  handled_by uuid references users(id) on delete set null,
  received_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists inbound_messages_tenant_received_idx on inbound_messages (tenant_id, received_at desc);
create index if not exists inbound_messages_tenant_intent_idx on inbound_messages (tenant_id, intent, handled_at);
create index if not exists inbound_messages_recipient_idx on inbound_messages (campaign_recipient_id, received_at desc);

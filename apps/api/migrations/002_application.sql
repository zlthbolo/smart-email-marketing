alter type mailbox_provider add value if not exists 'test_sink';

alter table users add column if not exists display_name text;
alter table users add column if not exists password_hash text;
alter table users add column if not exists updated_at timestamptz not null default now();
create unique index if not exists users_email_global_idx on users (lower(email));

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

create table if not exists oauth_states (
  state_hash text primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  provider mailbox_provider not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oauth_states_expiry_idx on oauth_states (expires_at);

alter table campaigns add column if not exists mailbox_id uuid references mailboxes(id) on delete set null;
alter table campaigns add column if not exists segment_definition jsonb not null default '{}'::jsonb;
alter table campaigns add column if not exists physical_address text;
alter table campaigns add column if not exists sender_name text;

alter table campaign_recipients add column if not exists tracking_token text;
alter table campaign_recipients add column if not exists unsubscribe_token text;
create unique index if not exists campaign_recipients_tracking_token_idx on campaign_recipients (tracking_token) where tracking_token is not null;
create unique index if not exists campaign_recipients_unsubscribe_token_idx on campaign_recipients (unsubscribe_token) where unsubscribe_token is not null;

alter table mailboxes add column if not exists sent_today_date date not null default current_date;
alter table mailboxes add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

create table if not exists delivery_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_recipient_id uuid not null references campaign_recipients(id) on delete cascade,
  event_type text not null,
  provider mailbox_provider,
  provider_message_id text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists delivery_events_recipient_time_idx on delivery_events (campaign_recipient_id, occurred_at desc);
create index if not exists delivery_events_tenant_type_idx on delivery_events (tenant_id, event_type, occurred_at desc);

create table if not exists test_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mailbox_id uuid not null references mailboxes(id) on delete cascade,
  recipient text not null,
  subject text not null,
  html_body text not null,
  text_body text,
  created_at timestamptz not null default now()
);
create index if not exists test_outbox_tenant_time_idx on test_outbox (tenant_id, created_at desc);

alter table research_runs add column if not exists provider_response_id text;
alter table research_runs add column if not exists report_text text;
alter table research_runs add column if not exists citations jsonb not null default '[]'::jsonb;

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_tenant_time_idx on audit_log (tenant_id, created_at desc);

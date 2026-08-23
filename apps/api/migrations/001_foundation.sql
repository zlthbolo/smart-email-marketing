create extension if not exists pgcrypto;

create type mailbox_provider as enum ('gmail', 'microsoft_graph', 'smtp', 'api');
create type mailbox_status as enum ('pending', 'healthy', 'unhealthy', 'disabled');
create type campaign_status as enum ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed');
create type delivery_status as enum ('pending', 'queued', 'accepted', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'complained', 'blocked', 'failed');

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role text not null default 'owner' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);
create index users_tenant_id_idx on users (tenant_id);

create table mailboxes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider mailbox_provider not null,
  email text not null,
  display_name text,
  credential_envelope text not null,
  status mailbox_status not null default 'pending',
  configured_daily_limit integer not null default 25 check (configured_daily_limit between 1 and 50000),
  effective_daily_limit integer not null default 10 check (effective_daily_limit between 1 and 50000),
  sent_today integer not null default 0 check (sent_today >= 0),
  warmup_day integer not null default 1 check (warmup_day >= 1),
  verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);
create index mailboxes_tenant_status_idx on mailboxes (tenant_id, status);

create table audiences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  filter_definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audiences_tenant_id_idx on audiences (tenant_id);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  university text,
  specialization text,
  attributes jsonb not null default '{}'::jsonb,
  consent_basis text not null check (consent_basis in ('explicit_opt_in','legitimate_interest','contractual','legal_obligation')),
  consent_source text not null,
  consent_granted_at timestamptz not null,
  consent_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);
create index contacts_tenant_university_idx on contacts (tenant_id, university);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  audience_id uuid references audiences(id) on delete set null,
  name text not null,
  subject_template text not null,
  html_template text not null,
  text_template text not null,
  status campaign_status not null default 'draft',
  scheduled_at timestamptz,
  max_jitter_seconds integer not null default 120 check (max_jitter_seconds between 0 and 3600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_tenant_status_scheduled_idx on campaigns (tenant_id, status, scheduled_at);

create table campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  email text not null,
  status delivery_status not null default 'pending',
  provider_message_id text,
  queued_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  bounced_at timestamptz,
  last_error_code text,
  last_error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index campaign_recipients_campaign_status_idx on campaign_recipients (campaign_id, status);
create index campaign_recipients_provider_message_idx on campaign_recipients (provider_message_id) where provider_message_id is not null;

create table suppressions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email_hash text not null,
  reason text not null check (reason in ('unsubscribe','hard_bounce','complaint','legal_request','manual')),
  source text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, email_hash)
);
create index suppressions_tenant_id_idx on suppressions (tenant_id);

create table provider_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider mailbox_provider not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index provider_events_unprocessed_idx on provider_events (created_at) where processed_at is null;

create table universities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  country_code text,
  official_url text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, official_url)
);
create index universities_tenant_id_idx on universities (tenant_id);

create table knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  url text not null,
  title text,
  content_hash text,
  fetched_at timestamptz,
  status text not null default 'pending' check (status in ('pending','fetched','failed','blocked')),
  metadata jsonb not null default '{}'::jsonb,
  unique (university_id, url)
);
create index knowledge_sources_university_status_idx on knowledge_sources (university_id, status);

create table research_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  university_id uuid references universities(id) on delete set null,
  objective text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  evidence_count integer not null default 0,
  result jsonb,
  error_detail text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index research_runs_tenant_status_idx on research_runs (tenant_id, status, created_at desc);

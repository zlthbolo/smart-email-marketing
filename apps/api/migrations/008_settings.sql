create table if not exists app_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  sending jsonb not null default '{"defaultDailyLimit":40,"delayBetweenMessagesSeconds":30,"retryMaxAttempts":4,"retryBaseDelaySeconds":30}'::jsonb,
  tracking jsonb not null default '{"openTracking":true,"clickTracking":false}'::jsonb,
  leads jsonb not null default '{"dedupeMode":"GLOBAL"}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_settings (tenant_id) select id from tenants on conflict (tenant_id) do nothing;

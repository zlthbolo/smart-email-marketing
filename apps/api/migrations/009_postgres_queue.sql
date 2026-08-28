alter table scheduled_messages
  add column if not exists max_attempts integer not null default 4 check (max_attempts between 1 and 10),
  add column if not exists retry_base_delay_ms integer not null default 30000 check (retry_base_delay_ms between 1000 and 86400000),
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz;

create index if not exists scheduled_messages_ready_queue_idx
  on scheduled_messages (scheduled_at, created_at)
  where status = 'QUEUED';

create table if not exists worker_heartbeats (
  worker_name text primary key,
  heartbeat_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb
);

create table if not exists sequence_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  position integer not null check (position >= 0),
  step_type text not null default 'EMAIL' check (step_type in ('EMAIL','DELAY')),
  subject_template text,
  html_template text,
  text_template text,
  delay_seconds integer not null default 0 check (delay_seconds between 0 and 31536000),
  track_opens boolean not null default true,
  track_clicks boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, position)
);
create index if not exists sequence_steps_campaign_position_idx on sequence_steps (campaign_id, position);

insert into sequence_steps (campaign_id,position,step_type,subject_template,html_template,text_template)
select c.id,0,'EMAIL',c.subject_template,c.html_template,c.text_template
from campaigns c where not exists(select 1 from sequence_steps s where s.campaign_id=c.id)
on conflict (campaign_id,position) do nothing;

create table if not exists scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  campaign_recipient_id uuid not null references campaign_recipients(id) on delete cascade,
  sequence_step_id uuid not null references sequence_steps(id) on delete cascade,
  mailbox_id uuid references mailboxes(id) on delete set null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','QUEUED','SENDING','SENT','UNKNOWN','DELIVERED','OPENED','CLICKED','REPLIED','BOUNCED','FAILED','CANCELLED')),
  scheduled_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  provider_message_id text,
  last_error_code text,
  last_error_detail text,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_recipient_id, sequence_step_id)
);
create index if not exists scheduled_messages_due_idx on scheduled_messages (tenant_id,status,scheduled_at);
create index if not exists scheduled_messages_campaign_status_idx on scheduled_messages (campaign_id,status);
create unique index if not exists scheduled_messages_provider_message_idx on scheduled_messages (provider_message_id) where provider_message_id is not null;

insert into scheduled_messages
  (tenant_id,campaign_id,campaign_recipient_id,sequence_step_id,mailbox_id,status,scheduled_at,provider_message_id,created_at,updated_at)
select c.tenant_id,r.campaign_id,r.id,s.id,r.mailbox_id,
  case r.status
    when 'accepted' then 'SENT'
    when 'delivered' then 'DELIVERED'
    when 'opened' then 'OPENED'
    when 'clicked' then 'CLICKED'
    when 'replied' then 'REPLIED'
    when 'bounced' then 'BOUNCED'
    when 'failed' then 'FAILED'
    when 'unknown' then 'UNKNOWN'
    when 'queued' then 'QUEUED'
    else 'SCHEDULED'
  end,
  coalesce(c.scheduled_at,r.queued_at,r.created_at),r.provider_message_id,r.created_at,r.updated_at
from campaign_recipients r join campaigns c on c.id=r.campaign_id
join sequence_steps s on s.campaign_id=c.id and s.position=0
on conflict (campaign_recipient_id,sequence_step_id) do nothing;

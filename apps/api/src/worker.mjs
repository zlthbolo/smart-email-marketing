import { Worker } from 'bullmq';
import { loadConfig } from './core/config.mjs';
import { createDatabase } from './core/db.mjs';
import { createRedis } from './core/redis.mjs';
import { emailSuppressionHash } from './core/crypto.mjs';
import { renderTemplate, sanitizeEmailHtml } from './core/templates.mjs';
import { createProviderResolver } from './providers/resolver.mjs';
import { releaseSenderReservation, reserveCampaignSender } from './core/sender-rotation.mjs';
import { addClickTracking } from './core/tracking.mjs';

const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const redis = createRedis(config.redisUrl);
await redis.connect();
const resolveProvider = createProviderResolver({ db, config });
const heartbeat = async () => redis.client.set('worker:email-delivery:heartbeat', new Date().toISOString(), 'EX', 60);
await heartbeat();
const heartbeatTimer = setInterval(() => heartbeat().catch((error) => console.error(JSON.stringify({ level: 'error', event: 'worker_heartbeat_failed', message: error.message }))), 15_000);
heartbeatTimer.unref();

async function recordEvent(context, type, detail = {}) {
  await db.query(`insert into delivery_events
    (tenant_id,campaign_recipient_id,event_type,provider,provider_message_id,detail)
    values ($1,$2,$3,$4,$5,$6)`, [context.tenant_id, context.recipient_id, type,
    detail.provider || context.provider || null, detail.providerMessageId || null,
    JSON.stringify({ scheduledMessageId: context.scheduled_message_id, ...detail })]);
}

async function startLog(context, mailbox, retryCount) {
  return (await db.query(`insert into operation_logs
    (tenant_id,operation,campaign_id,campaign_recipient_id,mailbox_id,provider,status,retry_count)
    values ($1,'SEND',$2,$3,$4,$5,'SENDING',$6) returning id`, [context.tenant_id, context.campaign_id,
    context.recipient_id, mailbox.id, mailbox.provider, retryCount])).rows[0].id;
}

async function finishLog(id, fields) {
  await db.query(`update operation_logs set finished_at=now(),status=$2,provider_message_id=$3,
    provider_response=$4,error_code=$5,error_detail=$6 where id=$1`, [id, fields.status,
    fields.providerMessageId || null, JSON.stringify(fields.providerResponse || {}), fields.errorCode || null,
    fields.errorDetail || null]);
}

const worker = new Worker('email-delivery', async (job) => {
  const { campaignId, scheduledMessageId, tenantId } = job.data;
  if (!scheduledMessageId) return { status: 'ignored_legacy_job', retryable: false };
  const { rows } = await db.query(`select
    sm.id scheduled_message_id,sm.status message_status,sm.scheduled_at,
    r.id recipient_id,r.email recipient_email,r.status recipient_status,r.tracking_token,r.unsubscribe_token,r.contact_id,
    c.first_name,c.last_name,c.university,c.specialization,c.attributes,
    p.id campaign_id,p.status campaign_status,p.physical_address,p.sender_name,
    s.subject_template,s.html_template,s.text_template,s.track_opens,s.track_clicks
    from scheduled_messages sm
    join campaign_recipients r on r.id=sm.campaign_recipient_id
    join contacts c on c.id=r.contact_id
    join campaigns p on p.id=sm.campaign_id
    join sequence_steps s on s.id=sm.sequence_step_id
    where sm.id=$2 and sm.campaign_id=$1 and sm.tenant_id=$3`, [campaignId, scheduledMessageId, tenantId]);
  const context = { ...rows[0], tenant_id: tenantId };
  if (!context.scheduled_message_id) throw new Error('DELIVERY_CONTEXT_NOT_FOUND');
  if (context.message_status !== 'QUEUED') return { status: 'already_processed', messageStatus: context.message_status };
  if (!['scheduled', 'running'].includes(context.campaign_status)) {
    if (context.campaign_status === 'paused') await db.query("update scheduled_messages set status='SCHEDULED',updated_at=now() where id=$1 and status='QUEUED'", [scheduledMessageId]);
    return { status: 'blocked', reason: 'CAMPAIGN_NOT_ACTIVE' };
  }

  const suppressed = (await db.query('select 1 from suppressions where tenant_id=$1 and email_hash=$2', [tenantId, emailSuppressionHash(context.recipient_email)])).rowCount > 0;
  if (suppressed) {
    await db.query("update scheduled_messages set status='CANCELLED',last_error_code='RECIPIENT_SUPPRESSED',finished_at=now(),updated_at=now() where id=$1", [scheduledMessageId]);
    await db.query("update campaign_recipients set status='blocked',last_error_code='RECIPIENT_SUPPRESSED',updated_at=now() where id=$1", [context.recipient_id]);
    await recordEvent(context, 'blocked', { reason: 'RECIPIENT_SUPPRESSED' });
    return { status: 'blocked', reason: 'RECIPIENT_SUPPRESSED' };
  }

  let mailbox;
  try {
    mailbox = await reserveCampaignSender(db, { campaignId, tenantId });
  } catch (error) {
    await db.query("update scheduled_messages set status='FAILED',last_error_code=$2,last_error_detail=$3,retry_count=$4,finished_at=now(),updated_at=now() where id=$1", [scheduledMessageId, error.code || 'NO_SENDER_CAPACITY', error.message, job.attemptsMade]);
    await recordEvent(context, 'blocked', { reason: error.code || 'NO_SENDER_CAPACITY', message: error.message });
    return { status: 'blocked', reason: error.code || 'NO_SENDER_CAPACITY' };
  }

  await db.query("update scheduled_messages set mailbox_id=$2,status='SENDING',started_at=now(),retry_count=$3,updated_at=now() where id=$1", [scheduledMessageId, mailbox.id, job.attemptsMade]);
  await db.query('update campaign_recipients set mailbox_id=$2,updated_at=now() where id=$1', [context.recipient_id, mailbox.id]);
  await db.query("update campaigns set status='running',updated_at=now() where id=$1 and status='scheduled'", [campaignId]);

  const contact = { email: context.recipient_email, first_name: context.first_name, last_name: context.last_name,
    university: context.university, specialization: context.specialization, ...(context.attributes || {}) };
  const unsubscribeUrl = `${config.publicApiUrl}/v1/public/unsubscribe/${context.unsubscribe_token}`;
  const pixel = `${config.publicApiUrl}/v1/public/open/${context.tracking_token}/${context.scheduled_message_id}.gif`;
  const trackingPixel = context.track_opens ? `<img src="${pixel}" width="1" height="1" alt="">` : '';
  const footer = `<hr><p style="font-size:12px;color:#666">${context.physical_address}<br><a href="${unsubscribeUrl}">Unsubscribe / إلغاء الاشتراك</a></p>${trackingPixel}`;
  const renderedHtml = renderTemplate(context.html_template, contact);
  const trackedHtml = context.track_clicks ? addClickTracking(renderedHtml, { publicApiUrl: config.publicApiUrl, messageId: context.scheduled_message_id, secret: config.webhookSigningSecret }) : renderedHtml;
  const message = {
    from: `${context.sender_name || mailbox.display_name || mailbox.email} <${mailbox.email}>`,
    to: context.recipient_email,
    subject: renderTemplate(context.subject_template, contact),
    html: sanitizeEmailHtml(trackedHtml) + footer,
    text: `${renderTemplate(context.text_template, contact)}\n\n${context.physical_address}\nUnsubscribe: ${unsubscribeUrl}`,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  };

  const logId = await startLog(context, mailbox, job.attemptsMade);
  let result;
  try {
    result = await (await resolveProvider(mailbox)).send(message);
  } catch (error) {
    await db.query("update scheduled_messages set status='UNKNOWN',last_error_code='AMBIGUOUS_PROVIDER_OUTCOME',last_error_detail=$2,finished_at=now(),updated_at=now() where id=$1", [scheduledMessageId, error.message]);
    await db.query("update campaign_recipients set status='unknown',last_error_code='AMBIGUOUS_PROVIDER_OUTCOME',last_error_detail=$2,updated_at=now() where id=$1", [context.recipient_id, error.message]);
    await db.query(`insert into outbound_messages (tenant_id,campaign_recipient_id,scheduled_message_id,mailbox_id,from_email,to_email,subject,text_body,html_body,status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'UNKNOWN') on conflict (scheduled_message_id) do nothing`, [tenantId, context.recipient_id, scheduledMessageId, mailbox.id, mailbox.email, context.recipient_email, message.subject, message.text, message.html]).catch(() => {});
    await finishLog(logId, { status: 'UNKNOWN', errorCode: 'AMBIGUOUS_PROVIDER_OUTCOME', errorDetail: error.message });
    await recordEvent({ ...context, provider: mailbox.provider }, 'unknown', { provider: mailbox.provider, reason: 'AMBIGUOUS_PROVIDER_OUTCOME' });
    return { status: 'unknown', error: { code: 'AMBIGUOUS_PROVIDER_OUTCOME', message: error.message, retryable: false } };
  }

  if (result.status !== 'accepted') {
    await releaseSenderReservation(db, mailbox.id);
    const retryable = Boolean(result.error?.retryable);
    await db.query('update scheduled_messages set status=$2,last_error_code=$3,last_error_detail=$4,retry_count=$5,updated_at=now() where id=$1', [scheduledMessageId, retryable ? 'QUEUED' : 'FAILED', result.error?.code || 'PROVIDER_REJECTED', result.error?.message || 'Provider rejected the message', job.attemptsMade]);
    await finishLog(logId, { status: retryable ? 'RETRYING' : 'FAILED', providerResponse: result.response,
      errorCode: result.error?.code || 'PROVIDER_REJECTED', errorDetail: result.error?.message });
    await recordEvent({ ...context, provider: mailbox.provider }, 'provider_rejected', { ...result, provider: mailbox.provider });
    if (retryable) throw new Error(`${result.error.code}: ${result.error.message}`);
    return result;
  }

  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query("update scheduled_messages set status='SENT',provider_message_id=$2,finished_at=now(),last_error_code=null,last_error_detail=null,updated_at=now() where id=$1", [scheduledMessageId, result.providerMessageId]);
    await client.query("update campaign_recipients set status='accepted',provider_message_id=$2,accepted_at=coalesce(accepted_at,now()),last_error_code=null,last_error_detail=null,updated_at=now() where id=$1", [context.recipient_id, result.providerMessageId]);
    await client.query(`insert into outbound_messages
      (tenant_id,campaign_recipient_id,scheduled_message_id,mailbox_id,provider_message_id,from_email,to_email,subject,text_body,html_body,status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SENT') on conflict (scheduled_message_id) do nothing`, [tenantId, context.recipient_id, scheduledMessageId, mailbox.id, result.providerMessageId, mailbox.email, context.recipient_email, message.subject, message.text, message.html]);
    await client.query(`insert into delivery_events
      (tenant_id,campaign_recipient_id,event_type,provider,provider_message_id,detail)
      values ($1,$2,'accepted',$3,$4,$5)`, [tenantId, context.recipient_id, mailbox.provider, result.providerMessageId,
      JSON.stringify({ scheduledMessageId, ...(result.response || {}) })]);
    await client.query('commit');
    await finishLog(logId, { status: 'SENT', providerMessageId: result.providerMessageId, providerResponse: result.response });
  } catch (error) {
    await client.query('rollback').catch(() => {});
    await db.query("update scheduled_messages set status='UNKNOWN',provider_message_id=$2,last_error_code='ACK_PERSISTENCE_FAILED',last_error_detail=$3,finished_at=now(),updated_at=now() where id=$1", [scheduledMessageId, result.providerMessageId, error.message]).catch(() => {});
    await db.query("update campaign_recipients set status='unknown',provider_message_id=$2,last_error_code='ACK_PERSISTENCE_FAILED',last_error_detail=$3,updated_at=now() where id=$1", [context.recipient_id, result.providerMessageId, error.message]).catch(() => {});
    await finishLog(logId, { status: 'UNKNOWN', providerMessageId: result.providerMessageId, providerResponse: result.response, errorCode: 'ACK_PERSISTENCE_FAILED', errorDetail: error.message }).catch(() => {});
    return { status: 'unknown', providerMessageId: result.providerMessageId, retryable: false };
  } finally { client.release(); }

  const remaining = (await db.query("select count(*)::int count from scheduled_messages where campaign_id=$1 and status in ('SCHEDULED','QUEUED','SENDING')", [campaignId])).rows[0].count;
  if (remaining === 0) await db.query("update campaigns set status='completed',updated_at=now() where id=$1", [campaignId]);
  return result;
}, { connection: redis.client, concurrency: 10 });

worker.on('failed', async (job, error) => {
  console.error(JSON.stringify({ level: 'error', event: 'delivery_failed', jobId: job?.id, message: error.message, attemptsMade: job?.attemptsMade }));
  if (job?.data?.scheduledMessageId && job.attemptsMade >= Number(job.opts.attempts || 1)) await db.query(
    "update scheduled_messages set status='FAILED',last_error_code='RETRIES_EXHAUSTED',last_error_detail=$2,finished_at=now(),updated_at=now() where id=$1 and status in ('QUEUED','SENDING')",
    [job.data.scheduledMessageId, error.message]).catch(() => {});
});

worker.on('completed', (job, result) => console.log(JSON.stringify({ level: 'info', event: 'delivery_completed', jobId: job.id, result })));

async function shutdown(signal) {
  clearInterval(heartbeatTimer);
  console.log(JSON.stringify({ level: 'info', event: 'worker_shutdown', signal }));
  await Promise.allSettled([worker.close(), db.close(), redis.close()]);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

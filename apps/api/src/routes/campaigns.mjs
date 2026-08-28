import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { AppError } from '../core/errors.mjs';
import { buildContactFilter } from '../core/segments.mjs';
import { boundedInteger, requireText, requireUuid } from '../core/validation.mjs';
import { enqueueScheduledMessage } from '../queue/email-queue.mjs';
import { evaluateCampaignReadiness } from '../core/readiness.mjs';

const token = () => randomBytes(24).toString('base64url');

function mailboxIdsFromBody(body) {
  const values = Array.isArray(body.mailboxIds) ? body.mailboxIds : [body.mailboxId];
  const ids = [...new Set(values.filter(Boolean).map((value) => requireUuid(value, 'mailboxId')))];
  if (!ids.length) throw new AppError('MAILBOX_REQUIRED', 'اختر حساب إرسال واحدًا على الأقل.', 400);
  return ids;
}

function delaySeconds(step) {
  const amount = boundedInteger(step.delayAmount, 'delayAmount', 0, 365, 0);
  const multiplier = { MINUTES: 60, HOURS: 3600, DAYS: 86400 }[String(step.delayUnit || 'DAYS').toUpperCase()] || 1;
  return amount * multiplier;
}

function sequenceFromBody(body, defaults = {}) {
  const source = Array.isArray(body.sequence) && body.sequence.length ? body.sequence : [{
    type: 'EMAIL', subject: body.subject, bodyText: body.text, bodyHtml: body.html
  }];
  if (source.length > 50) throw new AppError('SEQUENCE_TOO_LONG', 'الحد الأقصى 50 خطوة في التسلسل.', 400);
  let emailCount = 0;
  const steps = source.map((step, position) => {
    const type = String(step.type || 'EMAIL').toUpperCase();
    if (!['EMAIL', 'DELAY'].includes(type)) throw new AppError('VALIDATION_ERROR', 'نوع خطوة التسلسل غير مدعوم.', 400);
    if (type === 'DELAY') return { position, type, delaySeconds: delaySeconds(step), trackOpens: false, trackClicks: false };
    emailCount += 1;
    const text = requireText(step.bodyText || step.text || step.bodyHtml || step.html, `sequence[${position}].bodyText`, { max: 200000 });
    return {
      position, type,
      subject: requireText(step.subject, `sequence[${position}].subject`, { max: 500 }),
      text,
      html: requireText(step.bodyHtml || step.html || text.replace(/\n/g, '<br>'), `sequence[${position}].bodyHtml`, { max: 200000 }),
      delaySeconds: delaySeconds(step),
      trackOpens: step.trackOpens === undefined ? defaults.openTracking !== false : step.trackOpens !== false,
      trackClicks: step.trackClicks === undefined ? Boolean(defaults.clickTracking) : Boolean(step.trackClicks)
    };
  });
  if (!emailCount) throw new AppError('SEQUENCE_EMAIL_REQUIRED', 'أضف رسالة بريد واحدة على الأقل.', 400);
  return steps;
}

export function createCampaignRouter({ db, auth, emailQueue, config }) {
  const router = Router();
  router.use(auth);

  const load = async (id, tenantId) => {
    const { rows } = await db.query('select * from campaigns where id=$1 and tenant_id=$2', [id, tenantId]);
    if (!rows[0]) throw new AppError('CAMPAIGN_NOT_FOUND', 'Campaign not found', 404);
    return rows[0];
  };

  const senderPool = async (campaignId, tenantId) => (await db.query(`
    select m.id,m.provider,m.email,m.display_name,m.status,m.configured_daily_limit,
      m.effective_daily_limit,m.sent_today,m.sent_today_date,m.last_error,cs.priority
    from campaign_senders cs join mailboxes m on m.id=cs.mailbox_id
    where cs.campaign_id=$1 and m.tenant_id=$2
    order by cs.priority desc,m.email`, [campaignId, tenantId])).rows;

  const preflight = async (campaign, tenantId) => {
    const senders = await senderPool(campaign.id, tenantId);
    const filter = buildContactFilter(tenantId, campaign.segment_definition || {});
    const audience = (await db.query(`select count(*)::int total,
      count(*) filter(where not exists(select 1 from suppressions s where s.tenant_id=$1 and s.email_hash=encode(digest(lower(trim(contacts.email)),'sha256'),'hex')))::int eligible
      from contacts where ${filter.where}`, filter.values)).rows[0];
    const mailboxIds = senders.map((sender) => sender.id);
    const history = mailboxIds.length ? (await db.query(`select coalesce(
      count(*) filter(where r.status='bounced')::float /
      nullif(count(*) filter(where r.status in ('accepted','delivered','opened','clicked','replied','bounced')),0),0) bounce_rate
      from campaign_recipients r where r.mailbox_id=any($1::uuid[])`, [mailboxIds])).rows[0] : { bounce_rate: 0 };
    const university = campaign.segment_definition?.university;
    const evidence = university ? (await db.query(`select coalesce(max(r.evidence_count),0)::int evidence_count
      from research_runs r join universities u on u.id=r.university_id
      where r.tenant_id=$1 and r.status='completed' and lower(u.name)=lower($2)`, [tenantId, university])).rows[0] : { evidence_count: 0 };
    const today = new Date().toISOString().slice(0, 10);
    const healthy = senders.filter((sender) => sender.status === 'healthy');
    const capacity = healthy.reduce((total, sender) => total + Number(sender.effective_daily_limit || 0), 0);
    const sentToday = healthy.reduce((total, sender) => total + (String(sender.sent_today_date) === today ? Number(sender.sent_today || 0) : 0), 0);
    const readiness = evaluateCampaignReadiness({
      mailboxStatus: healthy.length ? 'healthy' : 'unhealthy',
      eligibleRecipients: audience.eligible,
      suppressedRecipients: audience.total - audience.eligible,
      dailyLimit: capacity,
      sentToday,
      physicalAddress: campaign.physical_address,
      senderName: campaign.sender_name,
      subject: campaign.subject_template,
      text: campaign.text_template,
      bounceRate: history.bounce_rate,
      evidenceCount: evidence.evidence_count,
      targetsUniversity: Boolean(university)
    });
    return { ...readiness, senders, availableSenders: healthy.length, remainingCapacity: Math.max(0, capacity - sentToday) };
  };

  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await db.query(`select c.*,
        (select count(*)::int from campaign_recipients r where r.campaign_id=c.id) recipients,
        (select count(*)::int from campaign_senders cs where cs.campaign_id=c.id) sender_count,
        (select count(*)::int from scheduled_messages sm where sm.campaign_id=c.id and sm.status in ('SENT','DELIVERED','OPENED','CLICKED','REPLIED')) sent,
        (select count(*)::int from scheduled_messages sm where sm.campaign_id=c.id and sm.status in ('DELIVERED','OPENED','CLICKED','REPLIED')) delivered,
        (select count(*)::int from scheduled_messages sm where sm.campaign_id=c.id and sm.status='FAILED') failed
        from campaigns c where c.tenant_id=$1 order by c.created_at desc`, [req.auth.tenant_id]);
      res.json({ ok: true, data: rows.map((campaign) => ({
        ...campaign,
        leadCount: campaign.recipients,
        senderCount: campaign.sender_count,
        createdAt: campaign.created_at,
        updatedAt: campaign.updated_at,
        startsAt: campaign.scheduled_at,
        metrics: { sent: campaign.sent, delivered: campaign.delivered, opened: 0, clicked: 0, replies: 0, positiveReplies: 0, bounced: 0, failed: campaign.failed, unsubscribed: 0 }
      })) });
    } catch (error) { next(error); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const campaign = await load(requireUuid(req.params.id), req.auth.tenant_id);
      const sequence = (await db.query(`select id,position,step_type type,subject_template subject,text_template "bodyText",html_template "bodyHtml",
        delay_seconds "delaySeconds",track_opens "trackOpens",track_clicks "trackClicks" from sequence_steps where campaign_id=$1 order by position`, [campaign.id])).rows;
      res.json({ ok: true, data: { campaign, senders: await senderPool(campaign.id, req.auth.tenant_id), sequence } });
    } catch (error) { next(error); }
  });

  router.post('/preview-count', async (req, res, next) => {
    try {
      const filter = buildContactFilter(req.auth.tenant_id, req.body.segment || {});
      const count = (await db.query(`select count(*)::int count from contacts where ${filter.where}`, filter.values)).rows[0].count;
      res.json({ ok: true, data: { count } });
    } catch (error) { next(error); }
  });

  router.post('/', async (req, res, next) => {
    const client = await db.connect();
    try {
      const mailboxIds = mailboxIdsFromBody(req.body);
      const settings = (await client.query('select tracking from app_settings where tenant_id=$1', [req.auth.tenant_id])).rows[0] || { tracking: {} };
      const sequence = sequenceFromBody(req.body, settings.tracking);
      const firstEmail = sequence.find((step) => step.type === 'EMAIL');
      const found = (await client.query('select id from mailboxes where tenant_id=$1 and id=any($2::uuid[])', [req.auth.tenant_id, mailboxIds])).rows;
      if (found.length !== mailboxIds.length) throw new AppError('MAILBOX_NOT_FOUND', 'أحد حسابات الإرسال غير موجود.', 404);
      await client.query('begin');
      const campaign = (await client.query(`insert into campaigns
        (tenant_id,mailbox_id,name,subject_template,html_template,text_template,segment_definition,max_jitter_seconds,physical_address,sender_name)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`, [
        req.auth.tenant_id,
        mailboxIds[0],
        requireText(req.body.name, 'name', { max: 200 }),
        firstEmail.subject,
        firstEmail.html,
        firstEmail.text,
        JSON.stringify(req.body.segment || {}),
        boundedInteger(req.body.maxJitterSeconds, 'maxJitterSeconds', 0, 3600, 120),
        requireText(req.body.physicalAddress, 'physicalAddress', { max: 500 }),
        requireText(req.body.senderName || 'Jareed Soft', 'senderName', { max: 120 })
      ])).rows[0];
      for (const mailboxId of mailboxIds) await client.query('insert into campaign_senders (campaign_id,mailbox_id) values ($1,$2)', [campaign.id, mailboxId]);
      for (const step of sequence) await client.query(`insert into sequence_steps
        (campaign_id,position,step_type,subject_template,html_template,text_template,delay_seconds,track_opens,track_clicks)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [campaign.id, step.position, step.type, step.subject || null, step.html || null, step.text || null, step.delaySeconds, step.trackOpens, step.trackClicks]);
      await client.query('commit');
      res.status(201).json({ ok: true, data: { ...campaign, mailbox_ids: mailboxIds, sequence } });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      next(error);
    } finally { client.release(); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const campaign = await load(requireUuid(req.params.id), req.auth.tenant_id);
      if (!['draft', 'paused', 'failed'].includes(campaign.status)) throw new AppError('CAMPAIGN_STATE_INVALID', 'أوقف الحملة قبل تعديل تفاصيلها.', 409);
      const { rows } = await db.query(`update campaigns set name=$3,segment_definition=$4,physical_address=$5,sender_name=$6,updated_at=now()
        where id=$1 and tenant_id=$2 returning *`, [campaign.id, req.auth.tenant_id,
        requireText(req.body.name || campaign.name, 'name', { max: 200 }), JSON.stringify(req.body.segment || campaign.segment_definition || {}),
        requireText(req.body.physicalAddress || campaign.physical_address, 'physicalAddress', { max: 500 }),
        requireText(req.body.senderName || campaign.sender_name, 'senderName', { max: 120 })]);
      res.json({ ok: true, data: rows[0] });
    } catch (error) { next(error); }
  });

  router.put('/:id/sequence', async (req, res, next) => {
    const client = await db.connect();
    try {
      const campaign = await load(requireUuid(req.params.id), req.auth.tenant_id);
      if (!['draft', 'paused', 'failed'].includes(campaign.status)) throw new AppError('CAMPAIGN_STATE_INVALID', 'أوقف الحملة قبل تعديل التسلسل.', 409);
      const sent = (await client.query("select count(*)::int count from scheduled_messages where campaign_id=$1 and status not in ('SCHEDULED','QUEUED','FAILED','CANCELLED')", [campaign.id])).rows[0].count;
      if (sent > 0) throw new AppError('SEQUENCE_ALREADY_STARTED', 'لا يمكن استبدال تسلسل بدأ إرساله.', 409);
      const settings = (await client.query('select tracking from app_settings where tenant_id=$1', [req.auth.tenant_id])).rows[0] || { tracking: {} };
      const sequence = sequenceFromBody(req.body, settings.tracking);
      const firstEmail = sequence.find((step) => step.type === 'EMAIL');
      await client.query('begin');
      await client.query('delete from scheduled_messages where campaign_id=$1', [campaign.id]);
      await client.query('delete from sequence_steps where campaign_id=$1', [campaign.id]);
      for (const step of sequence) await client.query(`insert into sequence_steps
        (campaign_id,position,step_type,subject_template,html_template,text_template,delay_seconds,track_opens,track_clicks)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [campaign.id, step.position, step.type, step.subject || null, step.html || null, step.text || null, step.delaySeconds, step.trackOpens, step.trackClicks]);
      await client.query('update campaigns set subject_template=$2,html_template=$3,text_template=$4,updated_at=now() where id=$1', [campaign.id, firstEmail.subject, firstEmail.html, firstEmail.text]);
      await client.query('commit');
      res.json({ ok: true, data: sequence });
    } catch (error) { await client.query('rollback').catch(() => {}); next(error); }
    finally { client.release(); }
  });

  router.put('/:id/senders', async (req, res, next) => {
    const client = await db.connect();
    try {
      const campaign = await load(requireUuid(req.params.id), req.auth.tenant_id);
      if (!['draft', 'paused', 'failed'].includes(campaign.status)) throw new AppError('CAMPAIGN_STATE_INVALID', 'أوقف الحملة قبل تغيير المرسلين.', 409);
      const mailboxIds = mailboxIdsFromBody(req.body);
      const found = (await client.query('select id from mailboxes where tenant_id=$1 and id=any($2::uuid[])', [req.auth.tenant_id, mailboxIds])).rows;
      if (found.length !== mailboxIds.length) throw new AppError('MAILBOX_NOT_FOUND', 'أحد حسابات الإرسال غير موجود.', 404);
      await client.query('begin');
      await client.query('delete from campaign_senders where campaign_id=$1', [campaign.id]);
      for (const mailboxId of mailboxIds) await client.query('insert into campaign_senders (campaign_id,mailbox_id) values ($1,$2)', [campaign.id, mailboxId]);
      await client.query('update campaigns set mailbox_id=$2,updated_at=now() where id=$1', [campaign.id, mailboxIds[0]]);
      await client.query('commit');
      res.json({ ok: true, data: await senderPool(campaign.id, req.auth.tenant_id) });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      next(error);
    } finally { client.release(); }
  });

  router.get('/:id/preflight', async (req, res, next) => {
    try {
      const campaign = await load(requireUuid(req.params.id), req.auth.tenant_id);
      res.json({ ok: true, data: await preflight(campaign, req.auth.tenant_id) });
    } catch (error) { next(error); }
  });

  async function queueCampaign(campaign, tenantId) {
    const settings = (await db.query('select sending from app_settings where tenant_id=$1', [tenantId])).rows[0]?.sending || {};
    const messages = (await db.query(`update scheduled_messages set status='QUEUED',updated_at=now()
      where campaign_id=$1 and status in ('SCHEDULED','FAILED') returning id,scheduled_at`, [campaign.id])).rows;
    const added = [];
    try {
      for (const message of messages) {
        const job = await enqueueScheduledMessage(emailQueue, { campaignId: campaign.id, scheduledMessageId: message.id, tenantId }, {
          scheduledAt: message.scheduled_at,
          maxJitterMs: campaign.max_jitter_seconds * 1000,
          jitterSecret: config.webhookSigningSecret,
          attempts: Number(settings.retryMaxAttempts || 4),
          retryBaseDelayMs: Number(settings.retryBaseDelaySeconds || 30) * 1000
        });
        added.push(job);
      }
      await db.query("update campaign_recipients set status='queued',queued_at=coalesce(queued_at,now()),updated_at=now() where campaign_id=$1 and status='pending'", [campaign.id]);
      return messages.length;
    } catch (error) {
      await Promise.allSettled(added.filter((job) => job.jareedCreated).map((job) => job.remove()));
      await db.query("update scheduled_messages set status='SCHEDULED',updated_at=now() where campaign_id=$1 and status='QUEUED'", [campaign.id]);
      throw error;
    }
  }

  router.post('/:id/schedule', async (req, res, next) => {
    const client = await db.connect();
    try {
      const campaign = await load(requireUuid(req.params.id), req.auth.tenant_id);
      if (!['draft', 'paused', 'failed'].includes(campaign.status)) throw new AppError('CAMPAIGN_STATE_INVALID', `Campaign is ${campaign.status}`, 409);
      const readiness = await preflight(campaign, req.auth.tenant_id);
      if (!readiness.ready) throw new AppError('CAMPAIGN_NOT_READY', 'الحملة غير جاهزة للإطلاق. افتح فحص الجاهزية لمعرفة الأسباب.', 409, readiness);
      const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date();
      if (Number.isNaN(scheduledAt.getTime())) throw new AppError('VALIDATION_ERROR', 'scheduledAt is invalid', 400);
      const filter = buildContactFilter(req.auth.tenant_id, campaign.segment_definition || {});
      await client.query('begin');
      const contacts = (await client.query(`select id,email from contacts where ${filter.where}`, filter.values)).rows;
      if (!contacts.length) throw new AppError('EMPTY_SEGMENT', 'No eligible contacts match this segment', 409);
      for (const contact of contacts) await client.query(`insert into campaign_recipients
        (campaign_id,contact_id,email,tracking_token,unsubscribe_token) values ($1,$2,$3,$4,$5)
        on conflict (campaign_id,contact_id) do nothing`, [campaign.id, contact.id, contact.email, token(), token()]);
      if (campaign.status !== 'draft') await client.query("update campaign_recipients set status='pending',mailbox_id=null,updated_at=now() where campaign_id=$1 and status in ('queued','blocked','failed')", [campaign.id]);
      const recipients = (await client.query('select id from campaign_recipients where campaign_id=$1', [campaign.id])).rows;
      const steps = (await client.query('select * from sequence_steps where campaign_id=$1 order by position', [campaign.id])).rows;
      const sendingSettings = (await client.query('select sending from app_settings where tenant_id=$1', [req.auth.tenant_id])).rows[0]?.sending || {};
      const delayBetween = Number(sendingSettings.delayBetweenMessagesSeconds || 30);
      const senderCount = Math.max(1, Number(readiness.availableSenders || 1));
      for (let recipientIndex = 0; recipientIndex < recipients.length; recipientIndex += 1) {
        const recipient = recipients[recipientIndex];
        let elapsedSeconds = 0;
        for (const step of steps) {
          elapsedSeconds += Number(step.delay_seconds || 0);
          if (step.step_type === 'DELAY') continue;
          const staggerSeconds = Math.floor(recipientIndex / senderCount) * delayBetween;
          const messageTime = new Date(scheduledAt.getTime() + (elapsedSeconds + staggerSeconds) * 1000);
          await client.query(`insert into scheduled_messages
            (tenant_id,campaign_id,campaign_recipient_id,sequence_step_id,status,scheduled_at)
            values ($1,$2,$3,$4,'SCHEDULED',$5)
            on conflict (campaign_recipient_id,sequence_step_id) do update set scheduled_at=excluded.scheduled_at,status=case
              when scheduled_messages.status in ('FAILED','CANCELLED','SCHEDULED','QUEUED') then 'SCHEDULED' else scheduled_messages.status end,updated_at=now()`,
          [req.auth.tenant_id, campaign.id, recipient.id, step.id, messageTime]);
        }
      }
      await client.query("update campaigns set status='scheduled',scheduled_at=$2,updated_at=now() where id=$1", [campaign.id, scheduledAt]);
      await client.query('commit');
      const queued = await queueCampaign(campaign, req.auth.tenant_id);
      res.json({ ok: true, data: { campaignId: campaign.id, queued, scheduledAt: scheduledAt.toISOString(), senderCount: readiness.availableSenders } });
    } catch (error) {
      await client.query('rollback').catch(() => {});
      await db.query("update campaigns set status='failed',updated_at=now() where id=$1 and tenant_id=$2 and status='scheduled'", [req.params.id, req.auth.tenant_id]).catch(() => {});
      next(error);
    } finally { client.release(); }
  });

  router.post('/:id/pause', async (req, res, next) => {
    try {
      const id = requireUuid(req.params.id);
      const { rows } = await db.query("update campaigns set status='paused',updated_at=now() where id=$1 and tenant_id=$2 and status in ('scheduled','running') returning *", [id, req.auth.tenant_id]);
      if (!rows[0]) throw new AppError('CAMPAIGN_STATE_INVALID', 'Campaign cannot be paused', 409);
      res.json({ ok: true, data: rows[0] });
    } catch (error) { next(error); }
  });

  router.post('/:id/resume', async (req, res, next) => {
    try {
      const campaign = await load(requireUuid(req.params.id), req.auth.tenant_id);
      if (campaign.status !== 'paused') throw new AppError('CAMPAIGN_STATE_INVALID', 'Only a paused campaign can resume', 409);
      const readiness = await preflight(campaign, req.auth.tenant_id);
      if (!readiness.ready) throw new AppError('CAMPAIGN_NOT_READY', 'لا يمكن استئناف الحملة قبل إصلاح أسباب عدم الجاهزية.', 409, readiness);
      await db.query("update campaigns set status='scheduled',updated_at=now() where id=$1", [campaign.id]);
      const queued = await queueCampaign(campaign, req.auth.tenant_id);
      res.json({ ok: true, data: { campaignId: campaign.id, queued } });
    } catch (error) { next(error); }
  });

  router.get('/:id/analytics', async (req, res, next) => {
    try {
      const campaign = await load(requireUuid(req.params.id), req.auth.tenant_id);
      const { rows } = await db.query(`select count(*)::int total,
        count(*) filter(where status in ('SENT','DELIVERED','OPENED','CLICKED','REPLIED'))::int accepted,
        count(*) filter(where status in ('DELIVERED','OPENED','CLICKED','REPLIED'))::int delivered,
        count(*) filter(where status in ('OPENED','CLICKED','REPLIED'))::int opened,
        count(*) filter(where status='CLICKED')::int clicked,
        count(*) filter(where status='REPLIED')::int replied,
        count(*) filter(where status='BOUNCED')::int bounced,
        count(*) filter(where status='FAILED')::int failed,
        0::int blocked,
        count(*) filter(where status='UNKNOWN')::int unknown
        from scheduled_messages where campaign_id=$1`, [campaign.id]);
      const senders = (await db.query(`select m.email,m.provider,count(sm.id)::int assigned,
        count(sm.id) filter(where sm.status in ('SENT','DELIVERED','OPENED','CLICKED','REPLIED'))::int accepted,
        count(sm.id) filter(where sm.status='FAILED')::int failed
        from campaign_senders cs join mailboxes m on m.id=cs.mailbox_id
        left join scheduled_messages sm on sm.campaign_id=cs.campaign_id and sm.mailbox_id=m.id
        where cs.campaign_id=$1 group by m.id order by m.email`, [campaign.id])).rows;
      res.json({ ok: true, data: { campaign, metrics: rows[0], senders } });
    } catch (error) { next(error); }
  });

  return router;
}

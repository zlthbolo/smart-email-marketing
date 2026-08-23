import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../core/errors.mjs';
import { emailSuppressionHash } from '../core/crypto.mjs';
import { requireText } from '../core/validation.mjs';
import { classifyReplyIntent, extractInboundReply } from '../core/replies.mjs';

const allowedEvents = new Set(['delivered', 'opened', 'clicked', 'replied', 'bounced', 'complained']);
const allowedProviders = new Set(['gmail', 'microsoft_graph', 'smtp', 'api', 'test_sink']);

function validSignature(rawBody, supplied, secret) {
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const left = Buffer.from(String(supplied || '')); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createWebhookRouter({ db, config }) {
  const router = Router();
  router.post('/events', async (req, res, next) => {
    const client = await db.connect();
    try {
      if (!validSignature(req.rawBody || Buffer.alloc(0), req.header('x-jareed-signature'), config.webhookSigningSecret)) throw new AppError('INVALID_SIGNATURE', 'Webhook signature is invalid', 401);
      const providerEventId = requireText(req.body.providerEventId, 'providerEventId', { max: 500 });
      const providerMessageId = requireText(req.body.providerMessageId, 'providerMessageId', { max: 1000 });
      const provider = String(req.body.provider || ''); const eventType = String(req.body.eventType || '');
      if (!allowedProviders.has(provider) || !allowedEvents.has(eventType)) throw new AppError('VALIDATION_ERROR', 'Provider or event type is unsupported', 400);
      await client.query('begin');
      const recipient = (await client.query(`select r.id,r.email,c.tenant_id,c.mailbox_id from campaign_recipients r join campaigns c on c.id=r.campaign_id join mailboxes m on m.id=c.mailbox_id where r.provider_message_id=$1 and m.provider=$2 for update`, [providerMessageId, provider])).rows[0];
      if (!recipient) throw new AppError('RECIPIENT_NOT_FOUND', 'No recipient matches this provider acknowledgement', 404);
      const inserted = await client.query(`insert into provider_events (tenant_id,provider,provider_event_id,event_type,payload) values ($1,$2,$3,$4,$5) on conflict (provider,provider_event_id) do nothing returning id`, [recipient.tenant_id, provider, providerEventId, eventType, JSON.stringify(req.body)]);
      if (!inserted.rowCount) { await client.query('rollback'); return res.json({ ok: true, data: { duplicate: true } }); }
      const columns = { delivered: ['delivered', 'delivered_at'], opened: ['opened', 'opened_at'], clicked: ['clicked', 'clicked_at'], replied: ['replied', 'replied_at'], bounced: ['bounced', 'bounced_at'], complained: ['complained', null] };
      const [status, timestamp] = columns[eventType];
      if (timestamp) await client.query(`update campaign_recipients set status=$2,${timestamp}=coalesce(${timestamp},now()),updated_at=now() where id=$1`, [recipient.id, status]);
      else await client.query('update campaign_recipients set status=$2,updated_at=now() where id=$1', [recipient.id, status]);
      if (eventType === 'bounced' || eventType === 'complained') await client.query(`insert into suppressions (tenant_id,email_hash,reason,source) values ($1,$2,$3,'provider_webhook') on conflict (tenant_id,email_hash) do update set reason=excluded.reason,source=excluded.source`, [recipient.tenant_id, emailSuppressionHash(recipient.email), eventType === 'bounced' ? 'hard_bounce' : 'complaint']);
      if (eventType === 'replied') {
        const reply = extractInboundReply(req.body);
        const classification = classifyReplyIntent(reply.textBody);
        await client.query(`insert into inbound_messages (tenant_id,campaign_recipient_id,mailbox_id,provider,provider_event_id,provider_message_id,from_email,subject,text_body,html_body,intent,requires_human,received_at,raw_payload)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,coalesce($13::timestamptz,now()),$14)
          on conflict (provider,provider_event_id) do nothing`, [recipient.tenant_id, recipient.id, recipient.mailbox_id, provider, providerEventId, providerMessageId, recipient.email, reply.subject, reply.textBody, reply.htmlBody, classification.intent, classification.requiresHuman, reply.receivedAt, JSON.stringify(req.body)]);
        if (classification.intent === 'unsubscribe') await client.query(`insert into suppressions (tenant_id,email_hash,reason,source) values ($1,$2,'unsubscribe','reply_intent') on conflict (tenant_id,email_hash) do update set reason=excluded.reason,source=excluded.source`, [recipient.tenant_id, emailSuppressionHash(recipient.email)]);
      }
      await client.query('insert into delivery_events (tenant_id,campaign_recipient_id,event_type,provider,provider_message_id,detail) values ($1,$2,$3,$4,$5,$6)', [recipient.tenant_id, recipient.id, eventType, provider, providerMessageId, JSON.stringify(req.body.detail || {})]);
      await client.query('update provider_events set processed_at=now() where id=$1', [inserted.rows[0].id]);
      await client.query('commit');
      res.json({ ok: true, data: { processed: true, eventType } });
    } catch (error) { await client.query('rollback').catch(() => {}); next(error); }
    finally { client.release(); }
  });
  return router;
}

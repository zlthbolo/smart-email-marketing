import { Router } from 'express';
import { AppError } from '../core/errors.mjs';
import { boundedInteger, requireUuid } from '../core/validation.mjs';

const intents = new Set(['interested', 'not_interested', 'question', 'out_of_office', 'unsubscribe', 'unknown']);

export function createInboxRouter({ db, auth }) {
  const router = Router();
  router.use(auth);

  router.get('/', async (req, res, next) => {
    try {
      const limit = boundedInteger(req.query.limit, 'limit', 1, 200, 100);
      const values = [req.auth.tenant_id];
      const filters = ['i.tenant_id=$1'];
      if (req.query.intent) {
        if (!intents.has(String(req.query.intent))) throw new AppError('VALIDATION_ERROR', 'Unsupported reply intent', 400);
        values.push(String(req.query.intent)); filters.push(`i.intent=$${values.length}`);
      }
      if (req.query.state === 'unhandled') filters.push('i.handled_at is null');
      if (req.query.state === 'handled') filters.push('i.handled_at is not null');
      values.push(limit);
      const { rows } = await db.query(`select i.id,i.provider,i.provider_message_id,i.from_email,i.subject,i.text_body,i.intent,i.intent_source,i.requires_human,i.handled_at,i.received_at,
        c.name campaign_name,m.email mailbox_email,r.email contact_email
        from inbound_messages i
        join campaign_recipients r on r.id=i.campaign_recipient_id
        join campaigns c on c.id=r.campaign_id
        left join mailboxes m on m.id=i.mailbox_id
        where ${filters.join(' and ')} order by i.received_at desc limit $${values.length}`, values);
      res.json({ ok: true, data: rows });
    } catch (error) { next(error); }
  });

  router.post('/:id/resolve', async (req, res, next) => {
    try {
      const id = requireUuid(req.params.id);
      const result = await db.query(`update inbound_messages set handled_at=coalesce(handled_at,now()),handled_by=$3
        where id=$1 and tenant_id=$2 returning id,handled_at`, [id, req.auth.tenant_id, req.auth.user_id]);
      if (!result.rowCount) throw new AppError('MESSAGE_NOT_FOUND', 'Reply message not found', 404);
      await db.query(`insert into audit_log (tenant_id,user_id,action,entity_type,entity_id) values ($1,$2,'inbox.reply_resolved','inbound_message',$3)`, [req.auth.tenant_id, req.auth.user_id, id]);
      res.json({ ok: true, data: result.rows[0] });
    } catch (error) { next(error); }
  });

  return router;
}

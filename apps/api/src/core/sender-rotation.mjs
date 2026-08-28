import { AppError } from './errors.mjs';

export function rankEligibleSenders(senders) {
  return senders
    .filter((sender) => sender.status === 'healthy')
    .map((sender) => {
      const sentToday = Number(sender.sent_today || 0);
      const limit = Math.max(0, Number(sender.effective_daily_limit || 0));
      return { ...sender, sentToday, limit, remaining: Math.max(0, limit - sentToday) };
    })
    .filter((sender) => sender.remaining > 0)
    .sort((left, right) => {
      const utilization = left.sentToday / left.limit - right.sentToday / right.limit;
      if (utilization !== 0) return utilization;
      const priority = Number(right.priority || 0) - Number(left.priority || 0);
      if (priority !== 0) return priority;
      if (left.sentToday !== right.sentToday) return left.sentToday - right.sentToday;
      return String(left.id).localeCompare(String(right.id));
    });
}

export async function reserveCampaignSender(db, { campaignId, tenantId }) {
  const client = await db.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(`
      select m.*, cs.priority
      from campaign_senders cs
      join mailboxes m on m.id=cs.mailbox_id
      where cs.campaign_id=$1 and m.tenant_id=$2 and m.status='healthy'
        and (case when m.sent_today_date=current_date then m.sent_today else 0 end) <
          least(m.configured_daily_limit,
            floor(10*power(1.35,(case when m.sent_today_date<current_date then m.warmup_day+(current_date-m.sent_today_date) else m.warmup_day end)-1)))::int
      order by
        (case when m.sent_today_date=current_date then m.sent_today else 0 end)::numeric /
          greatest(1, least(m.configured_daily_limit,
            floor(10*power(1.35,(case when m.sent_today_date<current_date then m.warmup_day+(current_date-m.sent_today_date) else m.warmup_day end)-1)))::int) asc,
        cs.priority desc,
        m.sent_today asc,
        m.id asc
      for update of m skip locked
      limit 1`, [campaignId, tenantId]);
    const sender = rows[0];
    if (!sender) {
      await client.query('rollback');
      throw new AppError('NO_SENDER_CAPACITY', 'لا يوجد حساب إرسال سليم لديه سعة متبقية اليوم.', 409);
    }
    const reserved = (await client.query(`
      update mailboxes set
        warmup_day=case when sent_today_date<current_date then warmup_day+(current_date-sent_today_date) else warmup_day end,
        effective_daily_limit=least(configured_daily_limit,
          floor(10*power(1.35,(case when sent_today_date<current_date then warmup_day+(current_date-sent_today_date) else warmup_day end)-1)))::int,
        sent_today=case when sent_today_date=current_date then sent_today+1 else 1 end,
        sent_today_date=current_date,
        updated_at=now()
      where id=$1
      returning *`, [sender.id])).rows[0];
    await client.query('commit');
    return { ...reserved, priority: sender.priority };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseSenderReservation(db, mailboxId) {
  await db.query(`update mailboxes set sent_today=greatest(0,sent_today-1),updated_at=now()
    where id=$1 and sent_today_date=current_date`, [mailboxId]);
}

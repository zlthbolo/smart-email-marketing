import { Router } from 'express';
import { buildOperatorActions } from '../core/readiness.mjs';

export function createInsightRouter({ db, auth }) {
  const router = Router();
  router.use(auth);

  router.get('/overview', async (req, res, next) => {
    try {
      const tenantId = req.auth.tenant_id;
      const [counts, universities, providers] = await Promise.all([
        db.query(`select
          (select count(*)::int from contacts where tenant_id=$1 and consent_revoked_at is null) contacts,
          (select count(*)::int from universities where tenant_id=$1) universities,
          (select count(*)::int from mailboxes where tenant_id=$1 and status='healthy') healthy_mailboxes,
          (select count(*)::int from campaigns where tenant_id=$1) campaigns,
          (select count(*)::int from research_runs where tenant_id=$1 and status='completed') completed_research,
          (select count(*)::int from campaigns c where c.tenant_id=$1 and (select count(*) filter(where r.status='bounced')::float/nullif(count(*),0) from campaign_recipients r where r.campaign_id=c.id)>=0.05) high_bounce_campaigns`, [tenantId]),
        db.query(`select coalesce(c.university,'غير محددة') university,
          count(distinct c.id)::int contacts,
          count(distinct c.specialization) filter(where c.specialization is not null)::int specializations,
          count(r.id) filter(where r.status in ('accepted','delivered','opened','clicked','replied'))::int accepted,
          count(r.id) filter(where r.replied_at is not null)::int replies,
          count(r.id) filter(where r.status='bounced')::int bounces
        from contacts c
        left join campaign_recipients r on r.contact_id=c.id
        where c.tenant_id=$1 and c.consent_revoked_at is null
        group by c.university order by contacts desc limit 12`, [tenantId]),
        db.query(`select provider,status,count(*)::int mailboxes,sum(sent_today)::int sent_today,sum(effective_daily_limit)::int daily_limit
          from mailboxes where tenant_id=$1 group by provider,status order by provider,status`, [tenantId])
      ]);
      const row = counts.rows[0];
      const summary = {
        contacts: row.contacts,
        universities: row.universities,
        healthyMailboxes: row.healthy_mailboxes,
        campaigns: row.campaigns,
        completedResearch: row.completed_research,
        highBounceCampaigns: row.high_bounce_campaigns
      };
      res.json({ ok: true, data: { summary, actions: buildOperatorActions(summary), universities: universities.rows, providers: providers.rows } });
    } catch (error) { next(error); }
  });

  return router;
}

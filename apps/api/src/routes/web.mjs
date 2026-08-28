import { Router } from 'express';
import tls from 'node:tls';
import { decryptCredential, encryptCredential } from '../core/crypto.mjs';
import { AppError } from '../core/errors.mjs';
import { boundedInteger, requireEmail, requireText, requireUuid } from '../core/validation.mjs';

const upper = (value) => String(value || 'UNKNOWN').toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);

function accountKind(mailbox) {
  if (mailbox.provider === 'gmail') return 'GMAIL_OAUTH';
  if (mailbox.provider === 'microsoft_graph') return 'OUTLOOK';
  return mailbox.provider_metadata?.accountKind || (mailbox.provider === 'api' ? 'API' : 'SMTP_IMAP');
}

function mapAccount(mailbox) {
  const sentToday = String(mailbox.sent_today_date) === today() ? Number(mailbox.sent_today || 0) : 0;
  const dailyLimit = Number(mailbox.configured_daily_limit || 0);
  const connected = mailbox.status === 'healthy';
  const paused = mailbox.status === 'disabled';
  const imapConfigured = Boolean(mailbox.provider_metadata?.imapConfigured || ['gmail', 'microsoft_graph'].includes(mailbox.provider));
  const imapVerified = Boolean(mailbox.provider_metadata?.imapVerifiedAt || ['gmail', 'microsoft_graph'].includes(mailbox.provider) && connected);
  return {
    id: mailbox.id,
    email: mailbox.email,
    provider: accountKind(mailbox),
    senderName: mailbox.display_name || mailbox.email,
    smtpStatus: connected ? 'CONNECTED' : paused ? 'PAUSED' : mailbox.status === 'unhealthy' ? 'PROBLEM' : 'UNKNOWN',
    imapStatus: !imapConfigured ? 'NOT_CONFIGURED' : imapVerified ? 'CONNECTED' : paused ? 'PAUSED' : mailbox.status === 'unhealthy' ? 'PROBLEM' : 'UNKNOWN',
    authenticationStatus: connected ? 'AUTHENTICATED' : paused ? 'PAUSED' : upper(mailbox.status),
    dailyLimit,
    sentToday,
    remainingToday: Math.max(0, dailyLimit - sentToday),
    health: connected ? 'HEALTHY' : paused ? 'WARNING' : mailbox.status === 'unhealthy' ? 'PROBLEM' : 'UNKNOWN',
    lastError: mailbox.last_error,
    lastSuccessfulSendAt: mailbox.last_successful_send_at,
    state: paused ? 'PAUSED' : 'ACTIVE',
    createdAt: mailbox.created_at,
    updatedAt: mailbox.updated_at
  };
}

function imapLogin(credentials) {
  const settings = credentials.imap;
  if (!settings) return Promise.resolve({ configured: false });
  if (!settings.secure) throw new AppError('IMAP_TLS_REQUIRED', 'يلزم اتصال IMAP مشفّر عبر TLS مباشر.', 422);
  const escape = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return new Promise((resolve, reject) => {
    let buffer = '';
    let loginSent = false;
    let settled = false;
    const socket = tls.connect({
      host: settings.host,
      port: Number(settings.port || 993),
      servername: settings.host,
      rejectUnauthorized: true
    });
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (error) reject(error); else resolve(result);
    };
    const timeout = setTimeout(() => finish(new AppError('IMAP_TIMEOUT', 'انتهت مهلة اتصال IMAP.', 504)), 15_000);
    socket.setEncoding('utf8');
    socket.on('error', (error) => finish(new AppError(String(error.code || 'IMAP_CONNECTION_FAILED'), error.message, 422)));
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (!loginSent && /(^|\r?\n)\* (OK|PREAUTH)/i.test(buffer)) {
        loginSent = true;
        socket.write(`A001 LOGIN "${escape(settings.username)}" "${escape(settings.password)}"\r\n`);
      }
      const tagged = buffer.match(/(^|\r?\n)A001\s+(OK|NO|BAD)\b[^\r\n]*/i);
      if (!tagged) return;
      if (tagged[2].toUpperCase() === 'OK') finish(null, { configured: true, authenticated: true });
      else finish(new AppError('IMAP_AUTH_FAILED', tagged[0].trim(), 422));
    });
  });
}

function credentialsFromBody(body, existing = {}) {
  const kind = String(body.provider || existing.accountKind || 'SMTP_IMAP').toUpperCase();
  if (kind === 'GMAIL_APP_PASSWORD') {
    const password = body.appPassword ? requireText(String(body.appPassword).replace(/\s/g, ''), 'appPassword', { max: 1000 }) : existing.password;
    if (!password) throw new AppError('VALIDATION_ERROR', 'كلمة مرور تطبيق Gmail مطلوبة.', 400);
    const email = requireEmail(body.email || existing.username);
    return {
      host: 'smtp.gmail.com', port: 465, secure: true, username: email, password,
      imap: { host: 'imap.gmail.com', port: 993, secure: true, username: email, password }, accountKind: kind
    };
  }
  if (!['SMTP_IMAP', 'OUTLOOK'].includes(kind)) throw new AppError('PROVIDER_NOT_SUPPORTED', 'استخدم Google OAuth أو SMTP + IMAP.', 400);
  const password = body.smtpPassword || existing.password;
  const imapPassword = body.imapPassword || existing.imap?.password;
  if (!password || !imapPassword) throw new AppError('VALIDATION_ERROR', 'كلمتا مرور SMTP وIMAP مطلوبتان.', 400);
  return {
    host: requireText(body.smtpHost || existing.host, 'smtpHost', { max: 255 }),
    port: boundedInteger(body.smtpPort ?? existing.port, 'smtpPort', 1, 65535, 587),
    secure: body.smtpSecure === undefined ? Boolean(existing.secure) : Boolean(body.smtpSecure),
    username: requireText(body.smtpUsername || existing.username, 'smtpUsername', { max: 320 }),
    password: requireText(password, 'smtpPassword', { max: 1000 }),
    imap: {
      host: requireText(body.imapHost || existing.imap?.host, 'imapHost', { max: 255 }),
      port: boundedInteger(body.imapPort ?? existing.imap?.port, 'imapPort', 1, 65535, 993),
      secure: body.imapSecure === undefined ? Boolean(existing.imap?.secure) : Boolean(body.imapSecure),
      username: requireText(body.imapUsername || existing.imap?.username, 'imapUsername', { max: 320 }),
      password: requireText(imapPassword, 'imapPassword', { max: 1000 })
    },
    accountKind: kind
  };
}

async function dashboardData({ db, emailQueue, redis, tenantId, from, to }) {
  const end = to && !Number.isNaN(new Date(to).getTime()) ? new Date(to) : new Date();
  const start = from && !Number.isNaN(new Date(from).getTime()) ? new Date(from) : new Date(end.getTime() - 29 * 86400000);
  const [campaigns, metrics, accounts, scheduled, series, queueCounts, heartbeat] = await Promise.all([
    db.query(`select count(*)::int total,
      count(*) filter(where status in ('scheduled','running'))::int active,
      count(*) filter(where status='paused')::int paused from campaigns where tenant_id=$1`, [tenantId]),
    db.query(`select
      count(*) filter(where sm.status in ('SENT','DELIVERED','OPENED','CLICKED','REPLIED'))::int sent,
      count(*) filter(where sm.status in ('DELIVERED','OPENED','CLICKED','REPLIED'))::int delivered,
      count(*) filter(where sm.status in ('OPENED','CLICKED','REPLIED'))::int opened,
      count(*) filter(where sm.status='CLICKED')::int clicked,
      count(*) filter(where sm.status='REPLIED')::int replies,
      count(*) filter(where sm.status='BOUNCED')::int bounced,
      count(*) filter(where sm.status='FAILED')::int failed,
      (select count(*)::int from inbound_messages i where i.tenant_id=$1 and i.intent='interested') positive_replies,
      (select count(*)::int from suppressions s where s.tenant_id=$1 and s.reason='unsubscribe') unsubscribed
      from scheduled_messages sm where sm.tenant_id=$1`, [tenantId]),
    db.query(`select count(*)::int total,count(*) filter(where status='healthy')::int healthy,
      count(*) filter(where status in ('unhealthy','disabled'))::int problem from mailboxes where tenant_id=$1`, [tenantId]),
    db.query(`select count(*)::int count from scheduled_messages where tenant_id=$1 and status in ('SCHEDULED','QUEUED') and scheduled_at::date=current_date`, [tenantId]),
    db.query(`select d::date::text date,
      count(sm.id) filter(where sm.status in ('SENT','DELIVERED','OPENED','CLICKED','REPLIED') and sm.finished_at::date=d::date)::int sent,
      count(sm.id) filter(where sm.status in ('DELIVERED','OPENED','CLICKED','REPLIED') and sm.updated_at::date=d::date)::int delivered,
      count(sm.id) filter(where sm.status='REPLIED' and sm.updated_at::date=d::date)::int replies,
      count(sm.id) filter(where sm.status='BOUNCED' and sm.updated_at::date=d::date)::int bounced,
      count(sm.id) filter(where sm.status='FAILED' and sm.updated_at::date=d::date)::int failed
      from generate_series($2::date,$3::date,interval '1 day') d
      left join scheduled_messages sm on sm.tenant_id=$1 and sm.created_at::date<=d::date
      group by d order by d`, [tenantId, start.toISOString(), end.toISOString()]),
    emailQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
    redis.client.get('worker:email-delivery:heartbeat')
  ]);
  const queueSize = Number(queueCounts.waiting || 0) + Number(queueCounts.active || 0) + Number(queueCounts.delayed || 0);
  const workerFresh = heartbeat && Date.now() - new Date(heartbeat).getTime() < 45_000;
  return {
    campaigns: campaigns.rows[0],
    ...metrics.rows[0],
    positiveReplies: metrics.rows[0].positive_replies,
    senderAccounts: accounts.rows[0],
    scheduledToday: scheduled.rows[0].count,
    queueSize,
    queue: queueCounts,
    worker: { status: workerFresh ? 'HEALTHY' : 'OFFLINE', lastHeartbeatAt: heartbeat },
    dailySeries: series.rows
  };
}

export function createWebRouter({ db, auth, config, providerResolver, emailQueue, redis }) {
  const router = Router();
  router.use(auth);

  const loadMailbox = async (id, tenantId) => {
    const { rows } = await db.query('select * from mailboxes where id=$1 and tenant_id=$2', [requireUuid(id), tenantId]);
    if (!rows[0]) throw new AppError('MAILBOX_NOT_FOUND', 'حساب الإرسال غير موجود.', 404);
    return rows[0];
  };

  router.get('/dashboard', async (req, res, next) => {
    try { res.json({ ok: true, data: await dashboardData({ db, emailQueue, redis, tenantId: req.auth.tenant_id, from: req.query.from, to: req.query.to }) }); }
    catch (error) { next(error); }
  });
  router.get('/analytics/overview', async (req, res, next) => {
    try { res.json({ ok: true, data: await dashboardData({ db, emailQueue, redis, tenantId: req.auth.tenant_id, from: req.query.from, to: req.query.to }) }); }
    catch (error) { next(error); }
  });
  router.get('/analytics/senders', async (req, res, next) => {
    try {
      const { rows } = await db.query(`select m.id,m.email,m.provider,
        count(sm.id) filter(where sm.status in ('SENT','DELIVERED','OPENED','CLICKED','REPLIED'))::int sent,
        count(sm.id) filter(where sm.status in ('DELIVERED','OPENED','CLICKED','REPLIED'))::int delivered,
        count(sm.id) filter(where sm.status='REPLIED')::int replies,
        count(sm.id) filter(where sm.status='BOUNCED')::int bounced,
        count(sm.id) filter(where sm.status='FAILED')::int failed
        from mailboxes m left join scheduled_messages sm on sm.mailbox_id=m.id
        where m.tenant_id=$1 group by m.id order by sent desc,m.email`, [req.auth.tenant_id]);
      res.json({ ok: true, data: rows.map((row) => ({ ...row, deliveryRate: row.sent ? Number(row.delivered) / Number(row.sent) : 0, replyRate: row.sent ? Number(row.replies) / Number(row.sent) : 0 })) });
    } catch (error) { next(error); }
  });

  router.get('/email-accounts', async (req, res, next) => {
    try {
      const values = [req.auth.tenant_id];
      const filters = ['m.tenant_id=$1'];
      if (req.query.search) { values.push(`%${String(req.query.search).trim()}%`); filters.push(`(m.email ilike $${values.length} or m.display_name ilike $${values.length})`); }
      const { rows } = await db.query(`select m.*,(select max(o.finished_at) from operation_logs o where o.mailbox_id=m.id and o.status='SENT') last_successful_send_at
        from mailboxes m where ${filters.join(' and ')} order by m.created_at desc`, values);
      let accounts = rows.map(mapAccount);
      if (req.query.health) accounts = accounts.filter((account) => account.health === upper(req.query.health));
      res.json({ ok: true, data: accounts });
    } catch (error) { next(error); }
  });

  router.post('/email-accounts', async (req, res, next) => {
    try {
      const email = requireEmail(req.body.email);
      const credentials = credentialsFromBody({ ...req.body, email });
      const metadata = { accountKind: credentials.accountKind, imapConfigured: Boolean(credentials.imap) };
      const envelope = encryptCredential(JSON.stringify(credentials), config.credentialKey);
      const configuredDefault = (await db.query('select sending from app_settings where tenant_id=$1', [req.auth.tenant_id])).rows[0]?.sending?.defaultDailyLimit || 40;
      const limit = boundedInteger(req.body.dailyLimit, 'dailyLimit', 1, 50000, Number(configuredDefault));
      const { rows } = await db.query(`insert into mailboxes
        (tenant_id,provider,email,display_name,credential_envelope,configured_daily_limit,effective_daily_limit,provider_metadata)
        values ($1,'smtp',$2,$3,$4,$5,$5,$6) returning *`, [
        req.auth.tenant_id, email, requireText(req.body.senderName || email, 'senderName', { max: 120 }), envelope, limit, JSON.stringify(metadata)
      ]);
      res.status(201).json({ ok: true, data: mapAccount(rows[0]) });
    } catch (error) { next(error); }
  });

  router.put('/email-accounts/:id', async (req, res, next) => {
    try {
      const mailbox = await loadMailbox(req.params.id, req.auth.tenant_id);
      if (['gmail','microsoft_graph'].includes(mailbox.provider)) {
        const { rows } = await db.query(`update mailboxes set display_name=$3,configured_daily_limit=$4,
          effective_daily_limit=least(effective_daily_limit,$4),updated_at=now() where id=$1 and tenant_id=$2 returning *`,
        [mailbox.id, req.auth.tenant_id, requireText(req.body.senderName || mailbox.display_name || mailbox.email, 'senderName', { max: 120 }), boundedInteger(req.body.dailyLimit, 'dailyLimit', 1, 50000, mailbox.configured_daily_limit)]);
        return res.json({ ok: true, data: mapAccount(rows[0]) });
      }
      const existing = JSON.parse(decryptCredential(mailbox.credential_envelope, config.credentialKey));
      const credentials = credentialsFromBody({ ...req.body, provider: accountKind(mailbox), email: req.body.email || mailbox.email }, existing);
      const metadata = { ...mailbox.provider_metadata, accountKind: credentials.accountKind, imapConfigured: Boolean(credentials.imap) };
      const { rows } = await db.query(`update mailboxes set email=$3,display_name=$4,credential_envelope=$5,
        configured_daily_limit=$6,effective_daily_limit=least(effective_daily_limit,$6),provider_metadata=$7,status='pending',last_error=null,updated_at=now()
        where id=$1 and tenant_id=$2 returning *`, [mailbox.id, req.auth.tenant_id, requireEmail(req.body.email || mailbox.email), requireText(req.body.senderName || mailbox.display_name || mailbox.email, 'senderName', { max: 120 }), encryptCredential(JSON.stringify(credentials), config.credentialKey), boundedInteger(req.body.dailyLimit, 'dailyLimit', 1, 50000, mailbox.configured_daily_limit), JSON.stringify(metadata)]);
      res.json({ ok: true, data: mapAccount(rows[0]) });
    } catch (error) { next(error); }
  });

  router.post('/email-accounts/:id/test-connection', async (req, res, next) => {
    try {
      const mailbox = await loadMailbox(req.params.id, req.auth.tenant_id);
      const smtp = await (await providerResolver(mailbox)).verify();
      const credentials = JSON.parse(decryptCredential(mailbox.credential_envelope, config.credentialKey));
      const imap = await imapLogin(credentials);
      const metadata = { ...mailbox.provider_metadata, imapVerifiedAt: imap.authenticated ? new Date().toISOString() : null };
      await db.query("update mailboxes set status='healthy',verified_at=now(),last_error=null,provider_metadata=$2,updated_at=now() where id=$1", [mailbox.id, JSON.stringify(metadata)]);
      res.json({ ok: true, data: { verified: true, authenticated: true, smtpStatus: 'CONNECTED', imapStatus: imap.configured ? 'CONNECTED' : 'NOT_CONFIGURED', smtp, imap } });
    } catch (error) {
      await db.query("update mailboxes set status='unhealthy',last_error=$2,updated_at=now() where id=$1 and tenant_id=$3", [req.params.id, error.message, req.auth.tenant_id]).catch(() => {});
      next(error);
    }
  });

  router.post('/email-accounts/:id/send-test', async (req, res, next) => {
    const started = new Date();
    let mailbox;
    try {
      mailbox = await loadMailbox(req.params.id, req.auth.tenant_id);
      if (mailbox.status !== 'healthy') throw new AppError('MAILBOX_NOT_VERIFIED', 'اختبر الاتصال الحقيقي أولًا.', 409);
      const to = requireEmail(req.body.to);
      const result = await (await providerResolver(mailbox)).send({
        from: `${mailbox.display_name || mailbox.email} <${mailbox.email}>`, to,
        subject: 'Jareed — اختبار إرسال حقيقي',
        text: 'هذه الرسالة تؤكد قبول مزود البريد لعملية الإرسال الحقيقية.',
        html: '<p>هذه الرسالة تؤكد قبول مزود البريد لعملية الإرسال الحقيقية.</p>'
      });
      if (result.status !== 'accepted') throw new AppError(result.error?.code || 'PROVIDER_REJECTED', result.error?.message || 'رفض المزود الرسالة.', result.error?.retryable ? 503 : 422, result);
      await db.query(`insert into operation_logs (tenant_id,operation,mailbox_id,provider,started_at,finished_at,provider_message_id,provider_response,status)
        values ($1,'TEST_SEND',$2,$3,$4,now(),$5,$6,'SENT')`, [req.auth.tenant_id, mailbox.id, mailbox.provider, started, result.providerMessageId, JSON.stringify(result.response || {})]);
      res.json({ ok: true, data: { messageId: result.providerMessageId, providerMessageId: result.providerMessageId, accepted: [to], response: result.response } });
    } catch (error) {
      if (mailbox) await db.query(`insert into operation_logs (tenant_id,operation,mailbox_id,provider,started_at,finished_at,status,error_code,error_detail)
        values ($1,'TEST_SEND',$2,$3,$4,now(),'FAILED',$5,$6)`, [req.auth.tenant_id, mailbox.id, mailbox.provider, started, error.code || 'TEST_SEND_FAILED', error.message]).catch(() => {});
      next(error);
    }
  });

  router.post('/email-accounts/:id/pause', async (req, res, next) => {
    try { const { rows } = await db.query("update mailboxes set status='disabled',updated_at=now() where id=$1 and tenant_id=$2 returning *", [requireUuid(req.params.id), req.auth.tenant_id]); if (!rows[0]) throw new AppError('MAILBOX_NOT_FOUND', 'حساب الإرسال غير موجود.', 404); res.json({ ok: true, data: mapAccount(rows[0]) }); }
    catch (error) { next(error); }
  });
  router.post('/email-accounts/:id/resume', async (req, res, next) => {
    try { const { rows } = await db.query("update mailboxes set status=case when verified_at is null then 'pending'::mailbox_status else 'healthy'::mailbox_status end,updated_at=now() where id=$1 and tenant_id=$2 returning *", [requireUuid(req.params.id), req.auth.tenant_id]); if (!rows[0]) throw new AppError('MAILBOX_NOT_FOUND', 'حساب الإرسال غير موجود.', 404); res.json({ ok: true, data: mapAccount(rows[0]) }); }
    catch (error) { next(error); }
  });
  router.delete('/email-accounts/:id', async (req, res, next) => {
    try { const result = await db.query('delete from mailboxes where id=$1 and tenant_id=$2', [requireUuid(req.params.id), req.auth.tenant_id]); if (!result.rowCount) throw new AppError('MAILBOX_NOT_FOUND', 'حساب الإرسال غير موجود.', 404); res.json({ ok: true }); }
    catch (error) { next(error.code === '23503' ? new AppError('MAILBOX_IN_USE', 'لا يمكن حذف حساب مرتبط بحملة أو سجل إرسال. أوقفه بدلًا من ذلك.', 409) : error); }
  });

  router.get('/leads', async (req, res, next) => {
    try {
      const values = [req.auth.tenant_id]; const filters = ['c.tenant_id=$1'];
      if (req.query.search) { values.push(`%${String(req.query.search).trim()}%`); filters.push(`(c.email ilike $${values.length} or c.first_name ilike $${values.length} or c.last_name ilike $${values.length} or c.university ilike $${values.length} or c.attributes->>'company' ilike $${values.length})`); }
      const { rows } = await db.query(`select c.*,(select max(r.updated_at) from campaign_recipients r where r.contact_id=c.id) last_contacted_at,
        exists(select 1 from suppressions s where s.tenant_id=c.tenant_id and s.email_hash=encode(digest(lower(trim(c.email)),'sha256'),'hex')) suppressed
        from contacts c where ${filters.join(' and ')} order by c.created_at desc limit 500`, values);
      res.json({ ok: true, data: rows.map((lead) => ({ id: lead.id, email: lead.email, firstName: lead.first_name, lastName: lead.last_name, university: lead.university, major: lead.specialization, company: lead.attributes?.company || null, tags: lead.attributes?.tags || [], customFields: lead.attributes || {}, status: lead.suppressed ? 'BLOCKED' : lead.consent_revoked_at ? 'UNSUBSCRIBED' : 'ACTIVE', lastContactedAt: lead.last_contacted_at })) });
    } catch (error) { next(error); }
  });

  router.get('/inbox/threads', async (req, res, next) => {
    try {
      const values = [req.auth.tenant_id]; const filters = ['i.tenant_id=$1'];
      if (req.query.search) { values.push(`%${String(req.query.search).trim()}%`); filters.push(`(i.from_email ilike $${values.length} or i.subject ilike $${values.length} or i.text_body ilike $${values.length})`); }
      const { rows } = await db.query(`select distinct on (r.id) r.id thread_id,i.id,i.subject,i.text_body,i.intent,i.handled_at,i.is_read,i.received_at,
        c.id campaign_id,c.name campaign_name,ct.id contact_id,ct.email contact_email,ct.first_name,ct.last_name,m.id mailbox_id,m.email mailbox_email,m.display_name,
        count(*) over(partition by r.id)::int message_count
        from inbound_messages i join campaign_recipients r on r.id=i.campaign_recipient_id join campaigns c on c.id=r.campaign_id
        join contacts ct on ct.id=r.contact_id left join mailboxes m on m.id=i.mailbox_id
        where ${filters.join(' and ')} order by r.id,i.received_at desc limit 200`, values);
      res.json({ ok: true, data: rows.map((item) => ({ id: item.thread_id, subject: item.subject || '(بدون عنوان)', senderAccount: { id: item.mailbox_id, email: item.mailbox_email, senderName: item.display_name || item.mailbox_email }, lead: { id: item.contact_id, email: item.contact_email, firstName: item.first_name, lastName: item.last_name }, campaign: { id: item.campaign_id, name: item.campaign_name }, category: upper(item.intent === 'unknown' ? 'OTHER' : item.intent), isRead: Boolean(item.is_read), messageCount: item.message_count, snippet: item.text_body, lastMessageAt: item.received_at })) });
    } catch (error) { next(error); }
  });

  router.get('/inbox/threads/:id', async (req, res, next) => {
    try {
      const threadId = requireUuid(req.params.id);
      const thread = (await db.query(`select r.id,c.id campaign_id,c.name campaign_name,ct.id contact_id,ct.email contact_email,ct.first_name,ct.last_name,
        coalesce(i.mailbox_id,sm.mailbox_id) mailbox_id,m.email mailbox_email,m.display_name,
        coalesce(i.subject,o.subject,'(بدون عنوان)') subject,coalesce(i.intent,'unknown') intent,
        coalesce(i.received_at,o.sent_at,r.created_at) last_message_at,coalesce(i.is_read,true) is_read
        from campaign_recipients r join campaigns c on c.id=r.campaign_id join contacts ct on ct.id=r.contact_id
        left join lateral (select * from inbound_messages where campaign_recipient_id=r.id order by received_at desc limit 1) i on true
        left join lateral (select * from scheduled_messages where campaign_recipient_id=r.id and mailbox_id is not null order by created_at desc limit 1) sm on true
        left join lateral (select * from outbound_messages where campaign_recipient_id=r.id order by sent_at desc limit 1) o on true
        left join mailboxes m on m.id=coalesce(i.mailbox_id,sm.mailbox_id,o.mailbox_id)
        where r.id=$1 and c.tenant_id=$2`, [threadId, req.auth.tenant_id])).rows[0];
      if (!thread) throw new AppError('THREAD_NOT_FOUND', 'المحادثة غير موجودة.', 404);
      const [inbound, outbound] = await Promise.all([
        db.query(`select id,'INBOUND' direction,from_email "from",received_at "sentAt",subject,text_body "bodyText",html_body "bodyHtml" from inbound_messages where campaign_recipient_id=$1 order by received_at`, [threadId]),
        db.query(`select id,'OUTBOUND' direction,from_email "from",to_email,status,sent_at "sentAt",subject,text_body "bodyText",html_body "bodyHtml" from outbound_messages where campaign_recipient_id=$1 order by sent_at`, [threadId])
      ]);
      await db.query('update inbound_messages set is_read=true where campaign_recipient_id=$1 and tenant_id=$2', [threadId, req.auth.tenant_id]);
      const messages = [...inbound.rows.map((message) => ({ ...message, to: [thread.mailbox_email] })), ...outbound.rows.map((message) => ({ ...message, to: [message.to_email] }))].sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());
      res.json({ ok: true, data: { id: thread.id, subject: thread.subject, senderAccount: { id: thread.mailbox_id, email: thread.mailbox_email, senderName: thread.display_name || thread.mailbox_email }, lead: { id: thread.contact_id, email: thread.contact_email, firstName: thread.first_name, lastName: thread.last_name }, campaign: { id: thread.campaign_id, name: thread.campaign_name }, category: upper(thread.intent === 'unknown' ? 'OTHER' : thread.intent), isRead: true, lastMessageAt: thread.last_message_at, messages } });
    } catch (error) { next(error); }
  });

  router.patch('/inbox/threads/:id', async (req, res, next) => {
    try {
      const threadId = requireUuid(req.params.id);
      const intent = String(req.body.category || '').toLowerCase();
      const allowed = new Set(['interested','not_interested','question','out_of_office','unsubscribe','other','unknown']);
      if (intent && !allowed.has(intent)) throw new AppError('VALIDATION_ERROR', 'تصنيف المحادثة غير مدعوم.', 400);
      const { rows } = await db.query(`update inbound_messages set intent=case when $3='' then intent when $3='other' then 'unknown' else $3 end,
        intent_source=case when $3='' then intent_source else 'manual' end,is_read=coalesce($4,is_read),archived_at=case when $5 then now() when $5=false then null else archived_at end
        where campaign_recipient_id=$1 and tenant_id=$2 returning id`, [threadId, req.auth.tenant_id, intent, req.body.isRead ?? null, req.body.isArchived ?? null]);
      if (!rows.length) throw new AppError('THREAD_NOT_FOUND', 'المحادثة غير موجودة.', 404);
      res.json({ ok: true, data: { updated: rows.length } });
    } catch (error) { next(error); }
  });

  router.post('/inbox/threads/:id/reply', async (req, res, next) => {
    const started = new Date();
    let context;
    try {
      const threadId = requireUuid(req.params.id);
      context = (await db.query(`select r.id recipient_id,r.email recipient_email,c.tenant_id,c.id campaign_id,c.name campaign_name,
        i.provider_message_id inbound_message_id,i.subject inbound_subject,coalesce(i.mailbox_id,sm.mailbox_id) mailbox_id,m.*
        from campaign_recipients r join campaigns c on c.id=r.campaign_id
        left join lateral (select * from inbound_messages where campaign_recipient_id=r.id order by received_at desc limit 1) i on true
        left join lateral (select * from scheduled_messages where campaign_recipient_id=r.id and mailbox_id is not null order by created_at desc limit 1) sm on true
        left join mailboxes m on m.id=coalesce(i.mailbox_id,sm.mailbox_id)
        where r.id=$1 and c.tenant_id=$2`, [threadId, req.auth.tenant_id])).rows[0];
      if (!context?.mailbox_id) throw new AppError('THREAD_SENDER_UNAVAILABLE', 'حساب الإرسال الأصلي غير متاح.', 409);
      if (context.status !== 'healthy') throw new AppError('MAILBOX_NOT_HEALTHY', 'حساب الإرسال الأصلي غير سليم.', 409);
      const text = requireText(req.body.bodyText, 'bodyText', { max: 200000 });
      const subject = requireText(req.body.subject || (String(context.inbound_subject || '').match(/^re:/i) ? context.inbound_subject : `Re: ${context.inbound_subject || ''}`), 'subject', { max: 500 });
      const headers = context.inbound_message_id ? { 'In-Reply-To': `<${context.inbound_message_id}>`, References: `<${context.inbound_message_id}>` } : {};
      const result = await (await providerResolver(context)).send({ from: `${context.display_name || context.email} <${context.email}>`, to: context.recipient_email, subject, text, html: String(req.body.bodyHtml || text.replace(/\n/g, '<br>')), headers });
      if (result.status !== 'accepted') throw new AppError(result.error?.code || 'PROVIDER_REJECTED', result.error?.message || 'رفض المزود الرد.', result.error?.retryable ? 503 : 422, result);
      const message = (await db.query(`insert into outbound_messages
        (tenant_id,campaign_recipient_id,mailbox_id,provider_message_id,in_reply_to,from_email,to_email,subject,text_body,html_body,status)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SENT') returning id,provider_message_id "messageId",from_email "from",to_email,subject,text_body "bodyText",html_body "bodyHtml",status,sent_at "sentAt"`, [req.auth.tenant_id, context.recipient_id, context.mailbox_id, result.providerMessageId, context.inbound_message_id || null, context.email, context.recipient_email, subject, text, String(req.body.bodyHtml || text.replace(/\n/g, '<br>'))])).rows[0];
      await db.query('update inbound_messages set is_read=true,handled_at=coalesce(handled_at,now()),handled_by=$2 where campaign_recipient_id=$1', [context.recipient_id, req.auth.user_id]);
      await db.query(`insert into operation_logs (tenant_id,operation,campaign_id,campaign_recipient_id,mailbox_id,provider,started_at,finished_at,provider_message_id,provider_response,status)
        values ($1,'INBOX_REPLY',$2,$3,$4,$5,$6,now(),$7,$8,'SENT')`, [req.auth.tenant_id, context.campaign_id, context.recipient_id, context.mailbox_id, context.provider, started, result.providerMessageId, JSON.stringify(result.response || {})]);
      res.json({ ok: true, data: { ...message, to: [message.to_email], direction: 'OUTBOUND' } });
    } catch (error) {
      if (context?.mailbox_id) await db.query(`insert into operation_logs (tenant_id,operation,campaign_id,campaign_recipient_id,mailbox_id,provider,started_at,finished_at,status,error_code,error_detail)
        values ($1,'INBOX_REPLY',$2,$3,$4,$5,$6,now(),'FAILED',$7,$8)`, [req.auth.tenant_id, context.campaign_id, context.recipient_id, context.mailbox_id, context.provider, started, error.code || 'REPLY_FAILED', error.message]).catch(() => {});
      next(error);
    }
  });

  router.get('/logs', async (req, res, next) => {
    try {
      const { rows } = await db.query(`select o.*,c.name campaign_name,ct.email lead_email,m.email sender_email
        from operation_logs o left join campaigns c on c.id=o.campaign_id left join campaign_recipients r on r.id=o.campaign_recipient_id
        left join contacts ct on ct.id=r.contact_id left join mailboxes m on m.id=o.mailbox_id
        where o.tenant_id=$1 order by o.started_at desc limit 500`, [req.auth.tenant_id]);
      res.json({ ok: true, data: rows.map((log) => ({ id: log.id, campaign: log.campaign_id ? { id: log.campaign_id, name: log.campaign_name } : null, lead: log.campaign_recipient_id ? { id: log.campaign_recipient_id, email: log.lead_email } : null, sender: log.mailbox_id ? { id: log.mailbox_id, email: log.sender_email } : null, provider: log.provider, startedAt: log.started_at, finishedAt: log.finished_at, providerResponse: log.provider_response, messageId: log.provider_message_id, status: log.status, errorCode: log.error_code, errorDetails: log.error_detail, retryCount: log.retry_count })) });
    } catch (error) { next(error); }
  });

  router.get('/system/status', async (req, res, next) => {
    try {
      const dbStarted = Date.now(); await db.query('select 1'); const dbLatency = Date.now() - dbStarted;
      const queueCounts = await emailQueue.getJobCounts('waiting', 'active', 'delayed', 'failed');
      const heartbeat = await redis.client.get('worker:email-delivery:heartbeat');
      const workerFresh = heartbeat && Date.now() - new Date(heartbeat).getTime() < 45_000;
      res.json({ ok: true, data: { database: { status: 'HEALTHY', latencyMs: dbLatency }, queue: { status: 'HEALTHY', size: Number(queueCounts.waiting || 0) + Number(queueCounts.active || 0) + Number(queueCounts.delayed || 0) }, worker: { status: workerFresh ? 'HEALTHY' : 'OFFLINE', lastHeartbeatAt: heartbeat }, lastBackgroundJob: null, version: '0.3.0' } });
    } catch (error) { next(error); }
  });

  router.get('/settings', async (req, res, next) => {
    try {
      const { rows } = await db.query(`insert into app_settings (tenant_id) values ($1) on conflict (tenant_id) do update set tenant_id=excluded.tenant_id
        returning sending,tracking,leads,updated_at`, [req.auth.tenant_id]);
      res.json({ ok: true, data: { ...rows[0], secrets: { credentialEncryption: true, googleOAuth: Boolean(config.google.clientId && config.google.clientSecret), microsoftOAuth: Boolean(config.microsoft.clientId && config.microsoft.clientSecret), webhookSigning: Boolean(config.webhookSigningSecret) } } });
    } catch (error) { next(error); }
  });

  router.put('/settings', async (req, res, next) => {
    try {
      const sending = {
        defaultDailyLimit: boundedInteger(req.body.sending?.defaultDailyLimit, 'defaultDailyLimit', 1, 50000, 40),
        delayBetweenMessagesSeconds: boundedInteger(req.body.sending?.delayBetweenMessagesSeconds, 'delayBetweenMessagesSeconds', 0, 86400, 30),
        retryMaxAttempts: boundedInteger(req.body.sending?.retryMaxAttempts, 'retryMaxAttempts', 1, 10, 4),
        retryBaseDelaySeconds: boundedInteger(req.body.sending?.retryBaseDelaySeconds, 'retryBaseDelaySeconds', 1, 86400, 30)
      };
      const tracking = { openTracking: req.body.tracking?.openTracking !== false, clickTracking: Boolean(req.body.tracking?.clickTracking) };
      const dedupeMode = String(req.body.leads?.dedupeMode || 'GLOBAL').toUpperCase();
      if (dedupeMode !== 'GLOBAL') throw new AppError('VALIDATION_ERROR', 'النسخة الحالية تمنع تكرار البريد في النظام كله.', 400);
      const leads = { dedupeMode };
      const { rows } = await db.query(`insert into app_settings (tenant_id,sending,tracking,leads) values ($1,$2,$3,$4)
        on conflict (tenant_id) do update set sending=excluded.sending,tracking=excluded.tracking,leads=excluded.leads,updated_at=now()
        returning sending,tracking,leads,updated_at`, [req.auth.tenant_id, JSON.stringify(sending), JSON.stringify(tracking), JSON.stringify(leads)]);
      res.json({ ok: true, data: rows[0] });
    } catch (error) { next(error); }
  });

  return router;
}

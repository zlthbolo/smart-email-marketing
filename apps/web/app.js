const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
document.documentElement.classList.toggle('native', isNative);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const nativeMail = () => window.Capacitor?.Plugins?.LocalMail;
const keys = {
  mailboxes: 'jareed_local_mailboxes',
  contacts: 'jareed_local_contacts',
  campaigns: 'jareed_local_campaigns',
  universities: 'jareed_local_universities',
  outbox: 'jareed_local_outbox',
  settings: 'jareed_local_settings'
};
const state = { mailboxes: [], contacts: [], campaigns: [], universities: [], research: [], inbox: [], outbox: [] };
const defaultSettings = { defaultSenderName: '', testRecipient: '', defaultDailyLimit: 25, defaultJitterSeconds: 120 };

const statusLabels = { pending: 'بانتظار التحقق', healthy: 'سليم', unhealthy: 'غير سليم', draft: 'مسودة', paused: 'متوقفة', accepted: 'قبلها المزود', blocked: 'ممنوعة' };
const providerLabels = { smtp: 'SMTP مباشر', api: 'مزود API', test_sink: 'اختبار محلي' };
const consentLabels = { explicit_opt_in: 'موافقة صريحة', legitimate_interest: 'مصلحة مشروعة', contractual: 'علاقة تعاقدية', legal_obligation: 'التزام قانوني' };
const statusLabel = (value) => statusLabels[value] || value || 'غير معروف';
const providerLabel = (value) => providerLabels[value] || value || 'غير معروف';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function notice(message, type = 'success') {
  $('#notice').innerHTML = `<div class="notice ${type}">${escapeHtml(message)}</div>`;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { $('#notice').innerHTML = ''; }, 7000);
}

function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
function id() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function read(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); return value; }
function readSettings() {
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(keys.settings) || '{}') }; }
  catch { return { ...defaultSettings }; }
}

function publicMailbox(mailbox) {
  return {
    id: mailbox.id,
    provider: mailbox.provider,
    display_name: mailbox.display_name || mailbox.displayName || '',
    email: mailbox.email,
    host: mailbox.host || '',
    port: Number(mailbox.port || 0),
    username: mailbox.username || '',
    api_kind: mailbox.api_kind || mailbox.apiKind || '',
    status: mailbox.status || 'pending',
    sent_today: Number(mailbox.sent_today || 0),
    effective_daily_limit: Number(mailbox.effective_daily_limit || mailbox.dailyLimit || 25),
    last_error: mailbox.last_error || null,
    created_at: mailbox.created_at || new Date().toISOString()
  };
}

async function listLocalMailboxes() {
  const plugin = nativeMail();
  if (plugin) return (await plugin.listMailboxes()).mailboxes || [];
  return read(keys.mailboxes).map(publicMailbox);
}

async function saveLocalMailbox(body) {
  const plugin = nativeMail();
  if (plugin) return (await plugin.saveMailbox({
    provider: body.provider,
    displayName: body.displayName || '',
    email: body.email,
    host: body.host || '',
    port: Number(body.port || 587),
    username: body.username || '',
    password: body.password || '',
    secure: Boolean(body.secure),
    apiKind: body.apiKind || '',
    apiKey: body.apiKey || '',
    dailyLimit: Number(body.dailyLimit || 25)
  })).mailbox;

  const mailboxes = read(keys.mailboxes);
  const mailbox = publicMailbox({ ...body, id: id(), status: 'pending', last_error: 'التحقق المباشر متاح في تطبيق أندرويد فقط', created_at: new Date().toISOString() });
  const duplicate = mailboxes.findIndex((item) => item.email.toLowerCase() === mailbox.email.toLowerCase() && item.provider === mailbox.provider);
  if (duplicate >= 0) mailbox.id = mailboxes[duplicate].id;
  if (duplicate >= 0) mailboxes.splice(duplicate, 1, mailbox); else mailboxes.push(mailbox);
  write(keys.mailboxes, mailboxes);
  return mailbox;
}

async function deleteLocalMailbox(mailboxId) {
  const plugin = nativeMail();
  if (plugin) return plugin.deleteMailbox({ id: mailboxId });
  write(keys.mailboxes, read(keys.mailboxes).filter((mailbox) => mailbox.id !== mailboxId));
  return { deleted: true };
}

async function verifyLocalMailbox(mailboxId) {
  const plugin = nativeMail();
  if (!plugin) throw new Error('التحقق الحقيقي متاح من ملف APK على هاتف أندرويد.');
  return plugin.verifyMailbox({ id: mailboxId });
}

async function testLocalMailbox(mailboxId, to) {
  const plugin = nativeMail();
  if (plugin) return plugin.sendTest({ id: mailboxId, to });
  const mailbox = read(keys.mailboxes).find((item) => item.id === mailboxId);
  if (!mailbox || mailbox.provider !== 'test_sink') throw new Error('الإرسال المباشر متاح من ملف APK على هاتف أندرويد.');
  const message = { id: id(), subject: 'اختبار جريد سوفت', recipient: to, created_at: new Date().toISOString(), html_body: '<p>رسالة اختبار محلية فقط.</p>' };
  write(keys.outbox, [message, ...read(keys.outbox)]);
  return { provider: 'test_sink', providerMessageId: message.id, accepted: false };
}

async function listLocalOutbox() {
  const plugin = nativeMail();
  if (plugin) return (await plugin.listOutbox()).messages || [];
  return read(keys.outbox);
}

function audienceMatches(contact, segment = {}) {
  return (!segment.university || contact.university === segment.university) && (!segment.specialization || contact.specialization === segment.specialization);
}

function overview() {
  const contacts = read(keys.contacts);
  const campaigns = read(keys.campaigns);
  const mailboxes = state.mailboxes;
  const universitiesList = read(keys.universities);
  const actions = [];
  if (!mailboxes.length) actions.push({ page: 'mailboxes', title: 'إضافة مرسل' });
  else if (!mailboxes.some((mailbox) => mailbox.status === 'healthy')) actions.push({ page: 'mailboxes', title: 'اختبار المرسل' });
  if (!contacts.length) actions.push({ page: 'contacts', title: 'إضافة الجمهور' });
  if (!campaigns.length) actions.push({ page: 'campaigns', title: 'إنشاء حملة' });
  const universities = Object.values(contacts.reduce((all, contact) => {
    const name = contact.university || 'بدون جامعة';
    all[name] ||= { university: name, contacts: 0, specializations: new Set(), accepted: 0, replies: 0 };
    all[name].contacts += 1;
    if (contact.specialization) all[name].specializations.add(contact.specialization);
    return all;
  }, {})).map((item) => ({ ...item, specializations: item.specializations.size }));
  return {
    summary: {
      mailboxes: mailboxes.length,
      healthyMailboxes: mailboxes.filter((mailbox) => mailbox.status === 'healthy').length,
      sentToday: mailboxes.reduce((total, mailbox) => total + Number(mailbox.sent_today || 0), 0),
      dailyCapacity: mailboxes.reduce((total, mailbox) => total + Number(mailbox.effective_daily_limit || 0), 0),
      contacts: contacts.length,
      campaigns: campaigns.length,
      universities: universitiesList.length,
      outbox: state.outbox.length,
      replies: state.inbox.length
    },
    actions,
    universities
  };
}

async function localApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const pathname = path.split('?')[0];
  const body = options.body || {};

  if (pathname === '/health') return { mode: 'local', dependencies: { storage: { status: 'healthy' } } };
  if (pathname === '/mailboxes' && method === 'GET') return listLocalMailboxes();
  if (pathname === '/mailboxes' && method === 'POST') return saveLocalMailbox(body);
  if (pathname === '/mailboxes/test-outbox/messages') return listLocalOutbox();
  if (/^\/mailboxes\/[^/]+\/verify$/.test(pathname)) return verifyLocalMailbox(pathname.split('/')[2]);
  if (/^\/mailboxes\/[^/]+\/test$/.test(pathname)) return testLocalMailbox(pathname.split('/')[2], body.to);
  if (/^\/mailboxes\/[^/]+$/.test(pathname) && method === 'DELETE') return deleteLocalMailbox(pathname.split('/')[2]);

  if (pathname === '/contacts' && method === 'GET') return read(keys.contacts);
  if (pathname === '/contacts/import' && method === 'POST') {
    const contacts = read(keys.contacts);
    let imported = 0;
    for (const raw of body.contacts || []) {
      const email = String(raw.email || '').trim().toLowerCase();
      if (!email.includes('@') || !raw.consentBasis || !raw.consentSource) throw new Error('كل جهة تحتاج بريدًا صحيحًا وأساس موافقة ومصدرها.');
      const contact = { id: id(), email, first_name: raw.firstName || '', university: raw.university || '', specialization: raw.specialization || '', consent_basis: raw.consentBasis, consent_source: raw.consentSource, created_at: new Date().toISOString() };
      const index = contacts.findIndex((item) => item.email === email);
      if (index >= 0) contact.id = contacts[index].id;
      if (index >= 0) contacts.splice(index, 1, contact); else contacts.push(contact);
      imported += 1;
    }
    write(keys.contacts, contacts);
    return { imported };
  }
  if (/^\/contacts\/[^/]+$/.test(pathname) && method === 'DELETE') {
    write(keys.contacts, read(keys.contacts).filter((contact) => contact.id !== pathname.split('/')[2]));
    return { deleted: true };
  }

  if (pathname === '/campaigns' && method === 'GET') return read(keys.campaigns);
  if (pathname === '/campaigns' && method === 'POST') {
    const contacts = read(keys.contacts).filter((contact) => audienceMatches(contact, body.segment));
    const mailbox = state.mailboxes.find((item) => item.id === body.mailboxId);
    const campaign = { ...body, id: id(), status: 'draft', recipients: contacts.length, mailbox_email: mailbox?.email || '', scheduled_at: null, created_at: new Date().toISOString() };
    write(keys.campaigns, [campaign, ...read(keys.campaigns)]);
    return campaign;
  }
  if (/^\/campaigns\/[^/]+\/preflight$/.test(pathname)) {
    const campaign = read(keys.campaigns).find((item) => item.id === pathname.split('/')[2]);
    if (!campaign) throw new Error('المسودة غير موجودة.');
    const mailbox = state.mailboxes.find((item) => item.id === campaign.mailboxId);
    const checks = [
      { label: 'حساب مرسل متحقق', passed: mailbox?.status === 'healthy', detail: mailbox?.status === 'healthy' ? 'نجح تحقق المزود' : 'تحقق من الحساب أولًا' },
      { label: 'جمهور مسموح', passed: campaign.recipients > 0, detail: `${campaign.recipients || 0} مستلم مطابق` },
      { label: 'عنوان بريدي قانوني', passed: Boolean(campaign.physicalAddress), detail: campaign.physicalAddress || 'غير موجود' },
      { label: 'الإرسال المجدول', passed: false, detail: 'غير متاح بأمان بعد إغلاق تطبيق الهاتف' }
    ];
    const blockers = checks.filter((check) => !check.passed).map((check) => ({ message: check.detail }));
    return { ready: false, score: Math.round((checks.filter((check) => check.passed).length / checks.length) * 100), checks, blockers, warnings: [{ message: 'احفظ المسودة محليًا واستخدم اختبار الإرسال فقط في هذه النسخة.' }] };
  }
  if (/^\/campaigns\/[^/]+\/schedule$/.test(pathname)) throw new Error('لم تُطلق الحملة: الجدولة الموثوقة بعد إغلاق الهاتف تحتاج عامل تشغيل دائم، وهذه النسخة محلية فقط.');
  if (/^\/campaigns\/[^/]+\/pause$/.test(pathname)) {
    const campaigns = read(keys.campaigns); const campaign = campaigns.find((item) => item.id === pathname.split('/')[2]);
    if (campaign) campaign.status = 'paused'; write(keys.campaigns, campaigns); return campaign;
  }
  if (/^\/campaigns\/[^/]+\/analytics$/.test(pathname)) {
    const campaign = read(keys.campaigns).find((item) => item.id === pathname.split('/')[2]);
    return { campaign, metrics: { total: campaign?.recipients || 0, accepted: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0, blocked: 0 } };
  }

  if (pathname === '/knowledge/universities' && method === 'GET') return read(keys.universities);
  if (pathname === '/knowledge/universities' && method === 'POST') {
    const university = { id: id(), name: body.name, official_url: body.officialUrl, country_code: body.countryCode || '', created_at: new Date().toISOString() };
    write(keys.universities, [university, ...read(keys.universities)]); return university;
  }
  if (pathname === '/knowledge/research' && method === 'GET') return [];
  if (pathname === '/knowledge/research' && method === 'POST') throw new Error('البحث العميق يحتاج مزود ذكاء اصطناعي واتصالًا خارجيًا؛ لم تظهر حالة نجاح وهمية.');
  if (pathname === '/knowledge/agent/draft-campaign') throw new Error('إنشاء الرسالة بالذكاء الاصطناعي غير مفعّل في النسخة المحلية بعد. اكتب المسودة يدويًا.');
  if (pathname === '/insights/overview') return overview();
  if (pathname === '/inbox') return [];
  throw new Error('هذه العملية غير متاحة في وضع الهاتف المحلي.');
}

async function api(path, options = {}) { return localApi(path, options); }

function item(title, meta, actions = '') {
  return `<article class="list-item"><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(meta)}</p></div>${actions ? `<div class="actions">${actions}</div>` : ''}</article>`;
}

function showPage(name) {
  const labels = { overview: 'الرئيسية', mailboxes: 'المرسلون', contacts: 'الجمهور', campaigns: 'الحملات', inbox: 'الردود', research: 'الجامعات', outbox: 'الاختبار', settings: 'الإعدادات' };
  $$('[data-view]').forEach((view) => view.classList.toggle('hidden', view.dataset.view !== name));
  $$('[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === name));
  $('#pageTitle').textContent = labels[name];
  if (name === 'outbox') loadOutbox();
  if (name === 'inbox') loadInbox();
  if (name === 'settings') loadSettings();
}

async function loadHealth() {
  $('#systemDot').classList.add('healthy');
}

async function loadMailboxes() {
  state.mailboxes = await api('/mailboxes');
  $('#mailboxList').innerHTML = state.mailboxes.length ? state.mailboxes.map((mailbox) => item(
    `${mailbox.display_name || mailbox.email} — ${mailbox.email}`,
    `${providerLabel(mailbox.provider)} · ${statusLabel(mailbox.status)} · ${mailbox.sent_today}/${mailbox.effective_daily_limit} اليوم${mailbox.last_error ? ` · ${mailbox.last_error}` : ''}`,
    `${mailbox.provider === 'api' ? '' : `<button data-verify="${mailbox.id}">تحقق الآن</button>`}<button data-test="${mailbox.id}">${mailbox.provider === 'api' ? 'تحقق بإرسال' : 'اختبار إرسال'}</button><button class="danger" data-delete-mailbox="${mailbox.id}">حذف</button>`
  )).join('') : '<p class="empty">لا يوجد مرسلون.</p>';
  const healthy = state.mailboxes.filter((mailbox) => mailbox.status === 'healthy');
  $('#campaignMailbox').innerHTML = healthy.length ? healthy.map((mailbox) => `<option value="${mailbox.id}">${escapeHtml(mailbox.email)} — ${escapeHtml(providerLabel(mailbox.provider))}</option>`).join('') : '<option value="">اختر مرسلًا متحققًا</option>';
}

async function loadContacts() {
  state.contacts = await api('/contacts?limit=100');
  $('#contactList').innerHTML = state.contacts.length ? state.contacts.map((contact) => item(contact.email, `${contact.first_name || ''} · ${contact.university || 'بدون جامعة'} · ${consentLabels[contact.consent_basis] || 'أساس موافقة مسجل'}`, `<button class="danger" data-delete-contact="${contact.id}">حذف</button>`)).join('') : '<p class="empty">لا توجد جهات اتصال.</p>';
}

async function loadCampaigns() {
  state.campaigns = await api('/campaigns');
  $('#campaignList').innerHTML = state.campaigns.length ? state.campaigns.map((campaign) => item(
    campaign.name,
    `${statusLabel(campaign.status)} · ${campaign.recipients} مستلم · ${campaign.mailbox_email || 'بلا مرسل'}`,
    `<button data-preflight="${campaign.id}">فحص الجاهزية</button><button data-analytics="${campaign.id}">التحليلات</button><button class="primary" data-schedule="${campaign.id}">محاولة الإطلاق</button>`
  )).join('') : '<p class="empty">لا توجد حملات.</p>';
}

async function loadInsights() {
  const data = await api('/insights/overview');
  $('#mailboxCount').textContent = data.summary.mailboxes;
  $('#healthyMailboxCount').textContent = data.summary.healthyMailboxes;
  $('#sentTodayCount').textContent = data.summary.sentToday;
  $('#dailyCapacity').textContent = `${data.summary.sentToday} / ${data.summary.dailyCapacity}`;
  $('#contactCount').textContent = data.summary.contacts;
  $('#campaignCount').textContent = data.summary.campaigns;
  $('#universityCount').textContent = data.summary.universities;
  $('#outboxCount').textContent = data.summary.outbox;
  $('#replyCount').textContent = data.summary.replies;
  $('#nextActions').innerHTML = data.actions.length ? data.actions.map((action, index) => `<button class="action-card" data-action-page="${action.page}"><b>${index + 1}</b><span>${escapeHtml(action.title)}</span><i>فتح</i></button>`).join('') : '<p class="empty">جاهز.</p>';
  $('#universityInsights').innerHTML = data.universities.length ? data.universities.map((university) => `<article><div><strong>${escapeHtml(university.university)}</strong><small>${university.contacts} جهة · ${university.specializations} تخصص</small></div></article>`).join('') : '<p class="empty">لا توجد جامعات.</p>';
  renderSettingsStats(data.summary);
}

function renderSettingsStats(summary = overview().summary) {
  $('#settingsStats').innerHTML = [
    ['المرسلون', summary.mailboxes],
    ['الجمهور', summary.contacts],
    ['الحملات', summary.campaigns],
    ['الجامعات', summary.universities]
  ].map(([label, value]) => `<article><small>${label}</small><strong>${value}</strong></article>`).join('');
}

function loadSettings() {
  const settings = readSettings();
  const form = $('#settingsForm');
  Object.entries(settings).forEach(([name, value]) => { const field = form.elements.namedItem(name); if (field) field.value = value; });
  renderSettingsStats();
}

async function loadKnowledge() {
  const [universities, research] = await Promise.all([api('/knowledge/universities'), api('/knowledge/research')]);
  state.universities = universities; state.research = research;
  $('#researchUniversity').innerHTML = universities.length ? universities.map((university) => `<option value="${university.id}">${escapeHtml(university.name)}</option>`).join('') : '<option value="">اختر جامعة</option>';
  $('#researchList').innerHTML = '<p class="empty">لا توجد نتائج.</p>';
}

async function loadOutbox() {
  try {
    state.outbox = await api('/mailboxes/test-outbox/messages');
    $('#outboxList').innerHTML = state.outbox.length ? state.outbox.map((message) => item(message.subject, `${message.recipient} · ${formatDate(message.created_at)}`, `<button data-outbox="${message.id}">عرض</button>`)).join('') : '<p class="empty">لا توجد رسائل.</p>';
  } catch (error) { notice(error.message, 'error'); }
}

async function loadInbox() {
  state.inbox = await api('/inbox');
  $('#inboxBadge').textContent = state.inbox.length;
  $('#inboxBadge').classList.toggle('hidden', state.inbox.length === 0);
  $('#inboxList').innerHTML = state.inbox.length ? state.inbox.map((reply) => item(reply.subject || reply.from_email, reply.from_email || '')).join('') : '<div class="panel empty-state"><h2>لا توجد ردود.</h2></div>';
}

async function refreshAll() {
  try {
    await Promise.all([loadHealth(), loadMailboxes(), loadContacts(), loadCampaigns(), loadKnowledge(), loadOutbox(), loadInbox()]);
    await loadInsights();
  }
  catch (error) { notice(error.message, 'error'); }
}

$$('[data-page]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));
$('#refreshAll').addEventListener('click', async () => { await refreshAll(); notice('تم التحديث.'); });
$('#refreshInbox').addEventListener('click', loadInbox);
$('#inboxIntent').addEventListener('change', loadInbox);
$('#inboxState').addEventListener('change', loadInbox);

function updateProviderFields(provider) {
  const form = $('#mailboxForm');
  const smtp = provider === 'smtp';
  const apiProvider = provider === 'api';
  $('.smtp-only').classList.toggle('hidden', !smtp);
  $('.api-only').classList.toggle('hidden', !apiProvider);
  ['host', 'port', 'password'].forEach((name) => { form.elements.namedItem(name).required = smtp; });
  ['apiKind', 'apiKey'].forEach((name) => { form.elements.namedItem(name).required = apiProvider; });
  const apiKind = form.elements.namedItem('apiKind').value;
  form.elements.namedItem('email').placeholder = apiProvider && apiKind === 'resend' ? 'onboarding@resend.dev أو نطاق موثّق' : 'البريد';
}

$('#mailboxForm [name="provider"]').addEventListener('change', (event) => updateProviderFields(event.target.value));
$('#mailboxForm [name="apiKind"]').addEventListener('change', () => updateProviderFields($('#mailboxForm').elements.namedItem('provider').value));
$('#mailboxForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const body = formData(form);
    body.secure = form.elements.namedItem('secure').checked;
    await api('/mailboxes', { method: 'POST', body });
    form.elements.namedItem('password').value = '';
    form.elements.namedItem('apiKey').value = '';
    notice(body.provider === 'api' ? 'تم الحفظ. اضغط «تحقق بإرسال».' : 'تم الحفظ.');
    await Promise.all([loadMailboxes(), loadInsights()]);
  } catch (error) { notice(error.message, 'error'); }
});

function smtpPreset({ host, port, secure, label }) {
  const form = $('#mailboxForm'); form.provider.value = 'smtp'; updateProviderFields('smtp');
  form.host.value = host; form.port.value = port; form.secure.checked = secure;
  form.email.focus(); notice(label);
}

$('#googleConnect').addEventListener('click', () => smtpPreset({ host: 'smtp.gmail.com', port: 465, secure: true, label: 'Gmail' }));
$('#microsoftConnect').addEventListener('click', () => smtpPreset({ host: 'smtp.office365.com', port: 587, secure: false, label: 'Microsoft' }));

$('#contactForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await api('/contacts/import', { method: 'POST', body: { contacts: [formData(form)] } });
    form.reset();
    notice(`تمت إضافة ${result.imported}.`);
    await Promise.all([loadContacts(), loadInsights()]);
  } catch (error) { notice(error.message, 'error'); }
});

$('#campaignForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const body = formData(form);
    body.segment = { university: body.university || undefined, specialization: body.specialization || undefined };
    body.maxJitterSeconds = Number(body.maxJitterSeconds);
    delete body.university; delete body.specialization;
    await api('/campaigns', { method: 'POST', body });
    form.reset();
    applyFormDefaults();
    notice('تم الحفظ.');
    await Promise.all([loadCampaigns(), loadInsights()]);
  } catch (error) { notice(error.message, 'error'); }
});
$('#generateCampaign').addEventListener('click', async () => { try { await api('/knowledge/agent/draft-campaign', { method: 'POST', body: {} }); } catch (error) { notice(error.message, 'error'); } });

$('#universityForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try { await api('/knowledge/universities', { method: 'POST', body: formData(form) }); form.reset(); notice('تمت الإضافة.'); await Promise.all([loadKnowledge(), loadInsights()]); }
  catch (error) { notice(error.message, 'error'); }
});
$('#researchForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try { await api('/knowledge/research', { method: 'POST', body: formData(form) }); }
  catch (error) { notice(error.message, 'error'); }
});

function applyFormDefaults() {
  const settings = readSettings();
  const mailboxForm = $('#mailboxForm');
  const campaignForm = $('#campaignForm');
  mailboxForm.elements.namedItem('dailyLimit').value = settings.defaultDailyLimit;
  campaignForm.elements.namedItem('maxJitterSeconds').value = settings.defaultJitterSeconds;
  campaignForm.elements.namedItem('senderName').value = settings.defaultSenderName;
}

$('#settingsForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formData(form);
  const settings = {
    defaultSenderName: values.defaultSenderName.trim(),
    testRecipient: values.testRecipient.trim().toLowerCase(),
    defaultDailyLimit: Number(values.defaultDailyLimit),
    defaultJitterSeconds: Number(values.defaultJitterSeconds)
  };
  if (settings.defaultDailyLimit < 1 || settings.defaultDailyLimit > 500) return notice('الحد اليومي يجب أن يكون بين 1 و500.', 'error');
  if (settings.defaultJitterSeconds < 0 || settings.defaultJitterSeconds > 3600) return notice('التذبذب يجب أن يكون بين 0 و3600.', 'error');
  write(keys.settings, settings);
  applyFormDefaults();
  notice('تم حفظ الإعدادات.');
});

$('#exportData').addEventListener('click', async () => {
  try {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: readSettings(),
      mailboxes: state.mailboxes.map(publicMailbox),
      contacts: read(keys.contacts),
      campaigns: read(keys.campaigns),
      universities: read(keys.universities)
    };
    const file = new File([JSON.stringify(payload, null, 2)], 'jareed-soft-backup.json', { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Jareed Soft' });
    else { const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
  } catch (error) { if (error.name !== 'AbortError') notice('تعذر تصدير البيانات.', 'error'); }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.verify) { const result = await api(`/mailboxes/${button.dataset.verify}/verify`, { method: 'POST' }); notice(result.detail || 'نجح تحقق المزود فعليًا.'); await loadMailboxes(); await loadInsights(); }
    if (button.dataset.test) {
      const to = prompt('عنوان المستلم للاختبار:', readSettings().testRecipient);
      if (to) {
        const result = await api(`/mailboxes/${button.dataset.test}/test`, { method: 'POST', body: { to } });
        notice(result.provider === 'test_sink' ? `خُزنت محليًا فقط: ${result.providerMessageId}` : `قبل المزود الرسالة: ${result.providerMessageId}`);
        await Promise.all([loadMailboxes(), loadOutbox()]);
        await loadInsights();
      }
    }
    if (button.dataset.deleteMailbox && confirm('حذف حساب المرسل وبياناته المشفّرة من الهاتف؟')) { await api(`/mailboxes/${button.dataset.deleteMailbox}`, { method: 'DELETE' }); await loadMailboxes(); await loadInsights(); }
    if (button.dataset.deleteContact && confirm('حذف جهة الاتصال من الهاتف؟')) { await api(`/contacts/${button.dataset.deleteContact}`, { method: 'DELETE' }); await Promise.all([loadContacts(), loadInsights()]); }
    if (button.dataset.actionPage) showPage(button.dataset.actionPage);
    if (button.dataset.preflight) { const result = await api(`/campaigns/${button.dataset.preflight}/preflight`); const rows = result.checks.map((check) => `<li class="${check.passed ? 'check-ok' : 'check-bad'}"><b>${check.passed ? '✓' : '×'} ${escapeHtml(check.label)}</b><small>${escapeHtml(check.detail)}</small></li>`).join(''); const blockers = result.blockers.map((entry) => `<li>${escapeHtml(entry.message)}</li>`).join(''); const warnings = result.warnings.map((entry) => `<li>${escapeHtml(entry.message)}</li>`).join(''); $('#dialogBody').innerHTML = `<div class="score-ring blocked"><strong>${result.score}</strong><span>من 100</span></div><h2>فحص محلي صادق</h2><ul class="check-list">${rows}</ul>${blockers ? `<h3>غير جاهز</h3><ul>${blockers}</ul>` : ''}${warnings ? `<h3>تنبيه</h3><ul>${warnings}</ul>` : ''}`; $('#dialog').showModal(); }
    if (button.dataset.schedule) await api(`/campaigns/${button.dataset.schedule}/schedule`, { method: 'POST', body: {} });
    if (button.dataset.analytics) { const result = await api(`/campaigns/${button.dataset.analytics}/analytics`); const labels = { total: 'الإجمالي', accepted: 'قبلها المزود', delivered: 'وصلت', opened: 'فُتحت', clicked: 'نُقر الرابط', replied: 'الردود', bounced: 'المرتدة', failed: 'الفاشلة', blocked: 'الممنوعة' }; $('#dialogBody').innerHTML = `<h2>${escapeHtml(result.campaign?.name || 'الحملة')}</h2><div class="metric-dialog">${Object.entries(result.metrics).map(([key, value]) => `<article><small>${labels[key] || escapeHtml(key)}</small><strong>${value}</strong></article>`).join('')}</div>`; $('#dialog').showModal(); }
    if (button.dataset.outbox) { const message = state.outbox.find((entry) => entry.id === button.dataset.outbox); $('#dialogBody').innerHTML = `<h2>${escapeHtml(message.subject)}</h2><p>${escapeHtml(message.recipient)}</p><iframe sandbox srcdoc="${escapeHtml(message.html_body)}"></iframe>`; $('#dialog').showModal(); }
  } catch (error) { notice(error.message, 'error'); }
});

(async function boot() {
  loadSettings();
  applyFormDefaults();
  updateProviderFields($('#mailboxForm').elements.namedItem('provider').value);
  showPage('overview');
  await refreshAll();
})();

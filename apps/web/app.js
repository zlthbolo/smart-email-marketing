const API = window.JAREED_API_URL || `${location.protocol}//${location.hostname}:3001/v1`;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { token: localStorage.getItem('jareed_token'), user: null, mailboxes: [], campaigns: [], universities: [] };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function notice(message, type = 'success') {
  $('#notice').innerHTML = `<div class="notice ${type}">${escapeHtml(message)}</div>`;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { $('#notice').innerHTML = ''; }, 6000);
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(state.token ? { authorization: `Bearer ${state.token}` } : {}), ...options.headers };
  const response = await fetch(`${API}${path}`, { ...options, headers, body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
  const payload = await response.json().catch(() => ({ ok: false, error: { message: `HTTP ${response.status}` } }));
  if (!response.ok || !payload.ok) {
    if (response.status === 401) signOut(false);
    const error = new Error(payload.error?.message || 'تعذر إكمال العملية');
    error.code = payload.error?.code;
    throw error;
  }
  return payload.data;
}

function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

function setApp(auth) {
  state.user = auth.user || auth;
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#userName').textContent = state.user.display_name || state.user.email;
}

function signOut(callApi = true) {
  if (callApi && state.token) api('/auth/logout', { method: 'POST' }).catch(() => {});
  state.token = null; state.user = null;
  localStorage.removeItem('jareed_token');
  $('#appView').classList.add('hidden');
  $('#authView').classList.remove('hidden');
}

function item(title, meta, actions = '') {
  return `<article class="list-item"><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(meta)}</p></div>${actions ? `<div class="actions">${actions}</div>` : ''}</article>`;
}

function showPage(name) {
  const labels = { overview: 'نظرة عامة', mailboxes: 'صناديق البريد', contacts: 'الجمهور', campaigns: 'الحملات', research: 'وكيل البحث', outbox: 'صندوق الاختبار' };
  $$('[data-view]').forEach((view) => view.classList.toggle('hidden', view.dataset.view !== name));
  $$('[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === name));
  $('#pageTitle').textContent = labels[name];
  if (name === 'outbox') loadOutbox();
}

async function loadHealth() {
  try {
    const data = await api('/health');
    const services = data.dependencies || data.checks || data;
    const postgres = services.postgres || services.database || {};
    const redis = services.redis || {};
    $('#postgresStatus').textContent = postgres.status === 'unhealthy' ? 'متعطل' : 'متصل';
    $('#redisStatus').textContent = redis.status === 'unhealthy' ? 'متعطل' : 'متصل';
    $('#postgresDetail').textContent = postgres.latencyMs != null ? `${postgres.latencyMs}ms` : 'Backend حقيقي';
    $('#redisDetail').textContent = redis.latencyMs != null ? `${redis.latencyMs}ms` : 'طابور حقيقي';
    $('#systemDot').classList.add('healthy');
  } catch (error) {
    $('#postgresStatus').textContent = $('#redisStatus').textContent = 'غير متاح';
    $('#systemDot').classList.remove('healthy');
  }
}

async function loadMailboxes() {
  state.mailboxes = await api('/mailboxes');
  $('#mailboxCount').textContent = state.mailboxes.filter((mailbox) => mailbox.status === 'healthy').length;
  $('#mailboxList').innerHTML = state.mailboxes.length ? state.mailboxes.map((mailbox) => item(
    `${mailbox.display_name || mailbox.email} — ${mailbox.email}`,
    `${mailbox.provider} · ${mailbox.status} · ${mailbox.sent_today}/${mailbox.effective_daily_limit} اليوم${mailbox.last_error ? ` · ${mailbox.last_error}` : ''}`,
    `<button data-verify="${mailbox.id}">تحقق</button><button data-test="${mailbox.id}">اختبار إرسال</button><button class="danger" data-delete-mailbox="${mailbox.id}">حذف</button>`
  )).join('') : '<p class="empty">لا توجد صناديق بعد.</p>';
  $('#campaignMailbox').innerHTML = state.mailboxes.filter((mailbox) => mailbox.status === 'healthy').map((mailbox) => `<option value="${mailbox.id}">${escapeHtml(mailbox.email)} — ${escapeHtml(mailbox.provider)}</option>`).join('');
}

async function loadContacts() {
  const contacts = await api('/contacts?limit=100');
  $('#contactList').innerHTML = contacts.length ? contacts.map((contact) => item(contact.email, `${contact.first_name || ''} · ${contact.university || 'بدون جامعة'} · ${contact.consent_basis}`, `<button class="danger" data-delete-contact="${contact.id}">حذف</button>`)).join('') : '<p class="empty">لا توجد جهات اتصال.</p>';
}

async function loadCampaigns() {
  state.campaigns = await api('/campaigns');
  $('#campaignCount').textContent = state.campaigns.length;
  $('#campaignList').innerHTML = state.campaigns.length ? state.campaigns.map((campaign) => item(
    campaign.name,
    `${campaign.status} · ${campaign.recipients} مستلم · ${campaign.mailbox_email || 'صندوق محذوف'} · ${formatDate(campaign.scheduled_at)}`,
    `<button data-analytics="${campaign.id}">التحليلات</button>${['draft', 'paused', 'failed'].includes(campaign.status) ? `<button class="primary" data-schedule="${campaign.id}">جدولة الآن</button>` : ''}${['scheduled', 'running'].includes(campaign.status) ? `<button data-pause="${campaign.id}">إيقاف</button>` : ''}`
  )).join('') : '<p class="empty">لا توجد حملات.</p>';
}

async function loadKnowledge() {
  const [universities, research] = await Promise.all([api('/knowledge/universities'), api('/knowledge/research')]);
  state.universities = universities;
  $('#researchUniversity').innerHTML = universities.map((university) => `<option value="${university.id}">${escapeHtml(university.name)}</option>`).join('');
  $('#researchList').innerHTML = research.length ? research.map((run) => item(
    `${run.university_name} — ${run.status}`,
    `${run.objective} · ${run.evidence_count || 0} مصدر`,
    `${run.provider_response_id && run.status === 'running' ? `<button data-refresh-research="${run.id}">تحديث من OpenAI</button>` : ''}${run.report_text ? `<button data-report="${run.id}">عرض التقرير</button>` : ''}`
  )).join('') : '<p class="empty">لم يبدأ بحث بعد.</p>';
  state.research = research;
}

async function loadOutbox() {
  try {
    const messages = await api('/mailboxes/test-outbox/messages');
    $('#outboxList').innerHTML = messages.length ? messages.map((message) => item(message.subject, `${message.recipient} · ${formatDate(message.created_at)}`, `<button data-outbox="${message.id}">عرض</button>`)).join('') : '<p class="empty">لا توجد رسائل اختبار.</p>';
    state.outbox = messages;
  } catch (error) { notice(error.message, 'error'); }
}

async function refreshAll() {
  try { await Promise.all([loadHealth(), loadMailboxes(), loadContacts(), loadCampaigns(), loadKnowledge()]); }
  catch (error) { notice(error.message, 'error'); }
}

$$('[data-auth]').forEach((button) => button.addEventListener('click', () => {
  $$('[data-auth]').forEach((item) => item.classList.toggle('active', item === button));
  $('#authForm').dataset.mode = button.dataset.auth;
  $$('.register-only').forEach((input) => input.classList.toggle('hidden', button.dataset.auth !== 'register'));
}));

$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#authError').textContent = '';
  const body = formData(event.currentTarget); const mode = event.currentTarget.dataset.mode || 'login';
  try {
    const auth = await api(`/auth/${mode}`, { method: 'POST', body });
    state.token = auth.token; localStorage.setItem('jareed_token', auth.token); setApp(auth); await refreshAll();
  } catch (error) { $('#authError').textContent = error.message; }
});

$$('[data-page]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));
$('#logout').addEventListener('click', () => signOut());
$('#refreshAll').addEventListener('click', refreshAll);

$('#mailboxForm [name="provider"]').addEventListener('change', (event) => { $('.smtp-only').classList.toggle('hidden', event.target.value !== 'smtp'); $('.api-only').classList.toggle('hidden', event.target.value !== 'api'); });
$('#mailboxForm').addEventListener('submit', async (event) => { event.preventDefault(); try { const body = formData(event.currentTarget); body.secure = event.currentTarget.secure.checked; await api('/mailboxes', { method: 'POST', body }); notice('تم حفظ الصندوق. نفّذ التحقق قبل استخدامه.'); await loadMailboxes(); } catch (error) { notice(error.message, 'error'); } });
$('#googleConnect').addEventListener('click', async () => { try { location.href = (await api('/oauth/google/start')).authorizationUrl; } catch (error) { notice(error.message, 'error'); } });
$('#microsoftConnect').addEventListener('click', async () => { try { location.href = (await api('/oauth/microsoft/start')).authorizationUrl; } catch (error) { notice(error.message, 'error'); } });

$('#contactForm').addEventListener('submit', async (event) => { event.preventDefault(); try { const contacts = JSON.parse(formData(event.currentTarget).contacts); const result = await api('/contacts/import', { method: 'POST', body: { contacts } }); notice(`تم استيراد أو تحديث ${result.imported} جهة.`); await loadContacts(); } catch (error) { notice(error.message, 'error'); } });

$('#campaignForm').addEventListener('submit', async (event) => { event.preventDefault(); try { const body = formData(event.currentTarget); body.segment = { university: body.university || undefined, specialization: body.specialization || undefined }; body.maxJitterSeconds = Number(body.maxJitterSeconds); delete body.university; delete body.specialization; await api('/campaigns', { method: 'POST', body }); notice('أُنشئت المسودة. راجعها ثم اضغط جدولة الآن.'); event.currentTarget.reset(); await loadCampaigns(); } catch (error) { notice(error.message, 'error'); } });
$('#generateCampaign').addEventListener('click', async () => { try { const form=$('#campaignForm');const brief=form.aiBrief.value;const draft=await api('/knowledge/agent/draft-campaign',{method:'POST',body:{brief,audience:[form.university.value,form.specialization.value].filter(Boolean).join(' / '),language:'ar'}});form.subject.value=draft.subject;form.html.value=draft.html;form.text.value=draft.text;notice(`أنشأ وكيل AI مسودة قابلة للمراجعة (${draft.responseId}).`); } catch(error){notice(error.message,'error')} });

$('#universityForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await api('/knowledge/universities', { method: 'POST', body: formData(event.currentTarget) }); notice('تمت إضافة الجامعة.'); event.currentTarget.reset(); await loadKnowledge(); } catch (error) { notice(error.message, 'error'); } });
$('#researchForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await api('/knowledge/research', { method: 'POST', body: formData(event.currentTarget) }); notice('بدأ البحث في الخلفية. استخدم زر التحديث لجلب الحالة من OpenAI.'); await loadKnowledge(); } catch (error) { notice(error.message, 'error'); } });

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.verify) { const result = await api(`/mailboxes/${button.dataset.verify}/verify`, { method: 'POST' }); notice(result.detail || 'نجح تحقق المزود.'); await loadMailboxes(); }
    if (button.dataset.test) { const to = prompt('عنوان المستلم للاختبار:'); if (to) { const result = await api(`/mailboxes/${button.dataset.test}/test`, { method: 'POST', body: { to } }); notice(result.provider === 'test_sink' ? `خُزنت محليًا فقط: ${result.providerMessageId}` : `قبل المزود الرسالة: ${result.providerMessageId}`); } }
    if (button.dataset.deleteMailbox && confirm('حذف صندوق البريد؟')) { await api(`/mailboxes/${button.dataset.deleteMailbox}`, { method: 'DELETE' }); await loadMailboxes(); }
    if (button.dataset.deleteContact && confirm('حذف جهة الاتصال؟')) { await api(`/contacts/${button.dataset.deleteContact}`, { method: 'DELETE' }); await loadContacts(); }
    if (button.dataset.schedule) { const result = await api(`/campaigns/${button.dataset.schedule}/schedule`, { method: 'POST', body: {} }); notice(`تمت جدولة ${result.queued} رسالة.`); await loadCampaigns(); }
    if (button.dataset.pause) { await api(`/campaigns/${button.dataset.pause}/pause`, { method: 'POST' }); notice('تم إيقاف الحملة.'); await loadCampaigns(); }
    if (button.dataset.analytics) { const result = await api(`/campaigns/${button.dataset.analytics}/analytics`); $('#dialogBody').innerHTML = `<h2>${escapeHtml(result.campaign.name)}</h2><pre>${escapeHtml(JSON.stringify(result.metrics, null, 2))}</pre>`; $('#dialog').showModal(); }
    if (button.dataset.refreshResearch) { await api(`/knowledge/research/${button.dataset.refreshResearch}/refresh`, { method: 'POST' }); await loadKnowledge(); }
    if (button.dataset.report) { const run = state.research.find((item) => item.id === button.dataset.report); $('#dialogBody').innerHTML = `<h2>تقرير البحث</h2><pre>${escapeHtml(run.report_text)}</pre><h3>المصادر</h3><pre>${escapeHtml(JSON.stringify(run.citations, null, 2))}</pre>`; $('#dialog').showModal(); }
    if (button.dataset.outbox) { const message = state.outbox.find((item) => item.id === button.dataset.outbox); $('#dialogBody').innerHTML = `<h2>${escapeHtml(message.subject)}</h2><p>${escapeHtml(message.recipient)}</p><iframe sandbox srcdoc="${escapeHtml(message.html_body)}"></iframe>`; $('#dialog').showModal(); }
  } catch (error) { notice(error.message, 'error'); }
});

(async function boot() {
  $$('.register-only').forEach((input) => input.classList.add('hidden'));
  if (!state.token) return;
  try { const auth = await api('/auth/me'); setApp(auth); await refreshAll(); } catch { signOut(false); }
})();

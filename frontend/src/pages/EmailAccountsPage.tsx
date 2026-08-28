import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CirclePause,
  CirclePlay,
  Edit3,
  KeyRound,
  Mail,
  MoreHorizontal,
  PlugZap,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { useToast } from '../components/Toast';
import { Button, Card, EmptyState, ErrorState, Field, IconButton, LoadingState, Modal, Notice, PageHeader, SearchInput, StatusBadge } from '../components/ui';
import { api, getApiErrorMessage, queryString } from '../lib/api';
import { extractList, hasConnectionProof, hasSendProof } from '../lib/data';
import { formatDate, formatNumber } from '../lib/format';
import type { EmailAccount } from '../types';

type AccountPayload = {
  provider: string;
  email: string;
  senderName: string;
  dailyLimit: number;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUsername?: string;
  smtpPassword?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUsername?: string;
  imapPassword?: string;
  appPassword?: string;
};

const initialPayload: AccountPayload = {
  provider: 'GMAIL_APP_PASSWORD',
  email: '',
  senderName: '',
  dailyLimit: 40,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpSecure: true,
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  imapSecure: true,
};

const providers: Record<string, string> = {
  GMAIL_APP_PASSWORD: 'Gmail — كلمة مرور تطبيق',
  SMTP_IMAP: 'SMTP + IMAP مخصص',
  GMAIL_OAUTH: 'Google OAuth',
  OUTLOOK: 'Microsoft / Outlook',
  API: 'مزود API',
};

export function EmailAccountForm({ initial, onSubmit, onCancel, pending }: { initial?: EmailAccount | null; onSubmit: (value: AccountPayload) => void; onCancel: () => void; pending: boolean }) {
  const [value, setValue] = useState<AccountPayload>(() => initial ? {
    provider: initial.provider,
    email: initial.email,
    senderName: initial.senderName,
    dailyLimit: initial.dailyLimit,
  } : initialPayload);
  const [submitted, setSubmitted] = useState(false);
  const update = <K extends keyof AccountPayload>(key: K, next: AccountPayload[K]) => setValue((current) => ({ ...current, [key]: next }));
  const custom = value.provider === 'SMTP_IMAP' || value.provider === 'OUTLOOK';
  const gmailPassword = value.provider === 'GMAIL_APP_PASSWORD';
  const emailError = submitted && !/^\S+@\S+\.\S+$/.test(value.email) ? 'أدخل بريدًا صحيحًا' : '';
  const passwordMissing = submitted && !initial && gmailPassword && !value.appPassword ? 'كلمة مرور التطبيق مطلوبة' : '';
  const customSecretMissing = submitted && !initial && custom && (!value.smtpPassword || !value.imapPassword) ? 'أدخل كلمات مرور SMTP وIMAP' : '';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!value.senderName.trim() || emailError || passwordMissing || customSecretMissing) return;
    onSubmit({ ...value, email: value.email.trim(), senderName: value.senderName.trim() });
  };

  return (
    <form onSubmit={submit} className="form-stack" noValidate>
      <div className="form-grid form-grid--2">
        <Field label="نوع الاتصال" required>
          <select value={value.provider} onChange={(e) => update('provider', e.target.value)} disabled={Boolean(initial)}>
            <option value="GMAIL_APP_PASSWORD">{providers.GMAIL_APP_PASSWORD}</option>
            <option value="SMTP_IMAP">{providers.SMTP_IMAP}</option>
            <option value="OUTLOOK">{providers.OUTLOOK}</option>
          </select>
        </Field>
        <Field label="اسم المرسل" required error={submitted && !value.senderName.trim() ? 'اسم المرسل مطلوب' : ''}>
          <input value={value.senderName} onChange={(e) => update('senderName', e.target.value)} placeholder="فريق جريد" />
        </Field>
        <Field label="البريد الإلكتروني" required error={emailError}>
          <input type="email" value={value.email} onChange={(e) => update('email', e.target.value)} placeholder="sender@example.com" dir="ltr" />
        </Field>
        <Field label="حد الإرسال اليومي" required hint="لن يتجاوز المحرك هذا الرقم">
          <input type="number" min={1} max={10000} value={value.dailyLimit} onChange={(e) => update('dailyLimit', Number(e.target.value))} />
        </Field>
      </div>

      {gmailPassword && (
        <fieldset className="form-section">
          <legend>مصادقة Gmail</legend>
          <Notice tone="info">استخدم كلمة مرور تطبيق من Google، وليس كلمة مرور حسابك الأساسية. لن تُعرض القيمة بعد الحفظ.</Notice>
          <Field label={initial ? 'استبدال كلمة مرور التطبيق (اختياري)' : 'كلمة مرور التطبيق'} required={!initial} error={passwordMissing}>
            <input type="password" autoComplete="new-password" value={value.appPassword || ''} onChange={(e) => update('appPassword', e.target.value)} placeholder={initial ? 'اتركها فارغة للإبقاء على الحالية' : '16 حرفًا'} dir="ltr" />
          </Field>
        </fieldset>
      )}

      {custom && (
        <>
          <fieldset className="form-section">
            <legend>خادم SMTP</legend>
            <div className="form-grid form-grid--3">
              <Field label="Host" required><input value={value.smtpHost || ''} onChange={(e) => update('smtpHost', e.target.value)} dir="ltr" placeholder="smtp.example.com" /></Field>
              <Field label="Port" required><input type="number" value={value.smtpPort || 587} onChange={(e) => update('smtpPort', Number(e.target.value))} dir="ltr" /></Field>
              <Field label="التشفير"><select value={value.smtpSecure ? 'tls' : 'starttls'} onChange={(e) => update('smtpSecure', e.target.value === 'tls')}><option value="tls">TLS مباشر</option><option value="starttls">STARTTLS</option></select></Field>
              <Field label="اسم المستخدم" required><input value={value.smtpUsername || ''} onChange={(e) => update('smtpUsername', e.target.value)} dir="ltr" /></Field>
              <Field label={initial ? 'استبدال كلمة المرور' : 'كلمة المرور'} error={customSecretMissing}><input type="password" value={value.smtpPassword || ''} onChange={(e) => update('smtpPassword', e.target.value)} dir="ltr" placeholder={initial ? 'اختياري' : ''} /></Field>
            </div>
          </fieldset>
          <fieldset className="form-section">
            <legend>خادم IMAP</legend>
            <div className="form-grid form-grid--3">
              <Field label="Host" required><input value={value.imapHost || ''} onChange={(e) => update('imapHost', e.target.value)} dir="ltr" placeholder="imap.example.com" /></Field>
              <Field label="Port" required><input type="number" value={value.imapPort || 993} onChange={(e) => update('imapPort', Number(e.target.value))} dir="ltr" /></Field>
              <Field label="التشفير"><select value={value.imapSecure ? 'tls' : 'starttls'} onChange={(e) => update('imapSecure', e.target.value === 'tls')}><option value="tls">TLS مباشر</option><option value="starttls">STARTTLS</option></select></Field>
              <Field label="اسم المستخدم" required><input value={value.imapUsername || ''} onChange={(e) => update('imapUsername', e.target.value)} dir="ltr" /></Field>
              <Field label={initial ? 'استبدال كلمة المرور' : 'كلمة المرور'} error={customSecretMissing}><input type="password" value={value.imapPassword || ''} onChange={(e) => update('imapPassword', e.target.value)} dir="ltr" placeholder={initial ? 'اختياري' : ''} /></Field>
            </div>
          </fieldset>
        </>
      )}

      <div className="modal-actions"><Button type="button" onClick={onCancel}>إلغاء</Button><Button type="submit" variant="primary" loading={pending}>{initial ? 'حفظ التغييرات' : 'إضافة الحساب'}</Button></div>
    </form>
  );
}

export function EmailAccountsPage() {
  const [search, setSearch] = useState('');
  const [health, setHealth] = useState('');
  const [editing, setEditing] = useState<EmailAccount | null | 'new'>(null);
  const [testRecipientFor, setTestRecipientFor] = useState<EmailAccount | null>(null);
  const [testRecipient, setTestRecipient] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();
  const accountsQuery = useQuery({
    queryKey: ['email-accounts', search, health],
    queryFn: ({ signal }) => api.get<EmailAccount[] | { items: EmailAccount[] }>(`/email-accounts${queryString({ search, health })}`, signal),
  });
  const accounts = useMemo(() => extractList(accountsQuery.data?.data), [accountsQuery.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
  const save = useMutation({
    mutationFn: (payload: AccountPayload) => editing && editing !== 'new' ? api.put<EmailAccount>(`/email-accounts/${editing.id}`, payload) : api.post<EmailAccount>('/email-accounts', payload),
    onSuccess: () => { toast.push(editing === 'new' ? 'تمت إضافة الحساب' : 'تم تحديث الحساب', 'success'); setEditing(null); refresh(); },
    onError: (error) => toast.push('تعذّر حفظ الحساب', 'error', getApiErrorMessage(error)),
  });
  const changeState = useMutation({
    mutationFn: ({ account, action }: { account: EmailAccount; action: 'pause' | 'resume' }) => api.post(`/email-accounts/${account.id}/${action}`),
    onSuccess: (_, variables) => { toast.push(variables.action === 'pause' ? 'تم إيقاف الحساب' : 'تم استئناف الحساب', 'success'); refresh(); },
    onError: (error) => toast.push('تعذّر تغيير حالة الحساب', 'error', getApiErrorMessage(error)),
  });
  const testConnection = useMutation({
    mutationFn: (account: EmailAccount) => api.post<Record<string, unknown>>(`/email-accounts/${account.id}/test-connection`),
    onSuccess: ({ data }) => {
      if (!hasConnectionProof(data)) return toast.push('لم يؤكد الخادم نجاح الاتصال', 'error', 'لم تُعرض نتيجة نجاح لأن الاستجابة لا تحتوي إثبات مصادقة من SMTP/IMAP.');
      toast.push('نجح الاتصال الحقيقي', 'success', 'أكد الخادم مصادقة مزود البريد.'); refresh();
    },
    onError: (error) => toast.push('فشل اختبار الاتصال', 'error', getApiErrorMessage(error)),
  });
  const sendTest = useMutation({
    mutationFn: () => api.post<Record<string, unknown>>(`/email-accounts/${testRecipientFor!.id}/send-test`, { to: testRecipient.trim() }),
    onSuccess: ({ data }) => {
      if (!hasSendProof(data)) return toast.push('لم يتأكد الإرسال', 'error', 'لم يرجع المزود Message ID أو قائمة مستلمين مقبولين.');
      toast.push('أُرسلت الرسالة الاختبارية فعليًا', 'success', String(data.messageId || data.providerMessageId || 'أكد المزود الاستلام'));
      setTestRecipientFor(null); setTestRecipient(''); refresh();
    },
    onError: (error) => toast.push('فشل إرسال الاختبار', 'error', getApiErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (account: EmailAccount) => api.delete(`/email-accounts/${account.id}`),
    onSuccess: () => { toast.push('تم حذف الحساب', 'success'); refresh(); },
    onError: (error) => toast.push('تعذّر حذف الحساب', 'error', getApiErrorMessage(error)),
  });

  return (
    <>
      <PageHeader title="حسابات الإرسال" description="أضف حساباتك واختبر اتصالها الفعلي وحدودها اليومية" actions={<><button className="button button--secondary" type="button" onClick={async () => { try { const { data } = await api.get<{ authorizationUrl: string }>('/oauth/google/start'); window.location.assign(data.authorizationUrl); } catch (error) { toast.push('تعذّر بدء ربط Google', 'error', getApiErrorMessage(error)); } }}><KeyRound size={16} /> ربط Google</button><Button variant="primary" onClick={() => setEditing('new')}><Plus size={17} /> إضافة حساب</Button></>} />
      <section className="account-summary-grid">
        <Card><span className="summary-icon"><Mail size={18} /></span><div><small>إجمالي الحسابات</small><strong>{formatNumber(accounts.length)}</strong></div></Card>
        <Card><span className="summary-icon summary-icon--success"><ShieldCheck size={18} /></span><div><small>حسابات سليمة</small><strong>{formatNumber(accounts.filter((account) => account.health === 'HEALTHY').length)}</strong></div></Card>
        <Card><span className="summary-icon summary-icon--danger"><AlertTriangle size={18} /></span><div><small>تحتاج تدخلاً</small><strong>{formatNumber(accounts.filter((account) => ['PROBLEM', 'WARNING'].includes(account.health)).length)}</strong></div></Card>
        <Card><span className="summary-icon summary-icon--violet"><Send size={18} /></span><div><small>المتبقي اليوم</small><strong>{formatNumber(accounts.reduce((sum, account) => sum + (account.remainingToday || 0), 0))}</strong></div></Card>
      </section>
      <Card className="table-card">
        <div className="table-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="بحث بالبريد أو اسم المرسل…" /><div className="toolbar-group"><select value={health} onChange={(e) => setHealth(e.target.value)} aria-label="تصفية حسب الصحة"><option value="">كل الحالات</option><option value="HEALTHY">سليم</option><option value="WARNING">تحذير</option><option value="PROBLEM">مشكلة</option></select><IconButton label="تحديث" onClick={() => accountsQuery.refetch()}><RefreshCw size={17} /></IconButton></div></div>
        {accountsQuery.isPending ? <LoadingState /> : accountsQuery.isError ? <ErrorState error={accountsQuery.error} onRetry={() => accountsQuery.refetch()} /> : accounts.length === 0 ? (
          <EmptyState icon={<Mail size={28} />} title="لا توجد حسابات إرسال" description={search || health ? 'لا توجد نتائج مطابقة. غيّر التصفية.' : 'أضف أول حساب، ثم اختبر SMTP وIMAP قبل استخدامه.'} action={!search && !health && <Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} /> إضافة حساب</Button>} />
        ) : (
          <div className="responsive-table-wrap">
            <table className="data-table accounts-table">
              <thead><tr><th>الحساب</th><th>الاتصال</th><th>الاستخدام اليومي</th><th>الصحة</th><th>آخر إرسال ناجح</th><th><span className="sr-only">الإجراءات</span></th></tr></thead>
              <tbody>{accounts.map((account) => {
                const percent = account.dailyLimit ? Math.min(100, (account.sentToday / account.dailyLimit) * 100) : 0;
                return (
                  <tr key={account.id}>
                    <td data-label="الحساب"><div className="account-cell"><span className="avatar avatar--mail">{account.senderName?.charAt(0) || '@'}</span><div><b>{account.senderName}</b><small dir="ltr">{account.email}</small><em>{providers[account.provider] || account.provider}</em></div></div></td>
                    <td data-label="الاتصال"><div className="connection-status"><span>SMTP <StatusBadge status={account.smtpStatus} /></span><span>IMAP <StatusBadge status={account.imapStatus} /></span></div></td>
                    <td data-label="الاستخدام اليومي"><div className="usage-cell"><span><b>{formatNumber(account.sentToday)}</b> / {formatNumber(account.dailyLimit)}</span><div className="progress"><span style={{ width: `${percent}%` }} /></div><small>متبقي {formatNumber(account.remainingToday)}</small></div></td>
                    <td data-label="الصحة"><StatusBadge status={account.state === 'PAUSED' ? 'PAUSED' : account.health} />{account.lastError && <small className="error-snippet" title={account.lastError}>{account.lastError}</small>}</td>
                    <td data-label="آخر إرسال"><span className="date-cell">{formatDate(account.lastSuccessfulSendAt)}</span></td>
                    <td className="actions-cell">
                      <Button onClick={() => testConnection.mutate(account)} loading={testConnection.isPending && testConnection.variables?.id === account.id}><PlugZap size={15} /> اختبار</Button>
                      <div className="row-menu"><IconButton label="المزيد" onClick={() => setMenuId(menuId === account.id ? null : account.id)}><MoreHorizontal size={18} /></IconButton>{menuId === account.id && <div className="row-menu__popover"><button onClick={() => { setEditing(account); setMenuId(null); }}><Edit3 size={15} /> تعديل</button><button onClick={() => { setTestRecipientFor(account); setMenuId(null); }}><Send size={15} /> إرسال اختبار</button><button onClick={() => { changeState.mutate({ account, action: account.state === 'PAUSED' ? 'resume' : 'pause' }); setMenuId(null); }}>{account.state === 'PAUSED' ? <CirclePlay size={15} /> : <CirclePause size={15} />}{account.state === 'PAUSED' ? 'استئناف' : 'إيقاف'}</button><button className="text-danger" onClick={() => { if (window.confirm(`حذف ${account.email}؟`)) remove.mutate(account); setMenuId(null); }}><Trash2 size={15} /> حذف</button></div>}</div>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={editing !== null} title={editing === 'new' ? 'إضافة حساب إرسال' : 'تعديل حساب الإرسال'} description="لن تُعرض الأسرار مرة أخرى بعد حفظها." size="large" onClose={() => setEditing(null)}>
        <EmailAccountForm initial={editing === 'new' ? null : editing} onSubmit={(payload) => save.mutate(payload)} onCancel={() => setEditing(null)} pending={save.isPending} />
      </Modal>
      <Modal open={Boolean(testRecipientFor)} title="إرسال رسالة اختبار حقيقية" description={`سيُستخدم ${testRecipientFor?.email || ''}`} onClose={() => setTestRecipientFor(null)} size="small">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (/^\S+@\S+\.\S+$/.test(testRecipient)) sendTest.mutate(); }}>
          <Notice tone="warning">لن نعرض نجاحًا إلا إذا أعاد المزود Message ID أو قائمة مستلمين مقبولين.</Notice>
          <Field label="بريد الاستلام" required><input type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="you@example.com" dir="ltr" /></Field>
          <div className="modal-actions"><Button type="button" onClick={() => setTestRecipientFor(null)}>إلغاء</Button><Button variant="primary" type="submit" loading={sendTest.isPending} disabled={!/^\S+@\S+\.\S+$/.test(testRecipient)}>إرسال الاختبار</Button></div>
        </form>
      </Modal>
    </>
  );
}

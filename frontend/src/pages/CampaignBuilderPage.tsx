import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus, Send, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Notice, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';
import { api, getApiErrorMessage } from '../lib/api';
import { extractList } from '../lib/data';
import type { EmailAccount, SequenceStep } from '../types';

export function CampaignBuilderPage() {
  const navigate = useNavigate();
  const { campaignId } = useParams();
  const toast = useToast();
  const [name, setName] = useState('');
  const [senderName, setSenderName] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [mailboxIds, setMailboxIds] = useState<string[]>([]);
  const [university, setUniversity] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [steps, setSteps] = useState<SequenceStep[]>([{ position: 0, type: 'EMAIL', subject: '', bodyText: '', bodyHtml: '' }]);
  const [launchMode, setLaunchMode] = useState<'DRAFT' | 'NOW' | 'LATER'>('DRAFT');
  const [scheduledAt, setScheduledAt] = useState('');
  const [loadedCampaignId, setLoadedCampaignId] = useState('');
  const accounts = useQuery({ queryKey: ['email-accounts'], queryFn: ({ signal }) => api.get<EmailAccount[]>('/email-accounts', signal) });
  const detail = useQuery({ queryKey: ['campaign', campaignId], enabled: Boolean(campaignId), queryFn: ({ signal }) => api.get<{ campaign: Record<string, unknown>; senders: Array<{ id: string }>; sequence: Array<SequenceStep & { delaySeconds?: number }> }>(`/campaigns/${campaignId}`, signal).then((result) => result.data) });
  const healthy = extractList(accounts.data?.data).filter((account) => account.health === 'HEALTHY' && account.state !== 'PAUSED');
  useEffect(() => {
    if (!campaignId || !detail.data || loadedCampaignId === campaignId) return;
    const campaign = detail.data.campaign;
    setName(String(campaign.name || ''));
    setSenderName(String(campaign.sender_name || ''));
    setPhysicalAddress(String(campaign.physical_address || ''));
    const segment = (campaign.segment_definition || {}) as Record<string, unknown>;
    setUniversity(String(segment.university || ''));
    setSpecialization(String(segment.specialization || ''));
    setMailboxIds(detail.data.senders.map((sender) => sender.id));
    setSteps(detail.data.sequence.filter((step) => step.type === 'EMAIL').map((step, index) => ({ ...step, position: index, delayAmount: step.delaySeconds ? Math.max(1, Math.round(step.delaySeconds / 86400)) : 0, delayUnit: 'DAYS' })));
    setLoadedCampaignId(campaignId);
  }, [campaignId, detail.data, loadedCampaignId]);
  const create = useMutation({
    mutationFn: async () => {
      const payload = { name, mailboxIds, senderName, physicalAddress, subject: steps[0]?.subject, text: steps[0]?.bodyText, html: steps[0]?.bodyHtml || steps[0]?.bodyText, segment: { university: university || undefined, specialization: specialization || undefined }, sequence: steps };
      const saved = campaignId ? await api.put<{ id: string }>(`/campaigns/${campaignId}`, payload) : await api.post<{ id: string }>('/campaigns', payload);
      const id = campaignId || saved.data.id;
      if (campaignId) {
        await api.put(`/campaigns/${id}/senders`, { mailboxIds });
        await api.put(`/campaigns/${id}/sequence`, { sequence: steps });
      }
      if (launchMode !== 'DRAFT') await api.post(`/campaigns/${id}/schedule`, { scheduledAt: launchMode === 'LATER' ? new Date(scheduledAt).toISOString() : new Date().toISOString() });
      return saved;
    },
    onSuccess: () => { toast.push(launchMode === 'DRAFT' ? 'تم حفظ المسودة' : 'تمت جدولة الحملة', 'success'); navigate('/campaigns'); },
    onError: (error) => toast.push('تعذّر حفظ الحملة', 'error', getApiErrorMessage(error)),
  });
  const updateStep = (index: number, patch: Partial<SequenceStep>) => setSteps((current) => current.map((step, i) => i === index ? { ...step, ...patch } : step));
  const submit = (event: FormEvent) => { event.preventDefault(); if (name && senderName && physicalAddress && mailboxIds.length && steps[0]?.subject && steps[0]?.bodyText) create.mutate(); };
  return <>
    <PageHeader title={campaignId ? 'تعديل الحملة' : 'منشئ الحملة'} description="الإعداد الكامل في صفحة واحدة" actions={<Link className="button button--ghost" to="/campaigns"><ArrowRight size={16}/> رجوع</Link>} />
    <form onSubmit={submit} className="builder-layout">
      <div className="builder-main">
        <Card className="form-card"><h2>بيانات الحملة</h2><div className="form-grid form-grid--2"><Field label="اسم الحملة" required><input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="اسم المرسل" required><input value={senderName} onChange={(e) => setSenderName(e.target.value)} /></Field><Field label="الجامعة"><input value={university} onChange={(e) => setUniversity(e.target.value)} /></Field><Field label="التخصص"><input value={specialization} onChange={(e) => setSpecialization(e.target.value)} /></Field><Field label="العنوان البريدي" required><input value={physicalAddress} onChange={(e) => setPhysicalAddress(e.target.value)} /></Field></div></Card>
        <Card className="form-card"><div className="card-heading"><div><h2>التسلسل</h2><p>رسائل وفواصل مرتبة</p></div><Button type="button" onClick={() => setSteps((current) => [...current, { position: current.length, type: 'EMAIL', subject: '', bodyText: '', delayAmount: 2, delayUnit: 'DAYS' }])}><Plus size={15}/> رسالة</Button></div>{steps.map((step, index) => <div className="sequence-step" key={index}><div className="sequence-step__number">{index + 1}</div><div className="sequence-step__content">{index > 0 && <div className="form-grid form-grid--2"><Field label="الانتظار قبل الرسالة"><input type="number" min={1} max={365} value={step.delayAmount || 1} onChange={(e) => updateStep(index, { delayAmount: Number(e.target.value) })}/></Field><Field label="وحدة الانتظار"><select value={step.delayUnit || 'DAYS'} onChange={(e) => updateStep(index, { delayUnit: e.target.value as SequenceStep['delayUnit'] })}><option value="MINUTES">دقائق</option><option value="HOURS">ساعات</option><option value="DAYS">أيام</option></select></Field></div>}<Field label="عنوان الرسالة" required><input value={step.subject || ''} onChange={(e) => updateStep(index, { subject: e.target.value })} /></Field><Field label="نص الرسالة" required><textarea rows={7} value={step.bodyText || ''} onChange={(e) => updateStep(index, { bodyText: e.target.value, bodyHtml: e.target.value })} placeholder="مرحبًا {{first_name}}…" /></Field></div>{index > 0 && <Button type="button" variant="ghost" onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}><Trash2 size={15}/></Button>}</div>)}</Card>
      </div>
      <aside className="builder-side"><Card className="form-card"><h2>حسابات الإرسال</h2><p className="muted-line">يختار المحرك الحساب الأقل استخدامًا ويتجاوز الحساب المتعطل.</p>{healthy.length === 0 ? <Notice tone="warning">لا يوجد حساب سليم. أضف الحساب واختبره أولًا.</Notice> : <div className="check-list">{healthy.map((account) => <label key={account.id}><input type="checkbox" checked={mailboxIds.includes(account.id)} onChange={(e) => setMailboxIds((current) => e.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id))}/><span><b>{account.senderName}</b><small dir="ltr">{account.email}</small></span></label>)}</div>}</Card><Card className="form-card"><h2>موعد التشغيل</h2><Field label="طريقة الحفظ"><select value={launchMode} onChange={(e) => setLaunchMode(e.target.value as typeof launchMode)}><option value="DRAFT">حفظ كمسودة</option><option value="NOW">إرسال الآن</option><option value="LATER">جدولة لاحقًا</option></select></Field>{launchMode === 'LATER' && <Field label="التاريخ والوقت" required><input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}/></Field>}</Card><Button className="builder-submit" variant="primary" type="submit" loading={create.isPending} disabled={!mailboxIds.length || (launchMode === 'LATER' && !scheduledAt)}><Send size={16}/> {launchMode === 'DRAFT' ? 'حفظ المسودة' : 'تشغيل الحملة'}</Button></aside>
    </form>
  </>;
}

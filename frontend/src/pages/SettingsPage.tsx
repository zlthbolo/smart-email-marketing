import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { Button, Card, ErrorState, Field, LoadingState, PageHeader, StatusBadge } from '../components/ui';
import { api, getApiErrorMessage } from '../lib/api';
import type { AppSettings, SystemStatus } from '../types';
import { useToast } from '../components/Toast';

const defaults: AppSettings = {
  sending: { defaultDailyLimit: 40, delayBetweenMessagesSeconds: 30, retryMaxAttempts: 4, retryBaseDelaySeconds: 30 },
  tracking: { openTracking: true, clickTracking: false },
  leads: { dedupeMode: 'GLOBAL' },
};

export function SettingsPage() {
  const status = useQuery({
    queryKey: ['system-status'],
    queryFn: ({ signal }) => api.get<SystemStatus>('/system/status', signal).then((result) => result.data),
    refetchInterval: 30_000,
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => api.get<AppSettings>('/settings', signal).then((result) => result.data),
  });
  const [value, setValue] = useState(defaults);
  const [loaded, setLoaded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (settings.data && !loaded) {
      setValue({ ...defaults, ...settings.data });
      setLoaded(true);
    }
  }, [settings.data, loaded]);

  const save = useMutation({
    mutationFn: () => api.put<AppSettings>('/settings', value),
    onSuccess: ({ data }) => {
      setValue({ ...value, ...data });
      toast.push('تم حفظ الإعدادات', 'success');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => toast.push('تعذّر حفظ الإعدادات', 'error', getApiErrorMessage(error)),
  });
  const changePassword = useMutation({
    mutationFn: () => api.put('/auth/password', { currentPassword, newPassword }),
    onSuccess: () => { setCurrentPassword(''); setNewPassword(''); toast.push('تم تغيير كلمة المرور وإلغاء الجلسات الأخرى', 'success'); },
    onError: (error) => toast.push('تعذّر تغيير كلمة المرور', 'error', getApiErrorMessage(error)),
  });
  const submit = (event: FormEvent) => { event.preventDefault(); save.mutate(); };

  if (status.isPending || settings.isPending) return <><PageHeader title="الإعدادات"/><LoadingState rows={7}/></>;
  if (status.isError || settings.isError) return <><PageHeader title="الإعدادات"/><ErrorState error={status.error || settings.error} onRetry={() => { status.refetch(); settings.refetch(); }}/></>;

  return <>
    <PageHeader title="الإعدادات" description="الإرسال والتتبع والأمان وحالة النظام"/>
    <form className="settings-columns" onSubmit={submit}>
      <div className="builder-main">
        <Card className="form-card">
          <h2>الإرسال</h2>
          <div className="form-grid form-grid--2">
            <Field label="الحد اليومي الافتراضي"><input type="number" min={1} max={50000} value={value.sending.defaultDailyLimit} onChange={(event) => setValue((current) => ({ ...current, sending: { ...current.sending, defaultDailyLimit: Number(event.target.value) } }))}/></Field>
            <Field label="الفاصل بين الرسائل (ثانية)"><input type="number" min={0} max={86400} value={value.sending.delayBetweenMessagesSeconds} onChange={(event) => setValue((current) => ({ ...current, sending: { ...current.sending, delayBetweenMessagesSeconds: Number(event.target.value) } }))}/></Field>
            <Field label="عدد محاولات الإعادة"><input type="number" min={1} max={10} value={value.sending.retryMaxAttempts} onChange={(event) => setValue((current) => ({ ...current, sending: { ...current.sending, retryMaxAttempts: Number(event.target.value) } }))}/></Field>
            <Field label="بداية التراجع (ثانية)"><input type="number" min={1} max={86400} value={value.sending.retryBaseDelaySeconds} onChange={(event) => setValue((current) => ({ ...current, sending: { ...current.sending, retryBaseDelaySeconds: Number(event.target.value) } }))}/></Field>
          </div>
        </Card>
        <Card className="form-card">
          <h2>التتبع وجهات الاتصال</h2>
          <div className="check-list">
            <label><input type="checkbox" checked={value.tracking.openTracking} onChange={(event) => setValue((current) => ({ ...current, tracking: { ...current.tracking, openTracking: event.target.checked } }))}/><span><b>تتبع الفتح</b><small>يعتمد على بكسل قابل للقياس وقد تمنعه بعض تطبيقات البريد.</small></span></label>
            <label><input type="checkbox" checked={value.tracking.clickTracking} onChange={(event) => setValue((current) => ({ ...current, tracking: { ...current.tracking, clickTracking: event.target.checked } }))}/><span><b>تتبع النقر</b><small>يوقّع روابط التحويل ويقيس النقرات الفعلية.</small></span></label>
          </div>
          <Field label="منع التكرار"><select value="GLOBAL" disabled><option value="GLOBAL">حسب البريد في النظام كله</option></select></Field>
        </Card>
        <Button type="submit" variant="primary" loading={save.isPending}>حفظ الإعدادات</Button>
      </div>
      <div className="builder-main">
        <Card className="form-card">
          <h2>حالة النظام</h2>
          <div className="settings-status-row"><span>قاعدة البيانات</span><StatusBadge status={status.data.database.status}/></div>
          <div className="settings-status-row"><span>قائمة الانتظار</span><StatusBadge status={status.data.queue.status}/></div>
          <div className="settings-status-row"><span>عامل الإرسال</span><StatusBadge status={status.data.worker.status}/></div>
          <div className="settings-status-row"><span>الإصدار</span><b>{status.data.version}</b></div>
        </Card>
        <Card className="form-card"><h2>الأمان</h2><p>مالك واحد فقط. لا تسجيل عام ولا فرق ولا خطط أو فواتير.</p><p>كل أسرار البريد مخزنة بتشفير AES-GCM ولا تُعرض بعد الحفظ.</p></Card>
        <Card className="form-card"><h2>تغيير كلمة مرور المالك</h2><div className="form-stack"><Field label="كلمة المرور الحالية"><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}/></Field><Field label="كلمة المرور الجديدة" hint="12 حرفًا على الأقل"><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/></Field><Button type="button" loading={changePassword.isPending} disabled={!currentPassword || newPassword.length < 12} onClick={() => changePassword.mutate()}>تغيير كلمة المرور</Button></div></Card>
      </div>
    </form>
  </>;
}

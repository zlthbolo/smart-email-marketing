import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '../components/AppShell';
import { Button, Field, Notice } from '../components/ui';
import { api, getApiErrorMessage } from '../lib/api';
import type { AdminProfile } from '../types';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const existingSession = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<AdminProfile>('/auth/me').then((result) => result.data),
    retry: false,
    enabled: queryClient.getQueryData(['auth', 'me']) !== undefined,
  });
  const login = useMutation({
    mutationFn: () => api.post<{ user: { id: string; email: string; display_name?: string } }>('/auth/login', { email: email.trim(), password }),
    onSuccess: ({ data }) => {
      queryClient.setQueryData(['auth', 'me'], { id: data.user.id, email: data.user.email, name: data.user.display_name });
      const destination = (location.state as { from?: string } | null)?.from || '/';
      navigate(destination, { replace: true });
    },
  });

  const emailError = submitted && !/^\S+@\S+\.\S+$/.test(email) ? 'أدخل بريد المدير الصحيح' : '';
  const passwordError = submitted && password.length < 8 ? 'كلمة المرور مطلوبة (8 أحرف على الأقل)' : '';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!emailError && !passwordError && /^\S+@\S+\.\S+$/.test(email) && password.length >= 8) login.mutate();
  };

  if (existingSession.isSuccess) return <Navigate to="/" replace />;

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-panel__brand"><BrandMark /></div>
        <div className="login-panel__copy">
          <span className="eyebrow"><ShieldCheck size={17} /> دخول المالك فقط</span>
          <h1>كل حملاتك.<br />من مكان واحد.</h1>
          <p>إدارة حسابات الإرسال، التسلسل، الردود والنتائج في مساحة خاصة وآمنة.</p>
        </div>
        <div className="login-orbit" aria-hidden="true">
          <div className="login-orbit__core"><Mail size={31} /></div>
          <span className="login-orbit__node login-orbit__node--one" />
          <span className="login-orbit__node login-orbit__node--two" />
          <span className="login-orbit__node login-orbit__node--three" />
        </div>
        <p className="login-panel__foot">منصة شخصية · لا تسجيل عام · لا حسابات عملاء</p>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-form__icon"><LockKeyhole size={24} /></div>
          <h2>مرحبًا بعودتك</h2>
          <p>سجّل الدخول إلى لوحة جريد سوفت</p>
          {login.isError && <Notice tone="danger"><b>تعذّر تسجيل الدخول</b><p>{getApiErrorMessage(login.error)}</p></Notice>}
          <Field label="البريد الإلكتروني" required error={emailError}>
            <div className="input-with-icon"><Mail size={17} /><input aria-label="البريد الإلكتروني" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" /></div>
          </Field>
          <Field label="كلمة المرور" required error={passwordError}>
            <div className="input-with-icon"><LockKeyhole size={17} /><input aria-label="كلمة المرور" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          </Field>
          <Button type="submit" variant="primary" loading={login.isPending} className="login-submit">دخول آمن</Button>
          <p className="login-form__security"><ShieldCheck size={15} /> جلسة مشفّرة وآمنة عبر HTTP-only cookie</p>
        </form>
      </section>
    </main>
  );
}

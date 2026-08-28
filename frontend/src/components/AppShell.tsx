import {
  Activity,
  BarChart3,
  BookOpenCheck,
  ChevronLeft,
  CircleHelp,
  FileClock,
  Gauge,
  Inbox,
  ListFilter,
  LogOut,
  MailPlus,
  Menu,
  Plus,
  Send,
  Settings,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getApiErrorMessage } from '../lib/api';
import { IconButton } from './ui';
import { useToast } from './Toast';

const navigation = [
  { to: '/', label: 'لوحة التحكم', icon: Gauge, end: true },
  { to: '/campaigns', label: 'الحملات', icon: Send },
  { to: '/email-accounts', label: 'حسابات الإرسال', icon: MailPlus },
  { to: '/leads', label: 'جهات الاتصال', icon: UsersRound },
  { to: '/inbox', label: 'البريد الوارد', icon: Inbox },
  { to: '/analytics', label: 'التحليلات', icon: BarChart3 },
  { to: '/logs', label: 'سجل العمليات', icon: FileClock },
  { to: '/settings', label: 'الإعدادات', icon: Settings },
];

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <span className="brand__mark" aria-hidden="true"><span /><span /><span /></span>
      {!compact && <span className="brand__text"><b>جريد</b><small>إدارة البريد الذكية</small></span>}
    </div>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const system = useQuery({ queryKey: ['system-status', 'shell'], queryFn: ({ signal }) => api.get<{ worker: { status: string }; queue: { status: string } }>('/system/status', signal).then((result) => result.data), refetchInterval: 30_000, retry: false });
  const engineReady = system.data?.worker.status === 'HEALTHY' && system.data?.queue.status === 'HEALTHY';
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    },
    onError: (error) => toast.push('تعذّر تسجيل الخروج', 'error', getApiErrorMessage(error)),
  });

  const nav = (
    <>
      <div className="sidebar__brand"><Link to="/" onClick={() => setMobileOpen(false)}><BrandMark compact={collapsed} /></Link></div>
      <nav className="sidebar__nav" aria-label="التنقل الرئيسي">
        <p className="sidebar__label">{collapsed ? '•' : 'مساحة العمل'}</p>
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)}>
            <Icon size={19} aria-hidden="true" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar__footer">
        {!collapsed && (
          <div className="system-hint"><Activity size={16} /><span><b>تشغيل خاص</b><small>مالك واحد فقط</small></span></div>
        )}
        <button className="sidebar__logout" onClick={() => logout.mutate()} disabled={logout.isPending} title="تسجيل الخروج">
          <LogOut size={18} />{!collapsed && <span>تسجيل الخروج</span>}
        </button>
      </div>
      <button className="sidebar__collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}>
        <ChevronLeft size={16} />
      </button>
    </>
  );

  return (
    <div className={`app-layout ${collapsed ? 'app-layout--collapsed' : ''}`}>
      <aside className="sidebar">{nav}</aside>
      {mobileOpen && <div className="mobile-nav-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className={`mobile-nav ${mobileOpen ? 'is-open' : ''}`} aria-hidden={!mobileOpen}>
        <IconButton label="إغلاق القائمة" className="mobile-nav__close" onClick={() => setMobileOpen(false)}><X size={20} /></IconButton>
        {nav}
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar__start">
            <IconButton label="فتح القائمة" className="topbar__menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></IconButton>
            <div className="topbar__status"><span className={`pulse-dot ${engineReady ? '' : 'pulse-dot--warning'}`} /><span>نظام الإرسال</span><b>{system.isPending ? 'جارٍ الفحص' : engineReady ? 'جاهز' : 'يحتاج فحصًا'}</b></div>
          </div>
          <div className="topbar__actions">
            <Link className="button button--primary topbar__create" to="/campaigns/new"><Plus size={17} /> <span>حملة جديدة</span></Link>
            <Link className="icon-button" to="/logs" aria-label="سجل العمليات"><ListFilter size={19} /></Link>
            <Link className="icon-button" to="/settings" aria-label="مركز المساعدة"><CircleHelp size={19} /></Link>
            <div className="owner-chip"><UserRound size={17} /><span><b>المالك</b><small>مدير النظام</small></span></div>
          </div>
        </header>
        <main className="page-container"><Outlet /></main>
        <footer className="app-footer"><BookOpenCheck size={15} /> جريد سوفت · منصة خاصة لإدارة الإرسال</footer>
      </div>
    </div>
  );
}

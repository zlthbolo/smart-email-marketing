import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCheck,
  CirclePause,
  Clock3,
  Eye,
  MailCheck,
  MailWarning,
  MessageCircleReply,
  MousePointerClick,
  Plus,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui';
import { api, queryString } from '../lib/api';
import { formatCompact, formatDate, formatNumber, formatPercent } from '../lib/format';
import type { DashboardData } from '../types';

const rangeOptions = [
  { value: '7', label: 'آخر 7 أيام' },
  { value: '30', label: 'آخر 30 يومًا' },
  { value: '90', label: 'آخر 90 يومًا' },
];

function getRange(days: string) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - Number(days) + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function DashboardPage() {
  const days = '30';
  const range = getRange(days);
  const dashboard = useQuery({
    queryKey: ['dashboard', range.from.slice(0, 10), range.to.slice(0, 10)],
    queryFn: ({ signal }) => api.get<DashboardData>(`/dashboard${queryString({ ...range, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}`, signal).then((result) => result.data),
    refetchInterval: 30_000,
  });

  if (dashboard.isPending) return <><PageHeader title="لوحة التحكم" description="ملخص حي لأداء الإرسال" /><LoadingState rows={7} /></>;
  if (dashboard.isError) return <><PageHeader title="لوحة التحكم" /><ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} /></>;
  const data = dashboard.data;
  const hasActivity = (data.dailySeries || []).some((point) => (point.sent || 0) + (point.replies || 0) + (point.bounced || 0) > 0);

  const primaryMetrics = [
    { label: 'إجمالي المرسل', value: data.sent, icon: Send, tone: 'teal', sub: `${formatPercent(data.delivered, data.sent)} تسليم` },
    { label: 'تم التسليم', value: data.delivered, icon: MailCheck, tone: 'green', sub: 'مؤكد من المزود' },
    { label: 'الردود', value: data.replies, icon: MessageCircleReply, tone: 'violet', sub: `${formatNumber(data.positiveReplies)} رد إيجابي` },
    { label: 'المرتد', value: data.bounced, icon: MailWarning, tone: 'orange', sub: `${formatPercent(data.bounced, data.sent)} من المرسل` },
  ];
  const secondaryMetrics = [
    { label: 'الفتح', value: data.opened, icon: Eye },
    { label: 'النقرات', value: data.clicked, icon: MousePointerClick },
    { label: 'فشل', value: data.failed, icon: AlertTriangle },
    { label: 'إلغاء الاشتراك', value: data.unsubscribed, icon: Ban },
  ];

  return (
    <>
      <PageHeader
        title="لوحة التحكم"
        description={`آخر تحديث ${new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`}
        actions={<><select className="compact-select" aria-label="النطاق الزمني" defaultValue={days}>{rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Link className="button button--primary" to="/campaigns/new"><Plus size={17} /> حملة جديدة</Link></>}
      />

      <section className="metric-grid metric-grid--primary" aria-label="مؤشرات الأداء الرئيسية">
        {primaryMetrics.map(({ label, value, icon: Icon, tone, sub }) => (
          <Card className={`metric-card metric-card--${tone}`} key={label}>
            <div className="metric-card__top"><span className="metric-card__icon"><Icon size={19} /></span><span className="metric-card__trend">البيانات الفعلية</span></div>
            <strong>{formatCompact(value)}</strong><p>{label}</p><small>{sub}</small>
          </Card>
        ))}
      </section>

      <section className="dashboard-main-grid">
        <Card className="chart-card">
          <div className="card-heading"><div><h2>نشاط الإرسال</h2><p>الإرسال والتسليم والردود يوميًا</p></div><div className="chart-legend"><span className="legend--sent">المرسل</span><span className="legend--delivered">المسلّم</span><span className="legend--replies">الردود</span></div></div>
          {!hasActivity ? (
            <EmptyState title="لا يوجد نشاط خلال هذه الفترة" description="ستظهر نتائج الإرسال هنا فور تشغيل أول حملة." action={<Link className="button button--secondary" to="/campaigns/new">إنشاء حملة</Link>} />
          ) : (
            <div className="chart-wrap" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailySeries} margin={{ top: 12, right: 8, left: -24, bottom: 2 }}>
                  <defs><linearGradient id="sentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0f766e" stopOpacity={0.2}/><stop offset="95%" stopColor="#0f766e" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 5" stroke="#e6e9ef" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(value) => new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short' }).format(new Date(value))} axisLine={false} tickLine={false} tick={{ fill: '#7a8493', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7a8493', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e3e7ec', boxShadow: '0 12px 30px rgba(19,32,51,.12)', direction: 'rtl' }} labelFormatter={(value) => formatDate(String(value), false)} />
                  <Area type="monotone" dataKey="sent" name="المرسل" stroke="#0f766e" strokeWidth={2.5} fill="url(#sentFill)" />
                  <Line type="monotone" dataKey="delivered" name="المسلّم" stroke="#35a677" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="replies" name="الردود" stroke="#7c6ee6" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <div className="dashboard-side-stack">
          <Card className="campaign-summary">
            <div className="card-heading"><div><h2>الحملات</h2><p>الحالة الحالية</p></div><Link to="/campaigns">عرض الكل <ArrowLeft size={14} /></Link></div>
            <div className="campaign-summary__total"><span><Send size={19} /></span><div><strong>{formatNumber(data.campaigns.total)}</strong><small>إجمالي الحملات</small></div></div>
            <div className="campaign-summary__row"><span><CheckCheck size={16} /> نشطة</span><b>{formatNumber(data.campaigns.active)}</b></div>
            <div className="campaign-summary__row"><span><CirclePause size={16} /> متوقفة</span><b>{formatNumber(data.campaigns.paused)}</b></div>
          </Card>
          <Card className="system-card">
            <div className="card-heading"><div><h2>المحرك والطابور</h2><p>تحديث آلي كل 30 ثانية</p></div><StatusBadge status={data.worker?.status || 'UNKNOWN'} /></div>
            <div className="system-stats"><span><Clock3 size={18} /><b>{formatNumber(data.scheduledToday)}</b><small>مجدولة اليوم</small></span><span><Activity size={18} /><b>{formatNumber(data.queueSize)}</b><small>في الطابور</small></span></div>
            {data.worker?.lastHeartbeatAt && <p className="muted-line">آخر نبضة: {formatDate(data.worker.lastHeartbeatAt)}</p>}
          </Card>
        </div>
      </section>

      <section className="metric-strip">
        {secondaryMetrics.map(({ label, value, icon: Icon }) => <Card key={label}><Icon size={18} /><span>{label}</span><strong>{formatNumber(value)}</strong></Card>)}
      </section>

      <section className="sender-health-row">
        <Card className="sender-health-card">
          <div className="sender-health-card__title"><span><Users size={19} /></span><div><h2>حسابات الإرسال</h2><p>صحة الحسابات المستخدمة في الحملات</p></div></div>
          <div className="sender-health-card__metrics"><span><b>{formatNumber(data.senderAccounts.total)}</b><small>الإجمالي</small></span><span className="text-success"><ShieldCheck size={17} /><b>{formatNumber(data.senderAccounts.healthy)}</b><small>سليم</small></span><span className="text-danger"><AlertTriangle size={17} /><b>{formatNumber(data.senderAccounts.problem)}</b><small>بحاجة لتدخل</small></span></div>
          <Link className="button button--secondary" to="/email-accounts">إدارة الحسابات <ArrowLeft size={15} /></Link>
        </Card>
      </section>
    </>
  );
}

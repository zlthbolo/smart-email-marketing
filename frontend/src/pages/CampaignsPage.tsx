import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePause, CirclePlay, Plus, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { extractList } from '../lib/data';
import { formatDate, formatNumber } from '../lib/format';
import type { Campaign } from '../types';
import { useToast } from '../components/Toast';
import { getApiErrorMessage } from '../lib/api';

export function CampaignsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ['campaigns'], queryFn: ({ signal }) => api.get<Campaign[]>('/campaigns', signal) });
  const campaigns = extractList(query.data?.data);
  const action = useMutation({
    mutationFn: ({ campaign, name }: { campaign: Campaign; name: 'schedule' | 'pause' | 'resume' }) => api.post(`/campaigns/${campaign.id}/${name}`, name === 'schedule' ? { scheduledAt: new Date().toISOString() } : undefined),
    onSuccess: () => { toast.push('تم تحديث الحملة', 'success'); queryClient.invalidateQueries({ queryKey: ['campaigns'] }); },
    onError: (error) => toast.push('تعذّر تحديث الحملة', 'error', getApiErrorMessage(error)),
  });
  return <>
    <PageHeader title="الحملات" description="أنشئ الحملات وتابع حالتها والمرسلين المرتبطين بها" actions={<Link className="button button--primary" to="/campaigns/new"><Plus size={17}/> حملة جديدة</Link>} />
    <Card className="table-card">
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : campaigns.length === 0 ? <EmptyState icon={<Send size={28}/>} title="لا توجد حملات" description="ابدأ بحملة جديدة، أضف المرسلين والجمهور ثم راجع الجاهزية قبل الإطلاق." action={<Link className="button button--primary" to="/campaigns/new">إنشاء حملة</Link>} /> : <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>الحملة</th><th>الحالة</th><th>الجمهور</th><th>المرسلون</th><th>آخر تحديث</th><th/></tr></thead><tbody>{campaigns.map((campaign) => { const status = campaign.status.toLowerCase(); const actionName = status === 'draft' || status === 'failed' ? 'schedule' : status === 'paused' ? 'resume' : ['scheduled','running'].includes(status) ? 'pause' : null; return <tr key={campaign.id}><td data-label="الحملة"><b>{campaign.name}</b><small>{campaign.description || '—'}</small></td><td data-label="الحالة"><StatusBadge status={campaign.status}/></td><td data-label="الجمهور">{formatNumber(campaign.leadCount || 0)}</td><td data-label="المرسلون">{formatNumber(campaign.senderCount || 0)}</td><td data-label="آخر تحديث">{formatDate(campaign.updatedAt || campaign.createdAt)}</td><td><div className="toolbar-group">{actionName && <Button onClick={() => action.mutate({ campaign, name: actionName })} loading={action.isPending && action.variables?.campaign.id === campaign.id}>{actionName === 'pause' ? <CirclePause size={15}/> : <CirclePlay size={15}/>} {actionName === 'pause' ? 'إيقاف' : actionName === 'resume' ? 'استئناف' : 'تشغيل'}</Button>}<Link className="button button--ghost" to={`/campaigns/${campaign.id}/edit`}>فتح</Link></div></td></tr>; })}</tbody></table></div>}
    </Card>
  </>;
}

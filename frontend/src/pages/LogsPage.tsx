import { useQuery } from '@tanstack/react-query';
import { FileClock } from 'lucide-react';
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { extractList } from '../lib/data';
import { formatDate } from '../lib/format';
import type { LogEntry } from '../types';

export function LogsPage() {
  const query = useQuery({ queryKey: ['logs'], queryFn: ({ signal }) => api.get<LogEntry[]>('/logs', signal) });
  const logs = extractList(query.data?.data);
  return <><PageHeader title="سجل العمليات" description="سبب كل نجاح أو فشل ظاهر من الواجهة"/><Card className="table-card">{query.isPending ? <LoadingState/> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()}/> : !logs.length ? <EmptyState icon={<FileClock size={28}/>} title="السجل فارغ" description="ستظهر محاولات الإرسال والاختبارات هنا."/> : <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>الوقت</th><th>الحملة</th><th>المرسل</th><th>المزود</th><th>الحالة</th><th>الخطأ</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{formatDate(log.startedAt)}</td><td>{log.campaign?.name || '—'}</td><td dir="ltr">{log.sender?.email || '—'}</td><td>{log.provider || '—'}</td><td><StatusBadge status={log.status}/></td><td>{log.errorCode || log.errorDetails || '—'}</td></tr>)}</tbody></table></div>}</Card></>;
}

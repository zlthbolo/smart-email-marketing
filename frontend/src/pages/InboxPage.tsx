import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Send } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, SearchInput, StatusBadge } from '../components/ui';
import { api, getApiErrorMessage, queryString } from '../lib/api';
import { extractList } from '../lib/data';
import { formatDate } from '../lib/format';
import type { InboxCategory, InboxThread, ThreadDetail } from '../types';
import { useToast } from '../components/Toast';

const categories: Array<{ value: InboxCategory; label: string }> = [
  { value: 'INTERESTED', label: 'مهتم' }, { value: 'NOT_INTERESTED', label: 'غير مهتم' },
  { value: 'QUESTION', label: 'سؤال' }, { value: 'OUT_OF_OFFICE', label: 'خارج المكتب' },
  { value: 'UNSUBSCRIBE', label: 'إلغاء اشتراك' }, { value: 'OTHER', label: 'أخرى' },
];

export function InboxPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [reply, setReply] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ['inbox', search], queryFn: ({ signal }) => api.get<InboxThread[]>(`/inbox/threads${queryString({ search })}`, signal) });
  const threads = extractList(query.data?.data);
  const detail = useQuery({ queryKey: ['inbox-thread', selectedId], enabled: Boolean(selectedId), queryFn: ({ signal }) => api.get<ThreadDetail>(`/inbox/threads/${selectedId}`, signal).then((result) => result.data) });
  const classify = useMutation({ mutationFn: (category: InboxCategory) => api.patch(`/inbox/threads/${selectedId}`, { category, isRead: true }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inbox'] }); queryClient.invalidateQueries({ queryKey: ['inbox-thread', selectedId] }); }, onError: (error) => toast.push('تعذّر تحديث التصنيف', 'error', getApiErrorMessage(error)) });
  const sendReply = useMutation({ mutationFn: () => api.post(`/inbox/threads/${selectedId}/reply`, { bodyText: reply }), onSuccess: () => { setReply(''); toast.push('أرسل المزود الرد فعليًا', 'success'); queryClient.invalidateQueries({ queryKey: ['inbox-thread', selectedId] }); queryClient.invalidateQueries({ queryKey: ['inbox'] }); }, onError: (error) => toast.push('تعذّر إرسال الرد', 'error', getApiErrorMessage(error)) });
  const submit = (event: FormEvent) => { event.preventDefault(); if (reply.trim()) sendReply.mutate(); };

  return <><PageHeader title="البريد الوارد" description="كل ردود الحملات من جميع حسابات الإرسال"/><Card className="inbox-shell"><div className="inbox-list-pane"><div className="table-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="بحث في الردود…"/></div>{query.isPending ? <LoadingState/> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()}/> : !threads.length ? <EmptyState icon={<Inbox size={28}/>} title="لا توجد ردود" description="ستظهر المحادثات هنا عند وصول أول رد قابل للقياس."/> : threads.map((thread) => <button className={`thread-row ${selectedId === thread.id ? 'is-active' : ''}`} key={thread.id} onClick={() => setSelectedId(thread.id)}><span className="avatar">{thread.lead.firstName?.[0] || '@'}</span><span><b>{thread.lead.firstName || thread.lead.email}</b><small>{thread.subject}</small><em>{thread.snippet}</em></span><span><StatusBadge status={thread.category}/><small>{formatDate(thread.lastMessageAt)}</small></span></button>)}</div>{!selectedId ? <div className="inbox-empty-pane"><Inbox size={35}/><h2>اختر محادثة</h2><p>ستظهر الرسائل والرد من الحساب الأصلي هنا.</p></div> : detail.isPending ? <div className="inbox-detail"><LoadingState rows={5}/></div> : detail.isError ? <div className="inbox-detail"><ErrorState error={detail.error} onRetry={() => detail.refetch()}/></div> : <div className="inbox-detail"><header className="inbox-detail__header"><div><h2>{detail.data.subject}</h2><p>{detail.data.lead.email} · {detail.data.senderAccount.email}</p></div><select aria-label="تصنيف المحادثة" value={detail.data.category} onChange={(event) => classify.mutate(event.target.value as InboxCategory)}>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></header><div className="message-list">{detail.data.messages.map((message) => <article key={message.id} className={`message-bubble message-bubble--${message.direction.toLowerCase()}`}><div><b>{message.direction === 'INBOUND' ? detail.data.lead.email : detail.data.senderAccount.email}</b><small>{formatDate(message.sentAt)}</small></div><p>{message.bodyText || 'لا يوجد نص قابل للعرض.'}</p>{message.status && <StatusBadge status={message.status}/>}</article>)}</div><form className="reply-box" onSubmit={submit}><textarea rows={4} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="اكتب ردك…" aria-label="نص الرد"/><Button type="submit" variant="primary" loading={sendReply.isPending} disabled={!reply.trim()}><Send size={16}/> إرسال من الحساب الأصلي</Button></form></div>}</Card></>;
}

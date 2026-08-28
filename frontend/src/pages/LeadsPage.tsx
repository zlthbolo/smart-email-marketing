import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, UsersRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, SearchInput, StatusBadge } from '../components/ui';
import { api, getApiErrorMessage, queryString } from '../lib/api';
import { extractList } from '../lib/data';
import type { Lead } from '../types';
import { useToast } from '../components/Toast';

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(value.trim()); value = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ''; continue; }
    value += char;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.toLowerCase().trim().replace(/\s+/g, '_'));
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
}

export function LeadsPage() {
  const [search, setSearch] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['leads', search], queryFn: ({ signal }) => api.get<Lead[]>(`/leads${queryString({ search })}`, signal) });
  const leads = extractList(query.data?.data);
  const importCsv = useMutation({ mutationFn: async (file: File) => { const parsed = parseCsv(await file.text()); if (!parsed.length) throw new Error('ملف CSV فارغ أو لا يحتوي صفوفًا صالحة.'); const contacts = parsed.map((item) => ({ email: item.email, firstName: item.first_name || item.firstname, lastName: item.last_name || item.lastname, university: item.university, specialization: item.major || item.specialization, attributes: { company: item.company || undefined, ...item }, consentBasis: 'legitimate_interest', consentSource: `CSV: ${file.name}`, consentGrantedAt: new Date().toISOString() })); return api.post<{ imported: number }>('/contacts/import', { contacts }); }, onSuccess: ({ data }) => { toast.push(`تم استيراد ${data.imported} جهة اتصال`, 'success'); queryClient.invalidateQueries({ queryKey: ['leads'] }); }, onError: (error) => toast.push('تعذّر استيراد CSV', 'error', getApiErrorMessage(error)) });
  return <><PageHeader title="جهات الاتصال" description="استيراد وفرز وإدارة جمهور الحملات" actions={<><input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) importCsv.mutate(file); event.target.value = ''; }}/><Button variant="primary" loading={importCsv.isPending} onClick={() => fileInput.current?.click()}><Upload size={16}/> استيراد CSV</Button></>} /><Card className="table-card"><div className="table-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="بحث بالبريد أو الجامعة أو الشركة…"/></div>{query.isPending ? <LoadingState/> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()}/> : !leads.length ? <EmptyState icon={<UsersRound size={28}/>} title="لا توجد جهات اتصال" description="استورد ملف CSV أو أضف الجهات يدويًا."/> : <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>البريد</th><th>الاسم</th><th>الجامعة / التخصص</th><th>الشركة</th><th>الحالة</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td dir="ltr">{lead.email}</td><td>{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || '—'}</td><td>{lead.university || '—'}<small>{lead.major || ''}</small></td><td>{lead.company || '—'}</td><td><StatusBadge status={lead.status}/></td></tr>)}</tbody></table></div>}</Card></>;
}

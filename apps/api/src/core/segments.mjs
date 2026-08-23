import { AppError } from './errors.mjs';

export function buildContactFilter(tenantId, definition = {}) {
  const values=[tenantId]; const clauses=['tenant_id=$1','consent_revoked_at is null'];
  for(const [key,column] of [['university','university'],['specialization','specialization']]) if(definition[key]){values.push(String(definition[key]).trim());clauses.push(`${column}=$${values.length}`)}
  if(Array.isArray(definition.contactIds)&&definition.contactIds.length){if(definition.contactIds.length>5000)throw new AppError('SEGMENT_TOO_LARGE','A segment may contain at most 5000 explicit contacts',400);values.push(definition.contactIds);clauses.push(`id=any($${values.length}::uuid[])`)}
  if(definition.query){values.push(`%${String(definition.query).trim()}%`);clauses.push(`(email ilike $${values.length} or coalesce(first_name,'') ilike $${values.length} or coalesce(last_name,'') ilike $${values.length})`)}
  return {where:clauses.join(' and '),values};
}

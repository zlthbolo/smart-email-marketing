import { loadConfig } from './core/config.mjs';
import { createDatabase } from './core/db.mjs';
import { hashPassword } from './core/passwords.mjs';
import { requireEmail, requireText } from './core/validation.mjs';

const config = loadConfig();
const db = createDatabase(config.databaseUrl);
const email = requireEmail(process.env.OWNER_EMAIL);
const password = requireText(process.env.OWNER_PASSWORD, 'OWNER_PASSWORD', { min: 12, max: 1000 });
const displayName = requireText(process.env.OWNER_DISPLAY_NAME || 'المالك', 'OWNER_DISPLAY_NAME', { max: 120 });
const passwordHash = await hashPassword(password);
const client = await db.connect();

try {
  await client.query('begin');
  await client.query('lock table users in exclusive mode');
  const users = (await client.query('select id,tenant_id,email from users order by created_at')).rows;
  if (users.length > 1) throw new Error('Single-owner bootstrap refused: more than one user already exists');
  if (users.length === 0) {
    const tenant = (await client.query("insert into tenants (name) values ('جريد سوفت') returning id")).rows[0];
    await client.query(`insert into users (tenant_id,email,role,display_name,password_hash)
      values ($1,$2,'owner',$3,$4)`, [tenant.id, email, displayName, passwordHash]);
    await client.query('insert into app_settings (tenant_id) values ($1) on conflict (tenant_id) do nothing', [tenant.id]);
    console.log(JSON.stringify({ ok: true, action: 'owner_created', email }));
  } else {
    await client.query(`update users set email=$2,display_name=$3,password_hash=$4,role='owner',updated_at=now()
      where id=$1`, [users[0].id, email, displayName, passwordHash]);
    await client.query('delete from sessions where user_id=$1', [users[0].id]);
    console.log(JSON.stringify({ ok: true, action: 'owner_updated', email }));
  }
  await client.query('commit');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
} finally {
  client.release();
  await db.close();
}

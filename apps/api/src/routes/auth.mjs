import { Router } from 'express';
import { AppError } from '../core/errors.mjs';
import { hashPassword, verifyPassword } from '../core/passwords.mjs';
import { createSession, revokeSession } from '../core/sessions.mjs';
import { requireEmail, requireText } from '../core/validation.mjs';

export function createAuthRouter({ db, auth }) {
  const router = Router();

  router.post('/register', async (req, res, next) => {
    const client = await db.connect();
    try {
      const email = requireEmail(req.body.email);
      const passwordHash = await hashPassword(req.body.password);
      const workspaceName = requireText(req.body.workspaceName || 'جريد سوفت', 'workspaceName', { max: 120 });
      const displayName = requireText(req.body.displayName || email.split('@')[0], 'displayName', { max: 120 });
      await client.query('begin');
      if ((await client.query('select 1 from users where email=$1 limit 1', [email])).rowCount) throw new AppError('EMAIL_EXISTS', 'Email is already registered', 409);
      const tenant = (await client.query('insert into tenants (name) values ($1) returning id,name', [workspaceName])).rows[0];
      const user = (await client.query(`insert into users (tenant_id,email,role,display_name,password_hash) values ($1,$2,'owner',$3,$4)
        returning id,tenant_id,email,display_name,role`, [tenant.id, email, displayName, passwordHash])).rows[0];
      await client.query('commit');
      const session = await createSession(db, user.id);
      res.status(201).json({ ok: true, data: { user, tenant, ...session } });
    } catch (error) { await client.query('rollback').catch(() => {}); next(error); }
    finally { client.release(); }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const email = requireEmail(req.body.email);
      const { rows } = await db.query('select id,tenant_id,email,display_name,role,password_hash from users where email=$1 limit 1', [email]);
      if (!rows[0] || !(await verifyPassword(req.body.password, rows[0].password_hash))) throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect', 401);
      const session = await createSession(db, rows[0].id);
      const { password_hash, ...user } = rows[0];
      res.json({ ok: true, data: { user, ...session } });
    } catch (error) { next(error); }
  });

  router.get('/me', auth, (req, res) => res.json({ ok: true, data: req.auth }));
  router.post('/logout', auth, async (req, res, next) => { try { await revokeSession(db, req.auth.session_id); res.json({ ok: true }); } catch (error) { next(error); } });
  return router;
}

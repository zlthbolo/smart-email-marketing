import { Router } from 'express';
import { AppError } from '../core/errors.mjs';
import { hashPassword, verifyPassword } from '../core/passwords.mjs';
import { createSession, revokeSession, SESSION_COOKIE } from '../core/sessions.mjs';
import { requireEmail, requireText } from '../core/validation.mjs';

export function createAuthRouter({ db, auth }) {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const email = requireEmail(req.body.email);
      const { rows } = await db.query('select id,tenant_id,email,display_name,role,password_hash from users where email=$1 limit 1', [email]);
      if (!rows[0] || !(await verifyPassword(req.body.password, rows[0].password_hash))) throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect', 401);
      const session = await createSession(db, rows[0].id);
      const { password_hash, ...user } = rows[0];
      res.cookie(SESSION_COOKIE, session.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: req.secure || req.header('x-forwarded-proto') === 'https',
        path: '/',
        expires: new Date(session.expiresAt)
      });
      res.json({ ok: true, data: { user, ...session } });
    } catch (error) { next(error); }
  });

  router.get('/me', auth, (req, res) => res.json({ ok: true, data: { ...req.auth, id: req.auth.user_id, name: req.auth.display_name } }));
  router.put('/password', auth, async (req, res, next) => {
    try {
      const current = requireText(req.body.currentPassword, 'currentPassword', { min: 1, max: 1000 });
      const nextPassword = requireText(req.body.newPassword, 'newPassword', { min: 12, max: 1000 });
      const user = (await db.query('select password_hash from users where id=$1', [req.auth.user_id])).rows[0];
      if (!user || !(await verifyPassword(current, user.password_hash))) throw new AppError('CURRENT_PASSWORD_INVALID', 'كلمة المرور الحالية غير صحيحة.', 401);
      await db.query('update users set password_hash=$2,updated_at=now() where id=$1', [req.auth.user_id, await hashPassword(nextPassword)]);
      await db.query('delete from sessions where user_id=$1 and id<>$2', [req.auth.user_id, req.auth.session_id]);
      res.json({ ok: true, data: { changed: true } });
    } catch (error) { next(error); }
  });
  router.post('/logout', auth, async (req, res, next) => { try { await revokeSession(db, req.auth.session_id); res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' }); res.json({ ok: true }); } catch (error) { next(error); } });
  return router;
}

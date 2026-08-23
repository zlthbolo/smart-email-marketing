import { Router } from 'express';
import { AppError } from '../core/errors.mjs';

export function createMailboxRouter({ db, providerResolver }) {
  const router = Router();
  router.post('/:id/verify', async (req, res, next) => {
    try {
      const { rows } = await db.query('select id, tenant_id, provider, status from mailboxes where id = $1', [req.params.id]);
      if (!rows[0]) throw new AppError('MAILBOX_NOT_FOUND', 'Mailbox not found', 404);
      const provider = await providerResolver(rows[0]);
      const result = await provider.verify();
      await db.query("update mailboxes set status = 'healthy', verified_at = now(), last_error = null, updated_at = now() where id = $1", [rows[0].id]);
      res.json({ ok: true, data: result });
    } catch (error) {
      await db.query("update mailboxes set status = 'unhealthy', last_error = $2, updated_at = now() where id = $1", [req.params.id, error.message]).catch(() => {});
      next(error);
    }
  });
  return router;
}

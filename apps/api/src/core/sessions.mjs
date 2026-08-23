import { createHash, randomBytes } from 'node:crypto';
import { AppError } from './errors.mjs';

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export async function createSession(db, userId, days = 30) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + days * 86400000);
  await db.query('insert into sessions (user_id, token_hash, expires_at) values ($1,$2,$3)', [userId, tokenHash(token), expiresAt]);
  return { token, expiresAt: expiresAt.toISOString() };
}

export function createAuthMiddleware(db) {
  return async (req, _res, next) => {
    try {
      const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      const { rows } = await db.query(`select s.id session_id, s.expires_at, u.id user_id, u.tenant_id, u.email, u.display_name, u.role
        from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now()`, [tokenHash(token)]);
      if (!rows[0]) throw new AppError('SESSION_INVALID', 'Session is invalid or expired', 401);
      req.auth = rows[0];
      await db.query('update sessions set last_seen_at=now() where id=$1', [rows[0].session_id]);
      next();
    } catch (error) { next(error); }
  };
}

export async function revokeSession(db, sessionId) { await db.query('delete from sessions where id=$1', [sessionId]); }

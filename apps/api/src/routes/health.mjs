export function createHealthHandler({ db, redis, providers = [] }) {
  return async (_req, res) => {
    const checkedAt = new Date().toISOString();
    const checks = {};
    for (const [name, probe] of [['postgres', () => db.health()], ['redis', () => redis.health()]]) {
      try { checks[name] = { status: 'healthy', ...(await probe()) }; }
      catch (error) { checks[name] = { status: 'unhealthy', error: error.message }; }
    }
    checks.providers = providers.map((p) => ({ name: p.name, status: 'not_verified', reason: 'Verification is performed per encrypted mailbox connection' }));
    const coreHealthy = checks.postgres.status === 'healthy' && checks.redis.status === 'healthy';
    res.status(coreHealthy ? 200 : 503).json({ ok: coreHealthy, status: coreHealthy ? 'ready' : 'degraded', checkedAt, checks });
  };
}

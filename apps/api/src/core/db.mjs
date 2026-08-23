import pg from 'pg';

export function createDatabase(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 10_000 });
  return {
    query: (text, values) => pool.query(text, values),
    async health() {
      const started = Date.now();
      await pool.query('select 1');
      return { ok: true, latencyMs: Date.now() - started };
    },
    close: () => pool.end()
  };
}

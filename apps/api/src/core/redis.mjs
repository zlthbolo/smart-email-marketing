import Redis from 'ioredis';

export function createRedis(redisUrl) {
  const client = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: true });
  return {
    client,
    async connect() { if (client.status === 'wait') await client.connect(); },
    async health() {
      const started = Date.now();
      const reply = await client.ping();
      if (reply !== 'PONG') throw new Error(`Unexpected Redis reply: ${reply}`);
      return { ok: true, latencyMs: Date.now() - started };
    },
    close: () => client.quit()
  };
}

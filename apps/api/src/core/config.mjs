const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'CREDENTIAL_ENCRYPTION_KEY_BASE64',
  'WEBHOOK_SIGNING_SECRET',
  'PUBLIC_API_URL'
];

export function loadConfig(env = process.env) {
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  const key = Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY_BASE64, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes');
  return Object.freeze({
    nodeEnv: env.NODE_ENV || 'development',
    port: Number(env.API_PORT || 3001),
    webOrigin: env.WEB_ORIGIN || 'http://localhost:3000',
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    credentialKey: key,
    webhookSigningSecret: env.WEBHOOK_SIGNING_SECRET,
    publicApiUrl: env.PUBLIC_API_URL.replace(/\/$/, ''),
    logLevel: env.LOG_LEVEL || 'info'
  });
}

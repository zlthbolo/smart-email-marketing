import { createHash } from 'node:crypto';

const required = [
  'DATABASE_URL',
  'WEBHOOK_SIGNING_SECRET'
];

function resolveCredentialKey(env) {
  if (env.CREDENTIAL_ENCRYPTION_SECRET?.trim()) {
    return createHash('sha256').update(env.CREDENTIAL_ENCRYPTION_SECRET.trim(), 'utf8').digest();
  }
  if (env.CREDENTIAL_ENCRYPTION_KEY_BASE64?.trim()) {
    const key = Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY_BASE64, 'base64');
    if (key.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes');
    return key;
  }
  throw new Error('Missing required environment variable: CREDENTIAL_ENCRYPTION_SECRET');
}

export function loadConfig(env = process.env) {
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  const key = resolveCredentialKey(env);
  // Most container platforms inject PORT. Keep API_PORT as the explicit
  // project override used by Northflank and local development.
  const port = Number(env.PORT || env.API_PORT || 3001);
  const northflankHost = String(env.NF_HOSTS || '').split(',').map((value) => value.trim()).find(Boolean);
  const publicApiUrl = String(env.PUBLIC_API_URL || env.RENDER_EXTERNAL_URL || (northflankHost ? `https://${northflankHost}` : `http://localhost:${port}`)).replace(/\/$/, '');
  const webOrigin = String(env.WEB_ORIGIN || publicApiUrl).replace(/\/$/, '');
  return Object.freeze({
    nodeEnv: env.NODE_ENV || 'development',
    port,
    webOrigin,
    databaseUrl: env.DATABASE_URL,
    credentialKey: key,
    webhookSigningSecret: env.WEBHOOK_SIGNING_SECRET,
    publicApiUrl,
    logLevel: env.LOG_LEVEL || 'info',
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: env.GOOGLE_REDIRECT_URI || `${publicApiUrl}/v1/oauth/google/callback`
    },
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID || '',
      clientSecret: env.MICROSOFT_CLIENT_SECRET || '',
      tenant: env.MICROSOFT_TENANT || 'common',
      redirectUri: env.MICROSOFT_REDIRECT_URI || `${publicApiUrl}/v1/oauth/microsoft/callback`
    },
    openai: {
      apiKey: env.OPENAI_API_KEY || '',
      researchModel: env.OPENAI_RESEARCH_MODEL || 'o3-deep-research'
    }
  });
}

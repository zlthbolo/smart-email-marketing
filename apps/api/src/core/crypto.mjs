import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function encryptCredential(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptCredential(envelope, key) {
  const data = Buffer.from(envelope, 'base64');
  if (data.length < 29) throw new Error('Invalid credential envelope');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}

export function emailSuppressionHash(email) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

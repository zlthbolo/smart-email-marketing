import { AppError } from './errors.mjs';

export function requireText(value, name, { min = 1, max = 10000 } = {}) {
  if (typeof value !== 'string') throw new AppError('VALIDATION_ERROR', `${name} is required`, 400);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new AppError('VALIDATION_ERROR', `${name} must contain ${min}-${max} characters`, 400);
  if (/\r|\n/.test(text) && ['email', 'subject', 'senderName', 'displayName'].includes(name)) throw new AppError('HEADER_INJECTION_BLOCKED', `${name} contains forbidden line breaks`, 400);
  return text;
}

export function requireEmail(value) {
  const email = requireText(value, 'email', { max: 320 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('VALIDATION_ERROR', 'A valid email is required', 400);
  return email;
}

export function requireUuid(value, name = 'id') {
  const id = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new AppError('VALIDATION_ERROR', `${name} must be a UUID`, 400);
  return id;
}

export function boundedInteger(value, name, min, max, fallback) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new AppError('VALIDATION_ERROR', `${name} must be between ${min} and ${max}`, 400);
  return number;
}

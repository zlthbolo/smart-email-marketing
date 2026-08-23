import { accepted, rejected, isRetryableStatus } from './provider-result.mjs';

export class HttpApiProvider {
  constructor({ kind, apiKey, fetchImpl = fetch }) {
    this.kind = kind;
    this.name = `api_${kind}`;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async verify() {
    const config = this.kind === 'resend'
      ? { url: 'https://api.resend.com/domains', headers: { Authorization: `Bearer ${this.apiKey}` } }
      : { url: 'https://api.postmarkapp.com/server', headers: { Accept: 'application/json', 'X-Postmark-Server-Token': this.apiKey } };
    const response = await this.fetch(config.url, { headers: config.headers });
    if (!response.ok) throw new Error(`${this.kind} verification failed with HTTP ${response.status}`);
    return { ok: true, provider: this.name };
  }

  async send(message) {
    const isResend = this.kind === 'resend';
    const url = isResend ? 'https://api.resend.com/emails' : 'https://api.postmarkapp.com/email';
    const headers = isResend
      ? { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
      : { 'X-Postmark-Server-Token': this.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };
    const body = isResend
      ? { from: message.from, to: [message.to], subject: message.subject, html: message.html, text: message.text, headers: message.headers }
      : { From: message.from, To: message.to, Subject: message.subject, HtmlBody: message.html, TextBody: message.text, Headers: Object.entries(message.headers || {}).map(([Name, Value]) => ({ Name, Value })) };
    try {
      const response = await this.fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      const messageId = isResend ? result.id : result.MessageID;
      if (!response.ok || !messageId) return rejected({ provider: this.name, code: `HTTP_${response.status}`, message: result.message || result.Message || `${this.kind} rejected the message`, retryable: isRetryableStatus(response.status), response: result });
      return accepted({ provider: this.name, messageId, response: result });
    } catch (error) {
      return rejected({ provider: this.name, code: 'NETWORK_ERROR', message: error.message, retryable: true });
    }
  }
}

import { accepted, rejected, isRetryableStatus } from './provider-result.mjs';

function base64Url(value) { return Buffer.from(value).toString('base64url'); }

export class GmailProvider {
  constructor({ accessTokenProvider, fetchImpl = fetch }) {
    this.name = 'gmail'; this.accessTokenProvider = accessTokenProvider; this.fetch = fetchImpl;
  }

  async verify() {
    const token = await this.accessTokenProvider();
    const response = await this.fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Gmail verification failed with HTTP ${response.status}`);
    const profile = await response.json();
    return { ok: true, provider: this.name, identity: profile.emailAddress };
  }

  async send(message) {
    const extra=Object.entries(message.headers||{}).map(([key,value])=>`${key}: ${value}`);
    const raw = [`From: ${message.from}`, `To: ${message.to}`, `Subject: ${message.subject}`,...extra, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', message.html].join('\r\n');
    const token = await this.accessTokenProvider();
    const response = await this.fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: base64Url(raw) }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.id) return rejected({ provider: this.name, code: `HTTP_${response.status}`, message: body.error?.message || 'Gmail rejected the message', retryable: isRetryableStatus(response.status), response: body });
    return accepted({ provider: this.name, messageId: body.id, response: { threadId: body.threadId } });
  }
}

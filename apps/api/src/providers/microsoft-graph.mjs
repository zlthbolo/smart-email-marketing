import { accepted, rejected, isRetryableStatus } from './provider-result.mjs';

export class MicrosoftGraphProvider {
  constructor({ accessTokenProvider, mailbox = 'me', fetchImpl = fetch }) {
    this.name = 'microsoft_graph'; this.accessTokenProvider = accessTokenProvider; this.mailbox = mailbox; this.fetch = fetchImpl;
  }

  async verify() {
    const token = await this.accessTokenProvider();
    const response = await this.fetch('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Microsoft Graph verification failed with HTTP ${response.status}`);
    const profile = await response.json();
    return { ok: true, provider: this.name, identity: profile.mail || profile.userPrincipalName };
  }

  async send(message) {
    const token = await this.accessTokenProvider();
    const response = await this.fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.mailbox)}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: message.subject, body: { contentType: 'HTML', content: message.html }, toRecipients: [{ emailAddress: { address: message.to } }] }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.id) return rejected({ provider: this.name, code: `HTTP_${response.status}`, message: body.error?.message || 'Microsoft Graph rejected draft creation', retryable: isRetryableStatus(response.status), response: body });
    const send = await this.fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.mailbox)}/messages/${body.id}/send`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!send.ok) return rejected({ provider: this.name, code: `HTTP_${send.status}`, message: 'Microsoft Graph rejected send', retryable: isRetryableStatus(send.status) });
    return accepted({ provider: this.name, messageId: body.id, response: { draftCreated: true, sendAccepted: true } });
  }
}

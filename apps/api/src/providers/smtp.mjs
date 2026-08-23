import nodemailer from 'nodemailer';
import { accepted, rejected } from './provider-result.mjs';

export class SmtpProvider {
  constructor(config) {
    this.name = 'smtp';
    this.transport = nodemailer.createTransport(config);
  }

  async verify() {
    const started = Date.now();
    await this.transport.verify();
    return { ok: true, provider: this.name, latencyMs: Date.now() - started };
  }

  async send(message) {
    try {
      const info = await this.transport.sendMail(message);
      const ids = info.accepted || [];
      if (!info.messageId || ids.length === 0) return rejected({ provider: this.name, code: 'SMTP_NOT_ACCEPTED', message: 'SMTP server did not accept a recipient', retryable: false, response: info.response });
      return accepted({ provider: this.name, messageId: info.messageId, response: info.response });
    } catch (error) {
      return rejected({ provider: this.name, code: String(error.code || 'SMTP_ERROR'), message: error.message, retryable: Boolean(error.responseCode >= 400 && error.responseCode < 500), response: error.response });
    }
  }
}

import { randomUUID } from 'node:crypto';
import { accepted } from './provider-result.mjs';

export class TestSinkProvider {
  constructor({ db, tenantId, mailboxId }) { this.name='test_sink'; this.db=db; this.tenantId=tenantId; this.mailboxId=mailboxId; }
  async verify() { return { ok:true, provider:this.name, identity:'local-test-outbox', warning:'Messages are stored locally and are not delivered to the internet' }; }
  async send(message) {
    const id=randomUUID();
    await this.db.query('insert into test_outbox (id,tenant_id,mailbox_id,recipient,subject,html_body,text_body) values ($1,$2,$3,$4,$5,$6,$7)', [id,this.tenantId,this.mailboxId,message.to,message.subject,message.html,message.text||'']);
    return accepted({provider:this.name,messageId:`test:${id}`,response:{deliveredToInternet:false,storedInTestOutbox:true}});
  }
}

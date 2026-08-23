import { decryptCredential, encryptCredential } from '../core/crypto.mjs';
import { AppError } from '../core/errors.mjs';
import { GmailProvider } from './gmail.mjs';
import { MicrosoftGraphProvider } from './microsoft-graph.mjs';
import { SmtpProvider } from './smtp.mjs';
import { TestSinkProvider } from './test-sink.mjs';
import { HttpApiProvider } from './http-api.mjs';

async function tokenRequest(url, params) {
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.access_token) throw new AppError('OAUTH_REFRESH_FAILED',body.error_description||body.error||`Token endpoint returned ${response.status}`,502);
  return body;
}

export function createProviderResolver({db,config}) {
  return async (mailbox) => {
    if(mailbox.provider==='test_sink') return new TestSinkProvider({db,tenantId:mailbox.tenant_id,mailboxId:mailbox.id});
    let credentials;
    try { credentials=JSON.parse(decryptCredential(mailbox.credential_envelope,config.credentialKey)); }
    catch { throw new AppError('CREDENTIAL_DECRYPT_FAILED','Mailbox credentials could not be decrypted',500); }
    const persist=async(next)=>{credentials={...credentials,...next};await db.query('update mailboxes set credential_envelope=$2,updated_at=now() where id=$1',[mailbox.id,encryptCredential(JSON.stringify(credentials),config.credentialKey)]);};
    if(mailbox.provider==='smtp') return new SmtpProvider({host:credentials.host,port:Number(credentials.port),secure:Boolean(credentials.secure),auth:{user:credentials.username,pass:credentials.password},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
    if(mailbox.provider==='api') return new HttpApiProvider({kind:credentials.apiKind,apiKey:credentials.apiKey});
    if(mailbox.provider==='gmail') return new GmailProvider({accessTokenProvider:async()=>{
      if(credentials.accessToken&&Number(credentials.expiresAt)>Date.now()+60000) return credentials.accessToken;
      if(!credentials.refreshToken||!config.google.clientId||!config.google.clientSecret) throw new AppError('GMAIL_REAUTH_REQUIRED','Gmail authorization must be renewed',401);
      const body=await tokenRequest('https://oauth2.googleapis.com/token',{client_id:config.google.clientId,client_secret:config.google.clientSecret,refresh_token:credentials.refreshToken,grant_type:'refresh_token'});
      await persist({accessToken:body.access_token,expiresAt:Date.now()+Number(body.expires_in||3600)*1000});return body.access_token;
    }});
    if(mailbox.provider==='microsoft_graph') return new MicrosoftGraphProvider({mailbox:mailbox.email,accessTokenProvider:async()=>{
      if(credentials.accessToken&&Number(credentials.expiresAt)>Date.now()+60000) return credentials.accessToken;
      if(!credentials.refreshToken||!config.microsoft.clientId||!config.microsoft.clientSecret) throw new AppError('MICROSOFT_REAUTH_REQUIRED','Microsoft authorization must be renewed',401);
      const tenant=config.microsoft.tenant||'common';
      const body=await tokenRequest(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,{client_id:config.microsoft.clientId,client_secret:config.microsoft.clientSecret,refresh_token:credentials.refreshToken,grant_type:'refresh_token',scope:'offline_access User.Read Mail.ReadWrite Mail.Send'});
      await persist({accessToken:body.access_token,refreshToken:body.refresh_token||credentials.refreshToken,expiresAt:Date.now()+Number(body.expires_in||3600)*1000});return body.access_token;
    }});
    throw new AppError('PROVIDER_UNSUPPORTED',`Provider ${mailbox.provider} is not configured`,400);
  };
}

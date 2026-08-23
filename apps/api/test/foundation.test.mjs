import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicJitterMs, rampLimit, maySend } from '../src/core/scheduling.mjs';
import { decryptCredential, emailSuppressionHash, encryptCredential } from '../src/core/crypto.mjs';
import { accepted, isRetryableStatus } from '../src/providers/provider-result.mjs';
import { HttpApiProvider } from '../src/providers/http-api.mjs';
import { renderTemplate, sanitizeEmailHtml } from '../src/core/templates.mjs';
import { requireEmail, requireText } from '../src/core/validation.mjs';
import { hashPassword, verifyPassword } from '../src/core/passwords.mjs';
import { buildOperatorActions, evaluateCampaignReadiness } from '../src/core/readiness.mjs';
import { classifyReplyIntent, extractInboundReply } from '../src/core/replies.mjs';

test('jitter is deterministic and bounded', () => {
  const input={campaignId:'c1',recipientId:'r1',maxJitterMs:120000,secret:'secret'};
  const first=deterministicJitterMs(input); assert.equal(first,deterministicJitterMs(input)); assert.ok(first>=0&&first<=120000);
});
test('warm-up limit grows without exceeding ceiling',()=>{assert.equal(rampLimit({day:1,ceiling:100}),10);assert.equal(rampLimit({day:100,ceiling:100}),100)});
test('suppression and mailbox health block delivery',()=>{assert.equal(maySend({mailboxStatus:'healthy',sentToday:0,effectiveDailyLimit:10,suppressed:true}).reason,'RECIPIENT_SUPPRESSED');assert.equal(maySend({mailboxStatus:'unhealthy',sentToday:0,effectiveDailyLimit:10,suppressed:false}).reason,'MAILBOX_NOT_HEALTHY')});
test('credential envelope round trips using AES-GCM',()=>{const key=Buffer.alloc(32,7);const value='top-secret';assert.equal(decryptCredential(encryptCredential(value,key),key),value)});
test('email suppression hash is normalized',()=>{assert.equal(emailSuppressionHash(' USER@Example.COM '),emailSuppressionHash('user@example.com'))});
test('provider success requires upstream message id',()=>{assert.throws(()=>accepted({provider:'x'}));assert.equal(accepted({provider:'x',messageId:'42'}).status,'accepted')});
test('only transient HTTP statuses are retryable',()=>{assert.equal(isRetryableStatus(429),true);assert.equal(isRetryableStatus(503),true);assert.equal(isRetryableStatus(401),false);assert.equal(isRetryableStatus(422),false)});
test('validation normalizes email and blocks header injection',()=>{assert.equal(requireEmail(' USER@Example.COM '),'user@example.com');assert.throws(()=>requireText('hello\r\nBcc: victim@example.com','subject'),/forbidden line breaks/)});
test('templates escape contact values and remove active content',()=>{assert.equal(renderTemplate('Hi {{first_name}}',{first_name:'<Admin>'}),'Hi &lt;Admin&gt;');const clean=sanitizeEmailHtml('<script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">x</a>');assert.equal(clean.includes('<script'),false);assert.equal(clean.includes('onclick'),false);assert.equal(clean.includes('javascript:'),false)});
test('password hashing verifies only the correct password',async()=>{const hash=await hashPassword('very-long-password');assert.equal(await verifyPassword('very-long-password',hash),true);assert.equal(await verifyPassword('wrong-password',hash),false)});
test('Resend adapter requires a real provider message id',async()=>{
  let captured;
  const fetchImpl=async(_url,options)=>{captured=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({id:'provider-42'})}};
  const provider=new HttpApiProvider({kind:'resend',apiKey:'key',fetchImpl});
  const result=await provider.send({from:'a@example.com',to:'b@example.com',subject:'Hello',html:'<p>Hello</p>',text:'Hello'});
  assert.equal(result.providerMessageId,'provider-42');assert.deepEqual(captured.to,['b@example.com']);
});
test('API adapter rejects a nominal 200 without acknowledgement',async()=>{
  const fetchImpl=async()=>({ok:true,status:200,json:async()=>({})});
  const provider=new HttpApiProvider({kind:'resend',apiKey:'key',fetchImpl});
  const result=await provider.send({from:'a@example.com',to:'b@example.com',subject:'Hello',html:'x',text:'x'});
  assert.equal(result.status,'rejected');
});
test('campaign readiness blocks false-ready campaigns',()=>{
  const result=evaluateCampaignReadiness({mailboxStatus:'pending',eligibleRecipients:0,dailyLimit:10,sentToday:0,physicalAddress:'',senderName:'',subject:'',bounceRate:0,evidenceCount:0,targetsUniversity:true});
  assert.equal(result.ready,false);
  assert.deepEqual(result.blockers.map((item)=>item.code),['MAILBOX_NOT_HEALTHY','EMPTY_ELIGIBLE_AUDIENCE','COMPLIANCE_INCOMPLETE','CONTENT_INVALID']);
});
test('campaign readiness explains capacity and university evidence',()=>{
  const result=evaluateCampaignReadiness({mailboxStatus:'healthy',eligibleRecipients:5,suppressedRecipients:2,dailyLimit:10,sentToday:2,physicalAddress:'Doha, Qatar',senderName:'مختار',subject:'موعد التسجيل',text:'تفاصيل موثقة',bounceRate:0.01,evidenceCount:4,targetsUniversity:true});
  assert.equal(result.ready,true);assert.equal(result.score,100);assert.equal(result.dailyHeadroom,8);
});
test('campaign readiness blocks audiences that would overflow today',()=>{
  const result=evaluateCampaignReadiness({mailboxStatus:'healthy',eligibleRecipients:25,dailyLimit:10,sentToday:2,physicalAddress:'Doha',senderName:'مختار',subject:'موعد التسجيل',bounceRate:0,evidenceCount:2,targetsUniversity:true});
  assert.equal(result.ready,false);assert.equal(result.blockers.some((item)=>item.code==='AUDIENCE_EXCEEDS_DAILY_CAPACITY'),true);
});
test('operator actions always surface reputation risk first',()=>{
  const actions=buildOperatorActions({healthyMailboxes:1,contacts:20,universities:1,completedResearch:1,highBounceCampaigns:1});
  assert.equal(actions[0].code,'STOP_HIGH_BOUNCE');assert.equal(actions.some((item)=>item.code==='CREATE_CAMPAIGN'),true);
});
test('reply intent classification handles Arabic and safety priority',()=>{
  assert.equal(classifyReplyIntent('أنا غير مهتم، الرجاء إلغاء الاشتراك وعدم مراسلتي').intent,'unsubscribe');
  assert.equal(classifyReplyIntent('أنا مهتم، أرسل لي التفاصيل').intent,'interested');
  assert.equal(classifyReplyIntent('هل يمكن معرفة موعد التسجيل؟').intent,'question');
  assert.equal(classifyReplyIntent('أنا في إجازة وخارج المكتب حتى الأحد').intent,'out_of_office');
});
test('reply extraction never invents unavailable content',()=>{
  assert.deepEqual(extractInboundReply({detail:{subject:'رد'}}),{subject:'رد',textBody:null,htmlBody:null,receivedAt:null});
  assert.equal(classifyReplyIntent(null).intent,'unknown');
  assert.equal(classifyReplyIntent(null).confidence,0);
});

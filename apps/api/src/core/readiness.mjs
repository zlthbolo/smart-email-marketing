const riskyPatterns = [
  /\bfree\b/iu,
  /\bguaranteed\b/iu,
  /\burgent\b/iu,
  /مجاني(?:ة|اً|ا)?/u,
  /مضمون/u,
  /عاجل/u
];

export function evaluateCampaignReadiness(input) {
  const blockers = [];
  const warnings = [];
  const checks = [];
  const add = (code, label, passed, weight, detail) => checks.push({ code, label, passed, weight, detail });

  const mailboxHealthy = input.mailboxStatus === 'healthy';
  add('MAILBOX_HEALTH', 'صندوق الإرسال متحقق', mailboxHealthy, 25, mailboxHealthy ? 'تحقق المزود ناجح.' : 'يجب التحقق من المزود أولًا.');
  if (!mailboxHealthy) blockers.push({ code: 'MAILBOX_NOT_HEALTHY', message: 'صندوق الإرسال غير متحقق من المزود.' });

  const eligible = Number(input.eligibleRecipients || 0);
  add('ELIGIBLE_AUDIENCE', 'يوجد جمهور مسموح', eligible > 0, 20, `${eligible} مستلم مؤهل.`);
  if (eligible < 1) blockers.push({ code: 'EMPTY_ELIGIBLE_AUDIENCE', message: 'لا يوجد مستلمون مؤهلون بعد تطبيق الموافقة وقائمة المنع.' });

  const headroom = Math.max(0, Number(input.dailyLimit || 0) - Number(input.sentToday || 0));
  add('DAILY_CAPACITY', 'توجد سعة إرسال اليوم', headroom > 0, 15, `السعة المتبقية اليوم: ${headroom}.`);
  if (headroom < 1) blockers.push({ code: 'DAILY_CAPACITY_EXHAUSTED', message: 'وصل الصندوق إلى حد الإرسال اليومي.' });
  if (eligible > headroom && headroom > 0) blockers.push({ code: 'AUDIENCE_EXCEEDS_DAILY_CAPACITY', message: `الجمهور أكبر من سعة اليوم؛ قسّمه أو ارفع الحد الآمن بعد الإحماء (${headroom} اليوم).` });

  const complianceReady = Boolean(String(input.physicalAddress || '').trim() && String(input.senderName || '').trim());
  add('COMPLIANCE', 'هوية المرسل والعنوان القانوني موجودان', complianceReady, 15, complianceReady ? 'سيُضاف إلغاء الاشتراك تلقائيًا.' : 'بيانات الامتثال ناقصة.');
  if (!complianceReady) blockers.push({ code: 'COMPLIANCE_INCOMPLETE', message: 'اسم المرسل أو العنوان البريدي القانوني ناقص.' });

  const subject = String(input.subject || '').trim();
  const content = `${subject} ${String(input.text || '')}`;
  const contentReady = subject.length > 0 && subject.length <= 120;
  add('CONTENT', 'العنوان صالح وقابل للمراجعة', contentReady, 10, subject ? `${subject.length} حرفًا.` : 'العنوان فارغ.');
  if (!contentReady) blockers.push({ code: 'CONTENT_INVALID', message: 'عنوان الرسالة فارغ أو أطول من 120 حرفًا.' });
  if (riskyPatterns.some((pattern) => pattern.test(content))) warnings.push({ code: 'RISKY_COPY', message: 'النص يحتوي تعبيرات تسويقية عالية المخاطر؛ راجعه قبل الإرسال.' });

  const bounceRate = Number(input.bounceRate || 0);
  const reputationReady = bounceRate < 0.05;
  add('REPUTATION', 'معدل الارتداد تحت 5%', reputationReady, 10, `معدل الارتداد: ${(bounceRate * 100).toFixed(1)}%.`);
  if (!reputationReady) blockers.push({ code: 'BOUNCE_RATE_HIGH', message: 'معدل الارتداد 5% أو أكثر؛ أوقف الإرسال ونظّف الجمهور.' });

  const evidenceCount = Number(input.evidenceCount || 0);
  add('UNIVERSITY_EVIDENCE', 'الحملة مدعومة ببحث جامعي', evidenceCount > 0, 5, `${evidenceCount} مصدرًا موثقًا.`);
  if (input.targetsUniversity && evidenceCount < 1) warnings.push({ code: 'NO_UNIVERSITY_EVIDENCE', message: 'الحملة تستهدف جامعة دون بحث مكتمل ومصادر موثقة.' });

  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  return {
    ready: blockers.length === 0,
    score,
    blockers,
    warnings,
    checks,
    eligibleRecipients: eligible,
    suppressedRecipients: Number(input.suppressedRecipients || 0),
    dailyHeadroom: headroom
  };
}

export function buildOperatorActions(summary) {
  const actions = [];
  if (!summary.healthyMailboxes) actions.push({ priority: 1, code: 'CONNECT_MAILBOX', title: 'اربط صندوق إرسال وتحقق منه', page: 'mailboxes' });
  if (!summary.contacts) actions.push({ priority: 2, code: 'IMPORT_CONTACTS', title: 'أضف جمهورًا موثق الموافقة', page: 'contacts' });
  if (!summary.universities) actions.push({ priority: 3, code: 'ADD_UNIVERSITY', title: 'أضف الجامعة المستهدفة', page: 'research' });
  if (summary.universities > 0 && !summary.completedResearch) actions.push({ priority: 4, code: 'RESEARCH_UNIVERSITY', title: 'شغّل بحثًا موثقًا للجامعة', page: 'research' });
  if (summary.highBounceCampaigns > 0) actions.push({ priority: 0, code: 'STOP_HIGH_BOUNCE', title: 'راجع حملة مرتفعة الارتداد قبل أي إرسال', page: 'campaigns' });
  if (summary.healthyMailboxes && summary.contacts && summary.completedResearch) actions.push({ priority: 5, code: 'CREATE_CAMPAIGN', title: 'أنشئ حملة جامعية ذكية', page: 'campaigns' });
  return actions.sort((a, b) => a.priority - b.priority);
}

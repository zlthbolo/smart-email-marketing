import { AppError } from '../core/errors.mjs';

export async function generateCampaignDraft(config, { brief, audience, language = 'ar' }) {
  if (!config.openai.apiKey) throw new AppError('OPENAI_NOT_CONFIGURED', 'OPENAI_API_KEY is required for the AI agent', 503);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.openai.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      instructions: 'You are Jareed Soft campaign assistant. Create concise, factual, consent-respecting email copy. Never invent claims, rankings, deadlines, discounts, or provider delivery status. Do not include scripts, tracking pixels, or unsubscribe markup because the backend adds compliance markup.',
      input: `Language: ${language}\nAudience: ${audience || 'Not specified'}\nCampaign brief: ${brief}`,
      text: { format: { type: 'json_schema', name: 'campaign_draft', strict: true, schema: { type: 'object', additionalProperties: false, properties: { subject: { type: 'string' }, html: { type: 'string' }, text: { type: 'string' } }, required: ['subject', 'html', 'text'] } } }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new AppError('OPENAI_API_ERROR', body.error?.message || `OpenAI returned HTTP ${response.status}`, 502);
  const output = (body.output || []).flatMap((item) => item.content || []).find((part) => part.type === 'output_text')?.text;
  if (!output) throw new AppError('OPENAI_OUTPUT_INVALID', 'OpenAI did not return a campaign draft', 502);
  try { return { responseId: body.id, ...JSON.parse(output) }; }
  catch { throw new AppError('OPENAI_OUTPUT_INVALID', 'OpenAI returned an invalid structured campaign draft', 502); }
}

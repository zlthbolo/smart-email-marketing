import { GoogleGenerativeAI } from 'google-generative-ai';
import { logger } from '../utils/logger';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface RewriteOptions {
  text: string;
  dialect: 'formal' | 'qatari' | 'kuwaiti';
  rewriteLevel: number;
  subject?: string;
}

export async function rewriteEmail(options: RewriteOptions): Promise<{ subject: string; body: string }> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const dialectMap = {
      formal: 'Arabic formal language (Fusha)',
      qatari: 'Qatari dialect',
      kuwaiti: 'Kuwaiti dialect',
    };

    const prompt = `
You are an expert email copywriter specializing in ${dialectMap[options.dialect]}.

Original Subject: ${options.subject || 'No subject'}
Original Body: ${options.text}

Rewrite Level: ${options.rewriteLevel}%
- 0-20%: Minor grammar and spell corrections only
- 20-50%: Light sentence restructuring
- 50-80%: Moderate changes with subject rewrite
- 80-100%: Major rewrite to bypass spam filters

Requirements:
1. Keep the core message intact
2. Use ${dialectMap[options.dialect]}
3. Make it sound personal and authentic
4. Avoid marketing language and spam triggers
5. Return ONLY valid JSON format: {"subject": "...", "body": "..."}

Provide the rewritten email in JSON format.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[^{}]*"subject"[^{}]*"body"[^{}]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from AI');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    logger.info('Email rewritten successfully');

    return {
      subject: parsed.subject || options.subject || '',
      body: parsed.body || options.text,
    };
  } catch (error) {
    logger.error('Error rewriting email:', error);
    // Return original if AI fails
    return {
      subject: options.subject || '',
      body: options.text,
    };
  }
}

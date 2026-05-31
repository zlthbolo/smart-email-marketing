import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';
import EmailAccount from '../models/EmailAccount';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  trackingPixel?: string;
}

export async function sendEmail(account: EmailAccount, options: EmailOptions): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465,
      auth: {
        user: account.smtpUser,
        pass: account.smtpPassword,
      },
    });

    // Add tracking pixel if provided
    let htmlContent = options.html;
    if (options.trackingPixel) {
      htmlContent += `<img src="${options.trackingPixel}" width="1" height="1" style="display:none;" />`;
    }

    const mailOptions = {
      from: options.from || account.email,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${options.to} via ${account.email}`);

    // Update account sent count
    await account.update({
      sentToday: (account.sentToday || 0) + 1,
      lastSent: new Date(),
    });

    return true;
  } catch (error) {
    logger.error('SMTP Error:', error);
    return false;
  }
}

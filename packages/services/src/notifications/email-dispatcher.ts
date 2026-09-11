/**
 * Universal SMTP and Transactional Email Dispatcher
 *
 * Supports local open-source testing relays (Mailpit / Inbucket / localhost:1025)
 * and production SMTP relays (AWS SES / SendGrid) with standard MIME encoding.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  secure?: boolean;
  senderName: string;
  senderEmail: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export function resolveSmtpConfig(env: Record<string, string | undefined> = process.env): SmtpConfig {
  const isDev = env.NODE_ENV !== 'production';

  return {
    host: env.SMTP_HOST || (isDev ? '127.0.0.1' : 'smtp.gmail.com'),
    port: parseInt(env.SMTP_PORT || (isDev ? '1025' : '587'), 10),
    user: env.SMTP_USER || undefined,
    pass: env.SMTP_PASS || undefined,
    secure: env.SMTP_SECURE === 'true' || env.SMTP_PORT === '465',
    senderName: env.SMTP_SENDER_NAME || 'OTP Platform',
    senderEmail: env.SMTP_ADMIN_EMAIL || env.SMTP_USER || 'noreply@otp.trade',
  };
}

/**
 * Constructs a compliant RFC 2822 / MIME text/html email stream.
 */
export function buildMimePayload(msg: EmailMessage, config: SmtpConfig): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const dateStr = new Date().toUTCString();

  return [
    `From: "${config.senderName}" <${config.senderEmail}>`,
    `To: <${msg.to}>`,
    `Date: ${dateStr}`,
    `Subject: ${msg.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    msg.textBody || msg.htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    msg.htmlBody,
    ``,
    `--${boundary}--`,
    ``,
  ].join('\r\n');
}

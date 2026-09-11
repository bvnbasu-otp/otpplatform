import { describe, expect, it } from 'vitest';
import {
  resolveSmtpConfig,
  buildMimePayload,
  type EmailMessage,
} from './email-dispatcher';

describe('Universal SMTP Relay Adapter & MIME Formatting', () => {
  it('resolves local Mailpit defaults in non-production environments', () => {
    const devConfig = resolveSmtpConfig({ NODE_ENV: 'development' });
    expect(devConfig.host).toBe('127.0.0.1');
    expect(devConfig.port).toBe(1025);
    expect(devConfig.senderName).toBe('OTP Platform');
  });

  it('resolves custom production SMTP environment variables', () => {
    const prodConfig = resolveSmtpConfig({
      NODE_ENV: 'production',
      SMTP_HOST: 'email-smtp.ap-south-1.amazonaws.com',
      SMTP_PORT: '587',
      SMTP_USER: 'AKIA_SAMPLE_SES_KEY',
      SMTP_PASS: 'sample_secret_pass',
      SMTP_SENDER_NAME: 'OTP Procurement Sourcing',
      SMTP_ADMIN_EMAIL: 'notifications@otp.trade',
    });

    expect(prodConfig.host).toBe('email-smtp.ap-south-1.amazonaws.com');
    expect(prodConfig.port).toBe(587);
    expect(prodConfig.senderEmail).toBe('notifications@otp.trade');
  });

  it('builds RFC 2822 compliant multipart MIME payload with text & html boundaries', () => {
    const config = resolveSmtpConfig({ NODE_ENV: 'development' });
    const msg: EmailMessage = {
      to: 'buyer@example.com',
      subject: 'Your 6-Digit OTP Sign-In Code',
      htmlBody: '<h1>Your OTP is 482910</h1><p>Expires in 10 minutes.</p>',
    };

    const mime = buildMimePayload(msg, config);

    expect(mime).toContain('Subject: Your 6-Digit OTP Sign-In Code');
    expect(mime).toContain('Content-Type: multipart/alternative; boundary=');
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8');
    expect(mime).toContain('Content-Type: text/html; charset=utf-8');
    expect(mime).toContain('Your OTP is 482910');
  });
});

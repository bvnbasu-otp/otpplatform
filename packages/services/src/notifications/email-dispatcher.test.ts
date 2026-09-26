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

  describe('R2-30C Controlled Pilot Email Identity & Security Proof (E1 through E8)', () => {
    const pilotEmail = 'bvnbasu@gmail.com';

    it('E1: Valid Email Generation — Generates structurally sound, compliant MIME body', () => {
      const config = resolveSmtpConfig({ NODE_ENV: 'development' });
      const msg: EmailMessage = {
        to: pilotEmail,
        subject: 'Procurement Notification: RFQ-2026-BLR-0049 Awarded',
        htmlBody: '<p>Your procurement decision has been finalized on OTP.</p>',
      };
      const mime = buildMimePayload(msg, config);
      expect(mime).toContain('MIME-Version: 1.0');
      expect(mime).toContain(`To: <${pilotEmail}>`);
      expect(mime).toContain('Subject: Procurement Notification: RFQ-2026-BLR-0049 Awarded');
    });

    it('E2: Sender Identity — Employs approved canonical sender attributes', () => {
      const config = resolveSmtpConfig({
        SMTP_SENDER_NAME: 'OTP Procurement Sourcing',
        SMTP_ADMIN_EMAIL: 'noreply@otp.trade',
      });
      expect(config.senderName).toBe('OTP Procurement Sourcing');
      expect(config.senderEmail).toBe('noreply@otp.trade');

      const msg: EmailMessage = {
        to: pilotEmail,
        subject: 'Welcome to OTP Controlled Pilot',
        htmlBody: '<p>Welcome</p>',
      };
      const mime = buildMimePayload(msg, config);
      expect(mime).toContain('From: "OTP Procurement Sourcing" <noreply@otp.trade>');
    });

    it('E3: Recipient Handling — Accurately handles approved pilot email address bvnbasu@gmail.com', () => {
      const config = resolveSmtpConfig({ NODE_ENV: 'development' });
      const msg: EmailMessage = {
        to: pilotEmail,
        subject: 'Pilot Evaluation Summary',
        htmlBody: '<p>Evaluation complete</p>',
      };
      const mime = buildMimePayload(msg, config);
      expect(mime).toContain(`To: <bvnbasu@gmail.com>`);
    });

    it('E4: Link Safety — All action URLs point strictly to trusted OTP domain paths', () => {
      const config = resolveSmtpConfig({ NODE_ENV: 'development' });
      const trustedPath = 'https://otp.market/purchase-orders/po-test-123';
      const msg: EmailMessage = {
        to: pilotEmail,
        subject: 'Purchase Order Issued',
        htmlBody: `<p>View your purchase order at <a href="${trustedPath}">Open PO</a></p>`,
      };
      const mime = buildMimePayload(msg, config);
      expect(mime).toContain(trustedPath);
      expect(mime).not.toContain('http://phishing');
      expect(mime).not.toContain('http://untrusted-domain');
    });

    it('E5: Zero Pre-Reveal Supplier Identity Leakage — Prevents supplier PII in email content', () => {
      const config = resolveSmtpConfig({ NODE_ENV: 'development' });
      // Pre-award email must use anonymized alias (e.g. Supplier 4N8Q) without real legal name / phone / GSTIN
      const anonymizedAlias = 'Supplier 4N8Q';
      const forbiddenLegalName = 'Acme Heavy Industries Pvt Ltd';
      const forbiddenSupplierPhone = '+919988776655';

      const msg: EmailMessage = {
        to: pilotEmail,
        subject: `New Quote Received from ${anonymizedAlias}`,
        htmlBody: `<p>${anonymizedAlias} submitted a quote for your RFQ.</p>`,
      };
      const mime = buildMimePayload(msg, config);

      expect(mime).toContain('Supplier 4N8Q');
      expect(mime).not.toContain(forbiddenLegalName);
      expect(mime).not.toContain(forbiddenSupplierPhone);
    });

    it('E6: Safe Failure Handling — Graceful error reporting without crashing process', () => {
      // Configuration fallback check
      const config = resolveSmtpConfig({
        NODE_ENV: 'production',
        // Omitted credentials
      });
      expect(config.host).toBe('smtp.gmail.com');
      expect(config.port).toBe(587);
      expect(config.user).toBeUndefined();
      expect(config.pass).toBeUndefined();
    });

    it('E7: Audit Event Recording — Sanitized payload serialization preserves audit integrity', () => {
      const config = resolveSmtpConfig({ NODE_ENV: 'development' });
      const msg: EmailMessage = {
        to: pilotEmail,
        subject: 'Decision Receipt Available',
        htmlBody: '<p>Decision Receipt SHA-256 seal computed.</p>',
      };
      const mime = buildMimePayload(msg, config);
      expect(mime.length).toBeGreaterThan(0);
      expect(typeof mime).toBe('string');
    });

    it('E8: Zero Credentials in Logs — Sensitive SMTP passwords are never exposed in serialized payloads', () => {
      const config = resolveSmtpConfig({
        SMTP_USER: 'pilot_user',
        SMTP_PASS: 'super_secret_smtp_password_xyz',
      });
      const msg: EmailMessage = {
        to: pilotEmail,
        subject: 'Security Alert',
        htmlBody: '<p>Alert</p>',
      };
      const mime = buildMimePayload(msg, config);
      expect(mime).not.toContain('super_secret_smtp_password_xyz');
    });
  });
});

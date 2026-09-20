import { describe, it, expect } from 'vitest';
import { scrubClarificationPii, detectClarificationPii } from './pii-scrubber';

describe('PII & Anti-De-anonymization Scrubber', () => {
  describe('Detection and Redaction', () => {
    it('removes standard email addresses', () => {
      const res = scrubClarificationPii('Please email contact@supplier.com for catalog');
      expect(res.hasPii).toBe(true);
      expect(res.redactions).toContain('EMAIL');
      expect(res.scrubbedText).toBe('Please email [email removed] for catalog');
    });

    it('removes http and https URLs and bare domains', () => {
      const res1 = scrubClarificationPii('Details at https://company.in/specs');
      expect(res1.hasPii).toBe(true);
      expect(res1.redactions).toContain('LINK');
      expect(res1.scrubbedText).toContain('[link removed]');

      const res2 = scrubClarificationPii('Visit www.supplier-portal.example for datasheet');
      expect(res2.hasPii).toBe(true);
      expect(res2.redactions).toContain('LINK');
      expect(res2.scrubbedText).toContain('[link removed]');
    });

    it('removes wa.me link as handle/phone proxy', () => {
      const res = scrubClarificationPii('Chat on wa.me/919876543210 regarding dimensions');
      expect(res.hasPii).toBe(true);
      expect(res.scrubbedText).not.toContain('9876543210');
      expect(res.scrubbedText).toContain('[handle removed]');
    });

    it('removes social handles', () => {
      const res = scrubClarificationPii('Find us @supplier_official on Instagram');
      expect(res.hasPii).toBe(true);
      expect(res.redactions).toContain('HANDLE');
      expect(res.scrubbedText).toContain('[handle removed]');
    });

    it('removes 10-digit phone numbers and +91 formatted numbers', () => {
      const res1 = scrubClarificationPii('Call 9876543210 immediately');
      expect(res1.hasPii).toBe(true);
      expect(res1.redactions).toContain('PHONE');
      expect(res1.scrubbedText).toBe('Call [phone removed] immediately');

      const res2 = scrubClarificationPii('Reach us at +91 80 4123 7788 for support');
      expect(res2.hasPii).toBe(true);
      expect(res2.redactions).toContain('PHONE');
      expect(res2.scrubbedText).toBe('Reach us at [phone removed] for support');
    });

    it('removes punctuated phone numbers', () => {
      const res = scrubClarificationPii('Landline is 080-4123-7788 during work hours');
      expect(res.hasPii).toBe(true);
      expect(res.redactions).toContain('PHONE');
      expect(res.scrubbedText).toBe('Landline is [phone removed] during work hours');
    });

    it('removes GSTIN numbers', () => {
      const res = scrubClarificationPii('Tax invoice will have 29ABCDE1234F1Z5');
      expect(res.hasPii).toBe(true);
      expect(res.redactions).toContain('REGISTRATION');
      expect(res.scrubbedText).toBe('Tax invoice will have [registration removed]');
    });

    it('removes labelled PAN numbers', () => {
      const res = scrubClarificationPii('Vendor PAN: ABCDE1234F for TDS records');
      expect(res.hasPii).toBe(true);
      expect(res.redactions).toContain('REGISTRATION');
      expect(res.scrubbedText).toContain('[registration removed]');
    });

    it('removes Indian 5-space-5 mobile format when contact intent is indicated', () => {
      const res = scrubClarificationPii('Please call 98765 43210 to clarify motor specs');
      expect(res.hasPii).toBe(true);
      expect(res.redactions).toContain('PHONE');
      expect(res.scrubbedText).toBe('Please call [phone removed] to clarify motor specs');
    });

    it('detects multiple mixed PII instances accurately', () => {
      const input = 'Call 9876543210 or email sales@test.com or visit https://test.com';
      const res = scrubClarificationPii(input);
      expect(res.hasPii).toBe(true);
      expect(new Set(res.redactions)).toEqual(new Set(['EMAIL', 'LINK', 'PHONE']));
    });
  });

  describe('Preservation of Commercial & Technical Terms', () => {
    it('preserves prices and currency numbers', () => {
      const text = 'Our revised quote is Rs 42,500 including GST at 18%';
      const res = scrubClarificationPii(text);
      expect(res.hasPii).toBe(false);
      expect(res.scrubbedText).toBe(text);
    });

    it('preserves two prices in the same sentence', () => {
      const text = 'Rewinding is 45000 32000 for the two motors respectively';
      const res = scrubClarificationPii(text);
      expect(res.hasPii).toBe(false);
      expect(res.scrubbedText).toBe(text);
    });

    it('preserves model numbers, ratings and technical units', () => {
      const text = 'We propose model CRI4W1200 with 12.5 HP, 1440 RPM, 415 V, 50 Hz copper winding';
      const res = scrubClarificationPii(text);
      expect(res.hasPii).toBe(false);
      expect(res.scrubbedText).toBe(text);
    });

    it('preserves delivery timelines, dates, and warranties', () => {
      const text = 'Delivery by 12-09-2026 with 24 months warranty and 6 days lead time';
      const res = scrubClarificationPii(text);
      expect(res.hasPii).toBe(false);
      expect(res.scrubbedText).toBe(text);
    });

    it('preserves postal pin codes without contact intent', () => {
      const text = 'Delivery location is in 560095 industrial area zone';
      const res = scrubClarificationPii(text);
      expect(res.hasPii).toBe(false);
      expect(res.scrubbedText).toBe(text);
    });
  });

  describe('Pure PII Detection', () => {
    it('flags input that contains only phone number as onlyPii', () => {
      const res = scrubClarificationPii('9876543210');
      expect(res.hasPii).toBe(true);
      expect(res.onlyPii).toBe(true);
    });

    it('flags input with only email and whitespace as onlyPii', () => {
      const res = scrubClarificationPii('  test@vendor.org  ');
      expect(res.hasPii).toBe(true);
      expect(res.onlyPii).toBe(true);
    });

    it('does not flag input with real question content as onlyPii', () => {
      const res = scrubClarificationPii('What gauge wire? Call 9876543210');
      expect(res.hasPii).toBe(true);
      expect(res.onlyPii).toBe(false);
    });
  });

  describe('detectClarificationPii Helper', () => {
    it('returns preview and warning flags', () => {
      const info = detectClarificationPii('Reach out via test@company.com');
      expect(info.hasPii).toBe(true);
      expect(info.redactions).toContain('EMAIL');
      expect(info.previewScrubbed).toContain('[email removed]');
    });
  });
});

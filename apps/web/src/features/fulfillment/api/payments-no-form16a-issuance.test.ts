import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const featureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('fulfillment does not issue Form 16A', () => {
  it('does not import a Form 16A generator into the payments API', () => {
    const source = readFileSync(resolve(featureRoot, 'api/payments.ts'), 'utf8');
    expect(source).not.toContain('generateForm16ACertificate');
    expect(source).not.toContain('Form16ACertificate');
  });

  it('states that the invoice panel records TDS withholding and does not issue Form 16A', () => {
    const source = readFileSync(resolve(featureRoot, 'components/InvoicePaymentPanel.tsx'), 'utf8');
    expect(source).toContain('This panel does not issue a Form 16A certificate.');
    expect(source).not.toContain('Statutory TDS & Form 16A Withholding Panel');
  });
});

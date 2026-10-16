import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { supabase } from '@/lib/supabase';
import {
  fetchCanonicalSubscriptionPrice,
  processPilotSimulatedPurchase,
  processSubscriptionPayment,
} from './api/subscription';

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const from = supabase.from as unknown as ReturnType<typeof vi.fn>;

const clientPaymentRef = 'CLIENT-REF-2026-10-07T00:00:00.000Z';

const paymentParams = {
  organizationId: '11111111-2222-3333-4444-555555555555',
  tierId: 'INDIVIDUAL' as const,
  cycle: 'YEARLY' as const,
  amount: 1999,
  paymentRef: clientPaymentRef,
};

function extractBalanced(source: string, start: number, brace: number): string {
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unterminated block');
}

function extractPaymentFunction(source: string): string {
  const start = source.indexOf('export async function processSubscriptionPayment');
  if (start < 0) throw new Error('missing processSubscriptionPayment');
  const brace = source.indexOf('> {', start);
  if (brace < 0) throw new Error('missing processSubscriptionPayment body');
  return extractBalanced(source, start, brace + 2);
}


describe('subscription payment simulation', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('sends only owner, approved product, and idempotency key to the pilot simulator', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        attemptId: 'attempt-1',
        status: 'SUCCEEDED',
        simulated: true,
        moneyCollected: false,
        entitlementGranted: true,
        productType: 'EXTRA_RFQ',
        taxableAmount: 149,
        taxAmount: 26.82,
        grossAmount: 175.82,
        currency: 'INR',
        expiresAt: '2026-11-16T00:00:00Z',
      },
      error: null,
    });

    await expect(processPilotSimulatedPurchase({
      organizationId: null,
      productType: 'EXTRA_RFQ',
      idempotencyKey: 'pilot-once',
    })).resolves.toEqual({
      ok: true,
      purchase: {
        attemptId: 'attempt-1',
        status: 'SUCCEEDED',
        duplicate: false,
        productType: 'EXTRA_RFQ',
        entitlementExpiresAt: '2026-11-16T00:00:00Z',
        taxableAmount: 149,
        taxAmount: 26.82,
        grossAmount: 175.82,
        currency: 'INR',
      },
    });
    expect(rpc).toHaveBeenCalledWith('process_pilot_simulated_purchase', {
      p_organization_id: null,
      p_product_type: 'EXTRA_RFQ',
      p_idempotency_key: 'pilot-once',
    });
    expect(JSON.stringify(rpc.mock.calls[0])).not.toMatch(/amount|outcome|provider|success/i);
  });

  it('fails closed when the server does not confirm a simulated entitlement grant', async () => {
    rpc.mockResolvedValue({
      data: { ok: false, status: 'FAILED', simulated: true, entitlementGranted: false },
      error: null,
    });
    await expect(processPilotSimulatedPurchase({
      organizationId: '11111111-2222-3333-4444-555555555555',
      productType: 'MONTHLY_SUBSCRIPTION',
      idempotencyKey: 'failed-once',
    })).resolves.toEqual({ ok: false, error: 'FAILED' });
  });

  it('keeps the active pilot surface no-money and excludes annual purchase', () => {
    const modal = readFileSync(resolve(__dirname, 'components/SubscriptionPaymentModal.tsx'), 'utf8');
    expect(modal).toContain('Pilot simulation — no money will be collected.');
    expect(modal).toContain("'EXTRA_RFQ'");
    expect(modal).toContain("'MONTHLY_SUBSCRIPTION'");
    expect(modal).toContain('processPilotSimulatedPurchase');
    expect(modal).not.toContain('function LegacySubscriptionPaymentModal');
    expect(modal).not.toContain('handleSimulatePayment');
    expect(modal).not.toContain('processSubscriptionPayment');
    expect(modal).not.toContain("'YEARLY'");
    expect(modal).not.toMatch(/upi|qr code|wallet/i);
  });

  it('delegates activation to process_subscription_payment and maps expiry from that RPC', async () => {
    const authoritativeExpiry = '2027-04-01T00:00:00.000Z';
    rpc.mockResolvedValue({
      data: {
        ok: true,
        new_expires_at: authoritativeExpiry,
        message: 'Backend activated the plan',
      },
      error: null,
    });

    const result = await processSubscriptionPayment(paymentParams);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('process_subscription_payment', {
      p_organization_id: paymentParams.organizationId,
      p_tier: 'INDIVIDUAL',
      p_cycle: 'YEARLY',
      p_amount: 1999,
      p_payment_ref: clientPaymentRef,
      p_upi_id: 'pay@otp',
    });
    expect(from).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      newExpiresAt: authoritativeExpiry,
      message: 'Backend activated the plan',
    });
  });

  it('does not treat a client payment reference as success when the RPC refuses', async () => {
    rpc.mockResolvedValue({
      data: { ok: false, error: 'Payment refused' },
      error: null,
    });

    const result = await processSubscriptionPayment(paymentParams);

    expect(result).toEqual({ ok: false, error: 'Payment refused' });
    expect(from).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(clientPaymentRef);
  });

  it('does not fabricate an expiry when the RPC returns none', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        new_expires_at: null,
        message: 'Pilot payment request is a simulation. It does not activate or extend a subscription.',
      },
      error: null,
    });

    const result = await processSubscriptionPayment(paymentParams);

    expect(result).toEqual({
      ok: true,
      newExpiresAt: null,
      message: 'Pilot payment request is a simulation. It does not activate or extend a subscription.',
    });
    expect(from).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(clientPaymentRef);
  });

  it('does not activate locally when the payment RPC errors or returns no payload', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'function unavailable' } });
    await expect(processSubscriptionPayment(paymentParams)).resolves.toEqual({
      ok: false,
      error: 'function unavailable',
    });

    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(processSubscriptionPayment(paymentParams)).resolves.toEqual({
      ok: false,
      error: 'Payment processing failed',
    });

    expect(from).not.toHaveBeenCalled();
  });

  it('loads the payable amount from the canonical price and fails closed otherwise', async () => {
    rpc.mockResolvedValueOnce({ data: { amount: 400, currency: 'INR' }, error: null });
    await expect(fetchCanonicalSubscriptionPrice('INDIVIDUAL', 'YEARLY')).resolves.toEqual({
      ok: true,
      amount: 400,
      currency: 'INR',
    });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    await expect(fetchCanonicalSubscriptionPrice('INDIVIDUAL', 'YEARLY')).resolves.toEqual({
      ok: false,
      error: 'permission denied',
    });

    rpc.mockResolvedValueOnce({ data: { amount: 0, currency: 'INR' }, error: null });
    await expect(fetchCanonicalSubscriptionPrice('MSME', 'MONTHLY')).resolves.toEqual({
      ok: false,
      error: 'Canonical subscription price is not configured',
    });
  });

  it('does not treat a matched canonical payment as local activation', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, new_expires_at: null, entitlement_granted: false },
      error: null,
    });

    await expect(processSubscriptionPayment(paymentParams)).resolves.toEqual({
      ok: true,
      newExpiresAt: null,
      message: 'Payment matched the canonical price and did not activate a subscription.',
    });
  });

  it('keeps expiry authority on the payment RPC rather than the client reference', () => {
    const api = readFileSync(resolve(__dirname, 'api/subscription.ts'), 'utf8');
    const modal = readFileSync(resolve(__dirname, 'components/SubscriptionPaymentModal.tsx'), 'utf8');
    const paymentFn = extractPaymentFunction(api);

    const rpcCall = paymentFn.indexOf('supabase.rpc(\'process_subscription_payment\'');
    const refused = paymentFn.indexOf('if (!res || !res.ok)');
    const mappedExpiry = paymentFn.indexOf('newExpiresAt: res.new_expires_at');
    expect(rpcCall).toBeGreaterThan(-1);
    expect(refused).toBeGreaterThan(rpcCall);
    expect(mappedExpiry).toBeGreaterThan(refused);
    expect(paymentFn).toContain('p_payment_ref: params.paymentRef');
    expect(paymentFn).toContain('if (!res || !res.ok)');
    expect(paymentFn).not.toMatch(/newExpiresAt\s*:\s*params\.paymentRef/);
    expect(paymentFn).not.toMatch(/new Date\s*\(/);
    expect(paymentFn).not.toMatch(/subscription_expires_at/);
    expect(paymentFn).not.toMatch(/\.from\s*\(/);
    expect(paymentFn).not.toMatch(/entitlementGranted\s*:\s*true/);
    expect(modal).not.toContain('calculateGst');
    expect(modal).not.toContain('processSubscriptionPayment');
    expect(modal).not.toContain('handleSimulatePayment');
    expect(modal).not.toMatch(/upi|wallet/i);
  });
});

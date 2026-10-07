import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { supabase } from '@/lib/supabase';
import { processSubscriptionPayment } from './api/subscription';

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

function extractSimulateHandler(source: string): string {
  const marker = 'const handleSimulatePayment = async () =>';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('missing handleSimulatePayment');
  const brace = source.indexOf('{', start + marker.length);
  return extractBalanced(source, start, brace);
}

describe('subscription payment simulation', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
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

  it('keeps expiry authority on the payment RPC rather than the client reference', () => {
    const api = readFileSync(resolve(__dirname, 'api/subscription.ts'), 'utf8');
    const modal = readFileSync(resolve(__dirname, 'components/SubscriptionPaymentModal.tsx'), 'utf8');
    const paymentFn = extractPaymentFunction(api);
    const simulate = extractSimulateHandler(modal);

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

    const rpcAt = simulate.indexOf('processSubscriptionPayment');
    const paymentRefused = simulate.indexOf('if (!paymentResult.ok)');
    const mapped = simulate.indexOf('finalExpiresAt = paymentResult.newExpiresAt');
    const success = simulate.indexOf('setIsSuccess(true)');
    expect(rpcAt).toBeGreaterThan(-1);
    expect(paymentRefused).toBeGreaterThan(rpcAt);
    expect(mapped).toBeGreaterThan(paymentRefused);
    expect(success).toBeGreaterThan(mapped);
    expect(simulate).toContain('if (onSuccess && finalExpiresAt) onSuccess(finalExpiresAt)');
    expect(simulate).not.toMatch(/finalExpiresAt\s*=\s*paymentRef\b/);
    expect(simulate).not.toMatch(/onSuccess\s*\(\s*paymentRef\b/);
    expect(simulate).not.toMatch(/durationDays/);
    expect(simulate).not.toMatch(/subscription_expires_at/);
  });
});

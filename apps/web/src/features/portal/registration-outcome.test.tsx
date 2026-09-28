import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
    functions: { invoke: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

import { supabase } from '@/lib/supabase';
import { resolveNotificationStatus } from '@otp/domain';
import { SignupSuccess } from './components/SignupSuccess';
import { deriveRegistrationOutcome, REFERRAL_ATTRIBUTION_NOTE } from './lib/registration-outcome';
import { sendVerificationCode, submitSignupRequest, type SignupResult } from './api/signup';
import { BUYER_COPY, SUPPLIER_COPY } from './types/portal';

const mockSupabase = supabase as any;

const pending: SignupResult = {
  reference: 'REG-ABCDEF12',
  status: 'PENDING',
  alreadySubmitted: false,
  autoApproved: false,
  side: 'SUPPLIER',
  email: 'vikram@zenith.in',
};

const accepted = resolveNotificationStatus({
  channel: 'WHATSAPP',
  observation: { kind: 'HTTP_RESPONSE', httpStatus: 201, providerMessageId: 'wamid-1' },
});

function renderSuccess(result: SignupResult, side: 'BUYER' | 'SUPPLIER' = 'SUPPLIER'): string {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(SignupSuccess, {
        copy: side === 'BUYER' ? BUYER_COPY : SUPPLIER_COPY,
        result,
        onSignIn: () => {},
      }),
    ),
  );
}

describe('deriveRegistrationOutcome', () => {
  it('PENDING server status → registration created, not an active account', () => {
    const outcome = deriveRegistrationOutcome(pending, 'SUPPLIER');
    expect(outcome.accountState).toBe('REGISTRATION_CREATED');
    expect(outcome.headline).toBe('Registration created');
    expect(outcome.canSignInNow).toBe(false);
    expect(outcome.notification.status).toBe('NOT_ATTEMPTED');
  });

  it('ONBOARDED server status → account created', () => {
    const outcome = deriveRegistrationOutcome({ ...pending, status: 'ONBOARDED' }, 'BUYER');
    expect(outcome.accountState).toBe('ACCOUNT_ACTIVE');
    expect(outcome.headline).toBe('Account created');
    expect(outcome.canSignInNow).toBe(true);
    // The account's password is unusable until the activation code is redeemed.
    expect(outcome.body).toMatch(/activation code/);
    expect(outcome.body).toMatch(/Forgot password\?/);
    expect(outcome.body).not.toMatch(/sign in now/i);
  });

  it('already submitted → no new account claimed', () => {
    const outcome = deriveRegistrationOutcome({ ...pending, alreadySubmitted: true }, 'SUPPLIER');
    expect(outcome.accountState).toBe('ALREADY_REGISTERED');
    expect(outcome.body).toContain('No new account was created');
  });

  it('keeps message acceptance separate from delivery', () => {
    const outcome = deriveRegistrationOutcome({ ...pending, notification: accepted }, 'SUPPLIER');
    expect(outcome.notification.status).toBe('ACCEPTED');
    expect(outcome.notification.deliveryConfirmed).toBe(false);
    expect(outcome.notificationCopy.message).toContain('Delivery is not confirmed');
  });

  it('referral note is attribution-only with ₹0 pilot credit', () => {
    expect(REFERRAL_ATTRIBUTION_NOTE).toContain('attribution');
    expect(REFERRAL_ATTRIBUTION_NOTE).toContain('₹0');
    expect(REFERRAL_ATTRIBUTION_NOTE).not.toContain('10%');
  });
});

describe('SignupSuccess copy', () => {
  it('supplier registration: registration created + message accepted, never delivered or activated', () => {
    const html = renderSuccess({ ...pending, notification: accepted });
    expect(html).toContain('Registration created');
    expect(html).toContain('data-account-state="REGISTRATION_CREATED"');
    expect(html).toContain('Accepted by provider');
    expect(html).toContain('Delivery is not confirmed');
    expect(html).not.toMatch(/Account Activated|Auto-Approved|sent successfully/i);
    expect(html).not.toMatch(/>Delivered/);
    expect(html).not.toContain('Welcome@OTP2026!');
  });

  it('does not show a temporary password or free credit that the server did not return', () => {
    const html = renderSuccess({ ...pending, side: 'BUYER' }, 'BUYER');
    expect(html).not.toMatch(/Temporary password/i);
    expect(html).not.toContain('Welcome@OTP2026!');
    expect(html).not.toMatch(/1 Free RFQ Credit on your organisation/);
  });

  it('shows NOT_ATTEMPTED honestly when no confirmation message was requested', () => {
    const html = renderSuccess(pending);
    expect(html).toContain('data-status="NOT_ATTEMPTED"');
  });
});

describe('signup API truthfulness', () => {
  beforeEach(() => {
    mockSupabase.rpc = vi.fn();
    mockSupabase.functions = { invoke: vi.fn() };
  });

  it('submitSignupRequest does not invent free credits, and does not notify without a requestId', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: { reference: 'REG-1', status: 'PENDING' }, error: null });
    const res = await submitSignupRequest({
      side: 'SUPPLIER',
      businessName: 'Zenith',
      contactFirstName: 'V',
      contactLastName: 'P',
      email: 'v@z.in',
      phone: '+919876543211',
      verificationChannel: 'WHATSAPP',
      referralCode: 'OTP-D4E5F6',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.freeRfqCredits).toBeUndefined();
      expect(res.result.status).toBe('PENDING');
      // No requestId in the RPC response → no guaranteed notice was requested.
      expect(res.result.notification).toBeUndefined();
    }
    expect(mockSupabase.rpc.mock.calls[0][1].p_request.referral_code).toBe('OTP-D4E5F6');
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('submitSignupRequest asks onboarding-notify for a guaranteed notice once a requestId comes back', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { reference: 'REG-1', requestId: 'req-1', status: 'PENDING', already_submitted: false },
      error: null,
    });
    mockSupabase.functions.invoke.mockResolvedValue({ data: { ok: true, status: 'SUBMITTED' }, error: null });
    const res = await submitSignupRequest({
      side: 'SUPPLIER',
      businessName: 'Zenith',
      contactFirstName: 'V',
      contactLastName: 'P',
      email: 'v@z.in',
      phone: '+919876543211',
      verificationChannel: 'EMAIL',
    });
    expect(res.ok).toBe(true);
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
      'onboarding-notify',
      expect.objectContaining({ body: { requestId: 'req-1', kind: 'SUBMITTED' } }),
    );
    if (res.ok) {
      expect(res.result.notification?.status).toBe('SUBMITTED');
    }
  });

  it('a self-provisioned registration asks onboarding-notify for the activation code, not the received notice', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: {
        reference: 'REG-2',
        requestId: 'req-2',
        status: 'ONBOARDED',
        already_submitted: false,
        auto_approved: true,
        activation_required: true,
      },
      error: null,
    });
    mockSupabase.functions.invoke.mockResolvedValue({ data: { ok: true, status: 'SUBMITTED' }, error: null });
    const res = await submitSignupRequest({
      side: 'BUYER',
      businessName: 'Self',
      contactFirstName: 'I',
      contactLastName: 'R',
      email: 'i@r.in',
      phone: '+919876543212',
      verificationChannel: 'WHATSAPP',
      buyerType: 'INDIVIDUAL',
    });
    expect(res.ok).toBe(true);
    expect(mockSupabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
      'onboarding-notify',
      expect.objectContaining({ body: { requestId: 'req-2', kind: 'APPROVED' } }),
    );
    if (res.ok) {
      expect(res.result.autoApproved).toBe(true);
      expect(deriveRegistrationOutcome(res.result, 'BUYER').accountState).toBe('ACCOUNT_ACTIVE');
    }
  });

  it('a registration routed to admin review never requests an activation code', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { reference: 'REG-3', requestId: 'req-3', status: 'PENDING', already_submitted: false, auto_approved: false },
      error: null,
    });
    mockSupabase.functions.invoke.mockResolvedValue({ data: { ok: true, status: 'SUBMITTED' }, error: null });
    await submitSignupRequest({
      side: 'SUPPLIER',
      businessName: 'Zenith',
      contactFirstName: 'V',
      contactLastName: 'P',
      email: 'v2@z.in',
      phone: '+919876543213',
      verificationChannel: 'EMAIL',
    });
    const kinds = mockSupabase.functions.invoke.mock.calls.map((c: unknown[]) => (c[1] as { body: { kind: string } }).body.kind);
    expect(kinds).toEqual(['SUBMITTED']);
  });

  it('sendVerificationCode fails closed when the server cannot issue a code (no fallback code)', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({ data: { ok: false, error: 'function does not exist' }, error: null });
    const res = await sendVerificationCode('WHATSAPP', { email: 'v@z.in', phone: '9876543211' });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain('123456');
  });

  it('email verification: no error from Supabase is SUBMITTED, not delivered', async () => {
    mockSupabase.auth = { ...(mockSupabase.auth || {}), signInWithOtp: vi.fn().mockResolvedValue({ error: null }) };
    const res = await sendVerificationCode('EMAIL', { email: 'v@z.in', phone: '' });
    expect(res.ok).toBe(true);
    expect(res.delivery?.status).toBe('SUBMITTED');
  });
});

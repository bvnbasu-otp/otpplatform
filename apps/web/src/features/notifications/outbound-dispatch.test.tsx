import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveNotificationStatus } from '@otp/domain';
import { resolveSupabaseEmailDispatch, sanitizeToAscii } from './lib/outbound-dispatch';
import { NotificationDeliveryNotice } from './components/NotificationDeliveryNotice';

/**
 * D-21/A-30: this file used to test a browser-side `/waha` fetch
 * (`dispatchWhatsAppText`) that only ever worked in dev/preview. All
 * WhatsApp/SMS sending is now server-side only (see the `otp-dispatch` and
 * `onboarding-notify` edge functions, exercised via manual trace in the
 * absence of a Deno test runner in this environment). What remains
 * client-side — and still tested here — is the Supabase Auth email-dispatch
 * status mapping and the ASCII sanitizer, both still used by client code
 * that sends nothing itself.
 */

describe('helpers', () => {
  it('Supabase email: no error → SUBMITTED, error → FAILED', () => {
    expect(resolveSupabaseEmailDispatch(null).status).toBe('SUBMITTED');
    expect(resolveSupabaseEmailDispatch({ message: 'rate limit', status: 429 }).status).not.toBe('SUBMITTED');
    expect(resolveSupabaseEmailDispatch({ message: 'invalid email', status: 400 }).status).toBe('FAILED');
  });

  it('sanitizeToAscii strips non-ASCII punctuation to safe equivalents', () => {
    expect(sanitizeToAscii('\u2018Hello\u2019 \u2014 \u20B95')).toBe("'Hello' - Rs. 5");
  });
});

describe('NotificationDeliveryNotice', () => {
  it('renders the status label and truthful copy for an accepted send', () => {
    const resolution = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'HTTP_RESPONSE', httpStatus: 201, providerMessageId: 'wamid-1' },
    });
    const html = renderToStaticMarkup(
      React.createElement(NotificationDeliveryNotice, { resolution, purpose: 'REGISTRATION' }),
    );
    expect(html).toContain('data-status="ACCEPTED"');
    expect(html).toContain('Accepted by provider');
    expect(html).toContain('Delivery is not confirmed');
    expect(html).not.toMatch(/sent successfully|Delivered:/i);
  });

  it('never reports DELIVERED from a synchronous send observation', () => {
    const resolution = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'HTTP_RESPONSE', httpStatus: 200, providerMessageId: 'x' },
    });
    expect(resolution.status).not.toBe('DELIVERED');
  });

  it('a failed send is reported as FAILED, not swallowed', () => {
    const resolution = resolveNotificationStatus({
      channel: 'WHATSAPP',
      observation: { kind: 'HTTP_RESPONSE', httpStatus: 400, errorMessage: 'bad request' },
    });
    expect(resolution.status).toBe('FAILED');
  });
});

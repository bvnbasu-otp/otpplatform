import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReferAndEarnCard } from './components/ReferAndEarnCard';
import { resolveReferralCode } from './lib/referral-code-storage';
import {
  generatePersistentReferralCode,
  generateReferralUrl,
  generateWhatsAppShareUrl,
  clearPersistentReferralCodeStore,
  generateSecureRandomReferralCode,
} from '@/features/subscription';

describe('ReferAndEarnCard Component & Sharing Workflow (Pre-R2-30 Invariants)', () => {
  it('instantiates ReferAndEarnCard component cleanly', () => {
    const element = React.createElement(ReferAndEarnCard, {
      identifier: 'org-test-123',
      orgName: 'Greenwood Residency RWA',
      side: 'buyer',
    });
    expect(element).toBeDefined();
    expect(element.type).toBe(ReferAndEarnCard);
  });

  it('instantiates ReferAndEarnCard compact variant cleanly', () => {
    const element = React.createElement(ReferAndEarnCard, {
      identifier: 'org-test-compact',
      orgName: 'Compact Business',
      side: 'supplier',
      compact: true,
    });
    expect(element).toBeDefined();
    expect(element.props.compact).toBe(true);
  });

  it('generates persistent random referral code and reuses across calls for same identifier', () => {
    clearPersistentReferralCodeStore();
    const codeA = generatePersistentReferralCode('org-test-123', 'OTP');
    const codeB = generatePersistentReferralCode('org-test-123', 'OTP');
    expect(codeA).toBe(codeB);
    expect(codeA.startsWith('OTP-')).toBe(true);

    // Different identifier gets a distinct random code (not deterministic hash)
    const codeOther = generatePersistentReferralCode('org-test-456', 'OTP');
    expect(codeOther).not.toBe(codeA);
  });

  it('preserves existing valid referral code when passed', () => {
    const existing = 'OTP-9K8M7N';
    const code = generatePersistentReferralCode(existing, 'OTP');
    expect(code).toBe('OTP-9K8M7N');
  });

  it('constructs correct referral URL with parameters', () => {
    const code = generatePersistentReferralCode('org-test-123', 'OTP');
    const url = generateReferralUrl(code, 'https://otp.market', 'buyer');
    expect(url).toBe(`https://otp.market/signup?ref=${code}&side=buyer`);
  });

  it('constructs direct user-driven WhatsApp share link', () => {
    const code = generatePersistentReferralCode('org-test-123', 'OTP');
    const referralUrl = generateReferralUrl(code, 'https://otp.market', 'buyer');
    const whatsappUrl = generateWhatsAppShareUrl({
      referralUrl,
      referralCode: code,
      source: 'web_dashboard',
    });

    expect(whatsappUrl.startsWith('https://api.whatsapp.com/send?text=')).toBe(true);
    expect(whatsappUrl).toContain(encodeURIComponent(code));
    expect(whatsappUrl).toContain(encodeURIComponent(referralUrl));
    expect(whatsappUrl).not.toContain('phone=');
  });
});

function decodeHtml(html: string): string {
  return html.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

describe('ReferAndEarnCard rendered referral message and pilot credit (issue 04)', () => {
  it('WhatsApp share link carries the exact approved referral message', () => {
    clearPersistentReferralCodeStore();
    const html = renderToStaticMarkup(
      React.createElement(ReferAndEarnCard, { identifier: 'org-render-1', side: 'buyer' }),
    );
    const code = generatePersistentReferralCode('org-render-1', 'OTP');
    const url = `https://otp.market/signup?ref=${code}&side=buyer`;
    const expected = `Hi, I'm using OTP for competitive procurement and really impressed with it. You can try it out and get started with my referral code: ${code} - ${url}`;

    const href = decodeHtml(html.match(/href="(https:\/\/api\.whatsapp\.com\/send[^"]*)"/)![1]!);
    expect(new URL(href).searchParams.get('text')).toBe(expected);
    expect(html).toContain(code);
  });

  it('shows ₹0 pilot credit and never advertises a 10% wallet reward', () => {
    for (const compact of [false, true]) {
      const html = decodeHtml(
        renderToStaticMarkup(React.createElement(ReferAndEarnCard, { identifier: 'org-render-2', compact })),
      );
      expect(html).toContain('₹0.00');
      expect(html).not.toContain('10%');
      expect(html).not.toMatch(/Earn 10|Receive 10/);
    }
    const full = decodeHtml(renderToStaticMarkup(React.createElement(ReferAndEarnCard, { identifier: 'org-render-2' })));
    expect(full).toContain('no monetary or wallet credit is issued during the pilot (₹0)');
  });

  it('keeps hostile identifiers out of the rendered code and link', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReferAndEarnCard, { identifier: '"><script>alert(1)</script>&side=admin', side: 'buyer' }),
    );
    expect(html).not.toContain('<script>');
    const href = decodeHtml(html.match(/href="(https:\/\/api\.whatsapp\.com\/send[^"]*)"/)![1]!);
    const text = new URL(href).searchParams.get('text')!;
    const sharedLink = new URL(text.slice(text.lastIndexOf(' - ') + 3));
    expect(sharedLink.searchParams.get('side')).toBe('buyer');
    expect(sharedLink.searchParams.get('ref')).toMatch(/^OTP-[A-Z0-9]{6}$/);
  });
});

describe('resolveReferralCode device persistence', () => {
  function memoryStorage() {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
  }

  it('reuses the stored code for the same identifier', () => {
    clearPersistentReferralCodeStore();
    const storage = memoryStorage();
    const first = resolveReferralCode('5b1f0c2e-7d7a-4c1e-9d55-0a1b2c3d4e5f', storage);
    clearPersistentReferralCodeStore();
    expect(resolveReferralCode('5b1f0c2e-7d7a-4c1e-9d55-0a1b2c3d4e5f', storage)).toBe(first);
    expect(first).toMatch(/^OTP-[A-Z0-9]{6}$/);
  });

  it('ignores a tampered stored value and replaces it with a fresh code', () => {
    const storage = memoryStorage();
    storage.setItem('otp.referral-code.v1:9e8d7c6b-1a2b-4c3d-8e9f-a0b1c2d3e4f5', 'OTP-{url}$&');
    const code = resolveReferralCode('9e8d7c6b-1a2b-4c3d-8e9f-a0b1c2d3e4f5', storage);
    expect(code).toMatch(/^OTP-[A-Z0-9]{6}$/);
    expect(storage.map.get('otp.referral-code.v1:9e8d7c6b-1a2b-4c3d-8e9f-a0b1c2d3e4f5')).toBe(code);
  });

  it('works without storage', () => {
    expect(resolveReferralCode('00000000-1111-4222-8333-444444444444', null)).toMatch(/^OTP-[A-Z0-9]{6}$/);
  });
});

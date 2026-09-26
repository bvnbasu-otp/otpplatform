import React from 'react';
import { describe, it, expect } from 'vitest';
import { ReferAndEarnCard } from './components/ReferAndEarnCard';
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

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ReferAndEarnCard } from './components/ReferAndEarnCard';
import {
  generatePersistentReferralCode,
  generateReferralUrl,
  generateWhatsAppShareUrl,
} from '@/features/subscription';

describe('ReferAndEarnCard Component & Sharing Workflow', () => {
  it('instantiates ReferAndEarnCard component cleanly', () => {
    const element = React.createElement(ReferAndEarnCard, {
      identifier: 'org-test-123',
      orgName: 'Greenwood Residency RWA',
      side: 'buyer',
    });
    expect(element).toBeDefined();
    expect(element.type).toBe(ReferAndEarnCard);
  });

  it('generates deterministic persistent referral code', () => {
    const codeA = generatePersistentReferralCode('org-test-123', 'OTP');
    const codeB = generatePersistentReferralCode('org-test-123', 'OTP');
    expect(codeA).toBe(codeB);
    expect(codeA.startsWith('OTP-')).toBe(true);
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
  });
});

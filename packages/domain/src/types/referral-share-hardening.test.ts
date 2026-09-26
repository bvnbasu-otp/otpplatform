import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_REFERRAL_SHARE_MESSAGE,
  REFERRAL_CODE_ALPHABET,
  buildReferralShareMessage,
  calculateReferralReward,
  generateReferralUrl,
  generateSecureRandomReferralCode,
  generateWhatsAppShareUrl,
  getReferralCreditDisplay,
  getReferralWebShareData,
  sanitizeReferralCode,
  sanitizeReferralOrigin,
} from './referral-incentive';

const EXACT_TEMPLATE =
  "Hi, I'm using OTP for competitive procurement and really impressed with it. You can try it out and get started with my referral code: {code} - {url}";

afterEach(() => {
  vi.restoreAllMocks();
});

describe('referral share message (issue 04)', () => {
  it('uses the exact approved copy', () => {
    expect(DEFAULT_REFERRAL_SHARE_MESSAGE).toBe(EXACT_TEMPLATE);
    const url = 'https://otp.market/signup?ref=OTP-ABC234&side=buyer';
    expect(buildReferralShareMessage('OTP-ABC234', url)).toBe(
      "Hi, I'm using OTP for competitive procurement and really impressed with it. You can try it out and get started with my referral code: OTP-ABC234 - https://otp.market/signup?ref=OTP-ABC234&side=buyer",
    );
  });

  it('WhatsApp text and Web Share text are both the exact message', () => {
    const url = generateReferralUrl('OTP-ABC234', 'https://otp.market', 'buyer');
    const wa = new URL(generateWhatsAppShareUrl({ referralCode: 'OTP-ABC234', referralUrl: url }));
    expect(wa.origin + wa.pathname).toBe('https://api.whatsapp.com/send');
    expect(wa.searchParams.get('text')).toBe(buildReferralShareMessage('OTP-ABC234', url));
    expect(getReferralWebShareData({ referralCode: 'OTP-ABC234', referralUrl: url }).text).toBe(
      buildReferralShareMessage('OTP-ABC234', url),
    );
  });

  it('a hostile code cannot inject tokens, $-patterns, separators or new query params', () => {
    const hostile = 'OTP-{url}$&$`\n&side=admin#frag<script>';
    const code = sanitizeReferralCode(hostile);
    expect(code).toMatch(/^[A-Z0-9_-]{4,32}$/);

    const url = generateReferralUrl(hostile, 'https://otp.market', 'buyer');
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://otp.market');
    expect(parsed.pathname).toBe('/signup');
    expect([...parsed.searchParams.keys()]).toEqual(['ref', 'side']);
    expect(parsed.searchParams.get('side')).toBe('buyer');
    expect(parsed.hash).toBe('');

    const msg = buildReferralShareMessage(hostile, url);
    expect(msg).not.toContain('{url}');
    expect(msg).not.toContain('$&');
    expect(msg).not.toContain('<script>');
    expect(msg.split(url).length - 1).toBe(1);
  });

  it('hostile origin values fall back to the default origin', () => {
    for (const origin of ['javascript:alert(1)', 'data:text/html,x', 'not a url', 'ftp://evil.example', '']) {
      expect(sanitizeReferralOrigin(origin)).toBe('https://otp.market');
    }
    const url = new URL(generateReferralUrl('OTP-ABC234', 'https://user:pw@evil.example/path?x=1#y'));
    expect(url.origin).toBe('https://evil.example');
    expect(url.username).toBe('');
    expect(url.pathname).toBe('/signup');
    expect(url.search).toBe('?ref=OTP-ABC234');
  });

  it('hostile side values are dropped', () => {
    const url = new URL(generateReferralUrl('OTP-ABC234', 'https://otp.market', 'buyer&ref=EVIL'));
    expect(url.searchParams.getAll('ref')).toEqual(['OTP-ABC234']);
    expect(url.searchParams.has('side')).toBe(false);
  });

  it('a non-http referralUrl passed by a caller is replaced by a generated one', () => {
    const wa = new URL(
      generateWhatsAppShareUrl({ referralCode: 'OTP-ABC234', referralUrl: 'javascript:alert(1)', origin: 'https://otp.market' }),
    );
    const text = wa.searchParams.get('text') ?? '';
    expect(text).not.toContain('javascript:');
    expect(text).toContain('https://otp.market/signup?ref=OTP-ABC234');
  });
});

describe('referral code generation uses CSPRNG only', () => {
  it('calls crypto.getRandomValues and never Math.random', () => {
    const cryptoSpy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const mathSpy = vi.spyOn(Math, 'random');
    const code = generateSecureRandomReferralCode('OTP');
    expect(cryptoSpy).toHaveBeenCalled();
    expect(mathSpy).not.toHaveBeenCalled();
    expect(code).toMatch(new RegExp(`^OTP-[${REFERRAL_CODE_ALPHABET}]{6}$`));
  });

  it('uses only the unambiguous alphabet and the requested length', () => {
    for (let i = 0; i < 200; i++) {
      const body = generateSecureRandomReferralCode('OTP', 8).slice(4);
      expect(body).toHaveLength(8);
      for (const ch of body) expect(REFERRAL_CODE_ALPHABET).toContain(ch);
      expect(body).not.toMatch(/[01IO]/);
    }
  });

  it('refuses to generate when no secure random source exists (no Math.random fallback)', () => {
    const original = globalThis.crypto;
    const mathSpy = vi.spyOn(Math, 'random');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    try {
      expect(() => generateSecureRandomReferralCode('OTP')).toThrow(/Secure random source/);
      expect(mathSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true, writable: true });
    }
  });
});

describe('pilot referral credit stays ₹0', () => {
  it('display helper reports ₹0 monetary credit in the pilot', () => {
    const display = getReferralCreditDisplay();
    expect(display.mode).toBe('PILOT_SANDBOX');
    expect(display.monetaryCreditAmount).toBe(0);
    expect(display.formattedMonetaryCredit).toBe('₹0.00');
  });

  it('pilot reward calculation keeps wallet/monetary credit at 0 and no liability', () => {
    const r = calculateReferralReward({
      referrerId: 'a',
      referredId: 'b',
      attributionDate: '2026-09-01T00:00:00Z',
      paymentDate: '2026-09-05T00:00:00Z',
      subscriptionPaidAmount: 1999,
      isFirstSuccessfulPayment: true,
      isPilotMode: true,
    });
    expect(r.walletMonetaryCredit).toBe(0);
    expect(r.monetaryCreditAmount).toBe(0);
    expect(r.rewardAmount).toBe(0);
    expect(r.financialLiabilityRecognized).toBe(false);
    expect(r.financialReportingScope).toBe('PILOT_SANDBOX');
  });
});

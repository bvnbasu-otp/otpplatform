import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OtpWalletCreditsWidget } from './components/OtpWalletCreditsWidget';

describe('OtpWalletCreditsWidget persona visibility', () => {
  it('renders buyer Success Cashback categories only for buyer persona', () => {
    const html = renderToStaticMarkup(
      <OtpWalletCreditsWidget persona="BUYER" organizationId={undefined} balanceCredits={0} />,
    );
    expect(html).toContain('data-wallet-persona="BUYER"');
    expect(html).toContain('Success Cashback');
    expect(html).toContain('Not credited during this pilot.');
    expect(html).toContain('OTP subscription renewal');
    expect(html).not.toContain('0.1%');
    expect(html).not.toContain('Share-in-Success');
    expect(html).not.toContain('platform fees');
    expect(html).not.toContain('Supplier Cashback');
    expect(html).not.toContain('Share in Success');
  });

  it('renders supplier referral and success reward only for supplier persona', () => {
    const html = renderToStaticMarkup(
      <OtpWalletCreditsWidget persona="SUPPLIER" organizationId={undefined} balanceCredits={0} />,
    );
    expect(html).toContain('data-wallet-persona="SUPPLIER"');
    expect(html).toContain('Success Reward');
    expect(html).toContain('Defined as ₹100');
    expect(html).toContain('not credited');
    expect(html).not.toContain('Success Cashback');
    expect(html).not.toContain('Supplier Cashback');
    expect(html).not.toContain('Share in Success');
    expect(html).not.toContain('platform fees');
  });
});

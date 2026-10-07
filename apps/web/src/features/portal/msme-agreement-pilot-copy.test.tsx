import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileMsmeAgreementMarkdown } from '@otp/domain';
import { MsmeRegistrationAgreementModal } from './components/MsmeRegistrationAgreementModal';

describe('MSME agreement pilot copy', () => {
  it('shows the defined fee as uncharged in the pilot and rejects cashback accounting claims', () => {
    const html = renderToStaticMarkup(
      <MsmeRegistrationAgreementModal
        isOpen
        onClose={() => undefined}
        onAccept={() => undefined}
        businessName="Apex Workshops"
        primaryOfficerName="Ramesh Sharma"
      />,
    );

    expect(html).toContain('0.50% of the purchase-order gross, plus 18% GST on that fee');
    expect(html).toContain('During this pilot OTP does not charge that fee');
    expect(html).toContain('Supplier cashback is not a product');
    expect(html).toContain('Anti-Self-Approval');
    expect(html).not.toContain('OTP charges an institutional platform fee');
    expect(html).not.toContain('Double-Entry GAAP');
    expect(html).not.toContain('Cashback, Referral Bonus, Share in Success');

    const markdown = compileMsmeAgreementMarkdown({
      organizationId: 'org-msme-apex-901',
      businessName: 'Apex Workshops',
      businessType: 'PROPRIETORSHIP',
      primaryOfficerName: 'Ramesh Sharma',
      primaryOfficerEmail: 'ramesh@example.com',
      primaryOfficerPhone: '+91 98000 00000',
      registeredAddress: 'Plot 42',
      operationalAddress: 'Plot 42',
      acceptedAt: '2026-10-07T00:00:00.000Z',
      electronicAcceptanceHash: 'SHA256:TEST',
      effectiveDate: '2026-10-07',
    });
    expect(markdown).toContain('does not credit Success Cashback or a share of the platform fee');
    expect(markdown).not.toContain('OTP charges a platform service fee');
  });
});
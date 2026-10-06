import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(join(src, rel), 'utf8');

describe('F-10: Enterprise is not offered as a customer type', () => {
  it('Get Started names Individuals, RWAs and MSMEs only', () => {
    const modal = read('features/portal/components/QuickRegisterModal.tsx');
    expect(modal).toContain('For Individuals, RWAs &amp; MSMEs');
    expect(modal).not.toMatch(/enterprise/i);
  });

  it('buyer registration keeps the MSME value but labels it without Enterprise', () => {
    const form = read('features/portal/components/BuyerRegisterForm.tsx');
    expect(form).toContain("{ value: 'MSME', label: 'Business / MSME' }");
    expect(form).not.toContain("label: 'Business / MSME Enterprise'");
    expect(form).not.toMatch(/organisation \|\| 'Commercial Enterprise'/);
  });

  it('customer-visible buyer, governance and support copy does not offer Enterprise', () => {
    expect(read('features/intake/components/Tier3SourcingControlsCard.tsx')).not.toMatch(/RWA \/ Enterprise/);
    expect(read('features/profile/pages/ProfilePage.tsx')).not.toMatch(/Institution, and Enterprise/);
    expect(read('features/support/components/SupportHelpButtonModal.tsx')).not.toMatch(/Enterprise fleet/);
    expect(read('pages/SupplierDashboardPage.tsx')).not.toMatch(/Enterprises`/);
  });
});

describe('F-11: WhatsApp and SMS supplier delivery is not claimed as live', () => {
  it('customer-facing surfaces do not promise WhatsApp/SMS delivery or replying with a price', () => {
    const surfaces = [
      'features/site/pages/AboutPage.tsx',
      'features/portal/components/QuickRegisterModal.tsx',
      'features/portal/components/SupplierRegisterForm.tsx',
      'features/quick-quote/pages/QuickQuotePage.tsx',
      'components/mobile-showcase/MobileScreensShowcase.tsx',
      'components/mobile-showcase/MobileMultiDeviceGallery.tsx',
    ].map(read).join('\n');

    expect(surfaces).not.toMatch(/Suppliers can reply on WhatsApp/);
    expect(surfaces).not.toMatch(/Sends sealed requests on WhatsApp or SMS/);
    expect(surfaces).not.toMatch(/Dispatches quotes to local suppliers on WhatsApp/);
    expect(surfaces).not.toMatch(/Suppliers invited on WhatsApp/);
    expect(surfaces).not.toMatch(/WhatsApp RFQ alerts/);
    expect(surfaces).not.toMatch(/reply with a new price/);
    expect(surfaces).not.toMatch(/8 Sent/);
  });
});

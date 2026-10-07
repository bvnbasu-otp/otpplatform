import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QuickRegisterModal } from './components/QuickRegisterModal';

describe('QuickRegisterModal pilot copy', () => {
  it('registers a supplier without calling the account GST-verified or promising settlement', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <QuickRegisterModal open onClose={() => undefined} />
      </MemoryRouter>,
    );

    expect(html).toContain('signup?side=supplier');
    expect(html).toContain('Register as Supplier');
    expect(html).toContain('For suppliers, fabricators, and service providers');
    expect(html).toContain('0.50% platform fee is defined and is not charged during this pilot');
    expect(html).toContain('does not make an instant bank settlement');
    expect(html).toContain('For Individuals, RWAs');
    expect(html).not.toContain('Register as Verified Supplier');
    expect(html).not.toContain('Verified Vendors');
    expect(html).not.toContain('GST_VERIFIED');
    expect(html).not.toContain('₹0 Free Forever');
    expect(html).not.toContain('Zero commissions');
    expect(html).not.toContain('instant bank settlements');
  });
});

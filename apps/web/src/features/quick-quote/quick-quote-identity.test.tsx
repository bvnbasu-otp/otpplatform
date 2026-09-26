import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { findSupplierFacingBuyerIdentityLeaks } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import { fetchQuickQuoteContext, toSupplierFacingQuickQuoteRfq } from './api/quick-quote';
import { QuickQuoteForm } from './pages/QuickQuotePage';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

const BUYER_ORG = 'Greenview Apartments RWA';
const BUYER_EMAIL = 'secretary@greenview-rwa.in';
const BUYER_PHONE = '9845012345';
const BUYER_STREET = '14 Sarjapur Main Road';

/** messaging_quote_context as it returns for an OPEN_RFQ today, plus extra identity fields. */
function leakyContextPayload() {
  return {
    outcome: 'OK',
    expiresAt: '2026-09-30T00:00:00Z',
    quote: null,
    rfq: {
      publicRef: 'ENQ-2026-0101',
      alias: 'Supplier #01',
      title: `Cement for tower B, call ${BUYER_PHONE}`,
      category: 'Construction Materials',
      subcategory: 'Cement',
      quantity: 40,
      unit: 'bags',
      location: 'Coimbatore',
      requiredByDays: 5,
      quoteDeadline: '2026-09-29T12:00:00Z',
      minQuotes: 3,
      buyerDisplay: BUYER_ORG,
      isDemo: false,
      contact_email: BUYER_EMAIL,
      address: BUYER_STREET,
      organization_id: 'org-greenview',
    },
  };
}

describe('Quick-quote page never shows the buyer pre-award', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset();
  });

  it('replaces the server buyerDisplay and drops unknown identity fields', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: leakyContextPayload(), error: null } as any);

    const res = await fetchQuickQuoteContext('sess-1');

    expect(supabase.rpc).toHaveBeenCalledWith('messaging_quote_context', { p_session_token: 'sess-1' });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected context');
    const serialized = JSON.stringify(res.value.rfq);
    for (const leak of [BUYER_ORG, 'Greenview', BUYER_EMAIL, BUYER_PHONE, BUYER_STREET, 'org-greenview']) {
      expect(serialized).not.toContain(leak);
    }
    expect(res.value.rfq.buyerDisplay).toBe('Identity protected');
    expect(findSupplierFacingBuyerIdentityLeaks(res.value.rfq)).toEqual([]);
    expect(res.value.rfq.quantity).toBe(40);
    expect(res.value.rfq.location).toBe('Coimbatore');
    expect(res.value.rfq.publicRef).toBe('ENQ-2026-0101');
  });

  it('keeps only the allow-listed enquiry fields', () => {
    const rfq = toSupplierFacingQuickQuoteRfq(leakyContextPayload().rfq);
    expect(Object.keys(rfq).sort()).toEqual(
      [
        'alias', 'buyerDisplay', 'category', 'isDemo', 'location', 'minQuotes', 'publicRef',
        'quantity', 'quoteDeadline', 'requiredByDays', 'subcategory', 'title', 'unit',
      ].sort(),
    );
  });

  it('renders qty, location and the shared shield, but no buyer identity', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: leakyContextPayload(), error: null } as any);
    const res = await fetchQuickQuoteContext('sess-1');
    if (!res.ok) throw new Error('expected context');

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <QuickQuoteForm
          context={res.value}
          sessionToken="sess-1"
          onSubmitted={() => undefined}
          onFailure={() => undefined}
        />
      </MemoryRouter>,
    );

    for (const leak of [BUYER_ORG, 'Greenview', BUYER_EMAIL, BUYER_PHONE, BUYER_STREET]) {
      expect(markup).not.toContain(leak);
    }
    expect(markup).toContain('40 bags');
    expect(markup).toContain('Coimbatore');
    expect(markup).toContain('Identity protected');
    expect(markup).toContain('data-testid="identity-protected-shield"');
  });
});

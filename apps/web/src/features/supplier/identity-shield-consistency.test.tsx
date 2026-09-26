import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { IDENTITY_PROTECTED_RFQ_DESCRIPTION, IDENTITY_PROTECTED_RFQ_LABEL } from '@/lib/brand';
import { IdentityProtectedShield } from './components/IdentityProtectedShield';
import { SupplierRequirementPanel } from './components/SupplierRequirementPanel';
import {
  IDENTITY_SHIELD_EXPLANATION,
  IDENTITY_SHIELD_LABEL,
  PROTECTED_BUYER_LABEL,
} from './lib/identity-shield';
import type { SupplierRfqDetail } from './types/supplier-quote';

// renderToStaticMarkup escapes apostrophes/ampersands; the brand copy has '&'.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LABEL_HTML = escapeHtml(IDENTITY_SHIELD_LABEL);
const EXPLANATION_HTML = escapeHtml(IDENTITY_SHIELD_EXPLANATION);

function detail(): SupplierRfqDetail {
  return {
    invitationId: 'inv-1',
    rfqId: 'rfq-1',
    publicRef: 'ENQ-2026-0042',
    anonymousLabel: 'Supplier #01',
    status: 'VIEWED',
    invitedAt: '2026-09-20T08:00:00Z',
    rfqTitle: 'Rewind 7.5 HP motor',
    rfqStatus: 'OPEN',
    quoteDeadline: new Date(Date.now() + 86400000).toISOString(),
    buyerDisplayName: PROTECTED_BUYER_LABEL,
    buyerAnonymous: true,
    sourcingMode: 'IDENTITY_PROTECTED',
    minQuotesRequired: 3,
    description: 'Winding burnt.',
    category: 'Electrical',
    subcategory: 'Motor rewinding',
    requirementMode: null,
    quantity: 1,
    unit: 'unit',
    attributes: { hp: 7.5 },
    quality: {},
    commercial: {},
    requiredByMode: 'WITHIN_DAYS',
    requiredByDays: 5,
    requiredByDate: null,
    fulfilmentMode: 'SUPPLIER_ONSITE',
    deliveryCity: 'Coimbatore',
    evaluationWeights: {},
  };
}

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

describe('Identity-Protected shield: one component, one wording', () => {
  it('uses the platform label and explanation from brand.ts', () => {
    expect(IDENTITY_SHIELD_LABEL).toBe(IDENTITY_PROTECTED_RFQ_LABEL);
    expect(IDENTITY_SHIELD_EXPLANATION).toBe(IDENTITY_PROTECTED_RFQ_DESCRIPTION);
    expect(IDENTITY_SHIELD_LABEL).toContain('Identity-Protected');
    expect(`${IDENTITY_SHIELD_LABEL} ${IDENTITY_SHIELD_EXPLANATION}`).not.toMatch(
      /\b(bid|bids|bidder|bidding|blind)\b/i,
    );
  });

  it('renders the same label and explanation in every variant', () => {
    for (const variant of ['banner', 'badge', 'note'] as const) {
      const markup = renderToStaticMarkup(<IdentityProtectedShield variant={variant} />);
      expect(markup).toContain('data-testid="identity-protected-shield"');
      expect(markup).toContain(LABEL_HTML);
      // The badge carries the explanation as its tooltip.
      expect(markup).toContain(EXPLANATION_HTML);
    }
  });

  it('the supplier RFQ view renders the shared shield, not bespoke copy', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <SupplierRequirementPanel rfq={detail()} />
      </MemoryRouter>,
    );
    expect(markup).toContain('data-testid="identity-protected-shield"');
    expect(markup).toContain(EXPLANATION_HTML);
    expect(markup).toContain(`Buyer: ${PROTECTED_BUYER_LABEL}`);
  });

  it('supplier-facing surfaces use the shared shield and no retired wording', () => {
    const files = [
      './components/SupplierRequirementPanel.tsx',
      './components/SupplierInvitationList.tsx',
      './pages/SupplierRfqPage.tsx',
      '../quick-quote/pages/QuickQuotePage.tsx',
      '../home/components/SupplierOpportunityCard.tsx',
    ];
    const retired = [
      'Buyer Identity Protected',
      'Anonymous Sealed Evaluation',
      'Identity Sealed',
      'Verified Buyer',
      'Identity and terms protected',
      'Palm Meadows',
      'inv.buyerDisplayName',
      'rfq.buyerDisplay',
    ];
    for (const file of files) {
      const text = source(file);
      expect(text, file).toContain('IdentityProtectedShield');
      for (const phrase of retired) {
        expect(text, `${file} still contains "${phrase}"`).not.toContain(phrase);
      }
    }
  });
});

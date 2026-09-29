import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrganizationCharterPanel } from './components/OrganizationCharterPanel';
import { resolveOrganizationCharter, CHARTER_ACCEPTANCE_NOTE } from './lib/organization-charter';

describe('resolveOrganizationCharter', () => {
  it('RWA charter includes committee quorum, non-voting managers, terms and common clauses', () => {
    const charter = resolveOrganizationCharter('RWA');
    const ids = charter.clauses.map((c) => c.id);
    expect(charter.persona).toBe('RWA');
    expect(ids).toEqual(
      expect.arrayContaining([
        'committee-quorum',
        'manager-non-voting',
        'role-terms',
        'anti-self-approval',
        'audit-attribution',
        'direct-contracting',
        'financial-separation',
        'wallet-referrals',
        'buyer-success-cashback',
      ]),
    );
    expect(charter.clauses.find((c) => c.id === 'committee-quorum')!.body).toContain('minimum 2 votes');
  });

  it('MSME and individual charters differ from RWA and never include committee voting', () => {
    for (const orgType of ['MSME', 'INDIVIDUAL']) {
      const ids = resolveOrganizationCharter(orgType).clauses.map((c) => c.id);
      expect(ids).not.toContain('committee-quorum');
      expect(ids).toContain('anti-self-approval');
    }
  });

  it('suppliers get a supplier charter', () => {
    const charter = resolveOrganizationCharter('MSME', true);
    expect(charter.persona).toBe('SUPPLIER');
    expect(charter.clauses.map((c) => c.id)).toContain('direct-contracting');
  });

  it('charters describe wallet referral rules and do not claim a signed acceptance', () => {
    for (const [orgType, supplier] of [['RWA', false], ['MSME', false], ['INDIVIDUAL', false], [null, true]] as const) {
      const charter = resolveOrganizationCharter(orgType, supplier);
      const referralClause =
        charter.clauses.find((c) => c.id === 'wallet-referrals' || c.id === 'supplier-wallet-rewards')!;
      expect(referralClause.body).toMatch(/Wallet|wallet/);
      expect(charter.acceptanceNote).toBe(CHARTER_ACCEPTANCE_NOTE);
    }
  });
});

describe('OrganizationCharterPanel', () => {
  it('renders real clauses instead of the old placeholder paragraph', () => {
    const html = renderToStaticMarkup(
      React.createElement(OrganizationCharterPanel, { orgType: 'RWA', organizationName: 'Greenwood Residency' }),
    );
    expect(html).toContain('RWA / Housing Society Governance Charter');
    expect(html).toContain('Greenwood Residency');
    expect(html).toContain('data-clause="anti-self-approval"');
    expect(html).toContain('data-persona="RWA"');
    expect(html).not.toContain('direct settlement framework');
    expect(html).not.toMatch(/signed on|signature hash/i);
  });
});

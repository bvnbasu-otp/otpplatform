import { tryResolveBuyerPersona, type BuyerPersona } from '@otp/domain';

export interface CharterClause {
  id: string;
  title: string;
  body: string;
}

export interface OrganizationCharter {
  persona: BuyerPersona | 'SUPPLIER';
  title: string;
  summary: string;
  clauses: CharterClause[];
  /** Honest record-keeping status: acceptance is not yet persisted server-side. */
  acceptanceNote: string;
}

export const CHARTER_ACCEPTANCE_NOTE =
  'This charter describes the rules OTP enforces for your organisation. A signed acceptance record is not yet stored on the platform, so it is not shown as signed here.';

const COMMON_CLAUSES: CharterClause[] = [
  {
    id: 'anti-self-approval',
    title: 'No self-approval',
    body: 'The person who creates an RFQ or spend request cannot approve it. Approval must come from a different authorised member (rule PA-09).',
  },
  {
    id: 'audit-attribution',
    title: 'Permanent attribution',
    body: 'Every approval, award and payment decision stays attributed to the individual who held the role when it was made, even after the role changes hands (rule PA-03).',
  },
  {
    id: 'direct-contracting',
    title: 'Direct supplier contracting',
    body: 'Purchase orders issued through OTP are direct bilateral contracts between your organisation and the awarded supplier. OTP does not hold procurement funds in custody or guarantee supplier warranties.',
  },
  {
    id: 'financial-separation',
    title: 'Separate money flows',
    body: 'Procurement value paid to suppliers, OTP subscription revenue, and non-cash OTP Wallet credits are recorded separately. Wallet credits are never mixed with procurement payments.',
  },
  {
    id: 'pilot-referrals',
    title: 'Referrals during the pilot',
    body: 'Referrals are recorded for attribution only. No monetary or wallet credit (₹0) is issued for referrals during the controlled pilot.',
  },
];

const PERSONA_CLAUSES: Record<BuyerPersona, CharterClause[]> = {
  RWA: [
    {
      id: 'committee-quorum',
      title: 'Committee approval',
      body: 'Collective procurement above the operational limit must be approved by the designated committee with quorum (minimum 2 votes).',
    },
    {
      id: 'manager-non-voting',
      title: 'Estate managers do not vote',
      body: 'Estate and facility managers draft RFQs and verify deliveries, but have no committee voting rights.',
    },
    {
      id: 'role-terms',
      title: '365-day officer terms',
      body: 'Officer roles run on a 365-day term and must be renewed or handed over at expiry.',
    },
  ],
  MSME: [
    {
      id: 'delegated-authority',
      title: 'Delegated spend authority',
      body: 'Members can only approve spend within the authority delegated to their role. Anything above it is escalated to the next approver.',
    },
    {
      id: 'role-terms',
      title: '365-day role terms',
      body: 'Role assignments carry a 365-day term by default and must be renewed or reassigned at expiry.',
    },
  ],
  INDIVIDUAL: [
    {
      id: 'personal-account',
      title: 'Personal procurement',
      body: 'You act on your own behalf. Commitments you make create obligations only for you and the supplier you award.',
    },
  ],
};

const PERSONA_TITLES: Record<BuyerPersona, { title: string; summary: string }> = {
  RWA: {
    title: 'RWA / Housing Society Governance Charter',
    summary: 'How your committee approves, awards and pays for collective procurement on OTP.',
  },
  MSME: {
    title: 'Business Procurement Governance Charter',
    summary: 'How your team approves, awards and pays for procurement on OTP.',
  },
  INDIVIDUAL: {
    title: 'Individual Buyer Charter',
    summary: 'The rules that apply when you procure on OTP as an individual.',
  },
};

const SUPPLIER_CHARTER: OrganizationCharter = {
  persona: 'SUPPLIER',
  title: 'Supplier Participation Charter',
  summary: 'The rules that apply when your organisation quotes and delivers on OTP.',
  clauses: [
    {
      id: 'direct-contracting',
      title: 'Direct buyer contracting',
      body: 'Awards and purchase orders are direct bilateral contracts between you and the buyer. OTP does not hold procurement funds in custody.',
    },
    {
      id: 'audit-attribution',
      title: 'Permanent attribution',
      body: 'Quotes, acceptances and milestone submissions stay attributed to the individual who made them (rule PA-03).',
    },
    COMMON_CLAUSES.find((c) => c.id === 'financial-separation')!,
    COMMON_CLAUSES.find((c) => c.id === 'pilot-referrals')!,
  ],
  acceptanceNote: CHARTER_ACCEPTANCE_NOTE,
};

export function resolveOrganizationCharter(orgType?: string | null, isSupplier = false): OrganizationCharter {
  if (isSupplier) return SUPPLIER_CHARTER;
  const persona = tryResolveBuyerPersona(orgType) ?? 'MSME';
  return {
    persona,
    ...PERSONA_TITLES[persona],
    clauses: [...PERSONA_CLAUSES[persona], ...COMMON_CLAUSES],
    acceptanceNote: CHARTER_ACCEPTANCE_NOTE,
  };
}

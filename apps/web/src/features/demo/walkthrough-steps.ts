import { getPilotById, type PilotDefinition } from '@/lib/pilots';
import { DEMO_PO_ID } from '@/lib/supabase';

export interface WalkthroughStep {
  id: number;
  title: string;
  detail: string;
  /** Route to navigate — undefined for login step */
  route?: string;
}

export function buildWalkthroughSteps(pilot: PilotDefinition): WalkthroughStep[] {
  const { requirementId, rfqId, quoteSummary } = pilot;
  return [
    {
      id: 1,
      title: 'Login as Manager',
      detail: 'demo@durga-rainbow.manager / DemoManager2026!',
      route: '/login',
    },
    {
      id: 2,
      title: `View Requirement — ${pilot.vertical}`,
      detail: `${pilot.requirementTitle} · ${pilot.location}`,
      route: `/requirements/${requirementId}`,
    },
    {
      id: 3,
      title: 'Initial quote submission',
      detail: 'Suppliers submit identity-protected initial quotes while RFQ is OPEN',
      route: `/supplier/rfq/${rfqId}`,
    },
    {
      id: 4,
      title: 'Negotiation & Q&A',
      detail: 'Close initial quoting, clarify requirements, collect final quotes',
      route: `/rfq/${rfqId}/clarification`,
    },
    {
      id: 5,
      title: 'Identity-Protected Comparison',
      detail: `Compare final ${quoteSummary} — supplier identity hidden until award`,
      route: `/rfq/${rfqId}/evaluation`,
    },
    {
      id: 6,
      title: 'Committee Vote',
      detail: 'COI declaration and identity-protected recommendation votes',
      route: `/rfq/${rfqId}/committee`,
    },
    {
      id: 7,
      title: 'Award Decision',
      detail: 'Manager records award with justification',
      route: `/rfq/${rfqId}/award`,
    },
    {
      id: 8,
      title: 'Supplier Reveal',
      detail: 'Reveal winning supplier identity to buyer org',
      route: `/rfq/${rfqId}/reveal`,
    },
    {
      id: 9,
      title: 'Purchase Order',
      detail: 'Create PO from revealed award, then issue to supplier',
      route: `/rfq/${rfqId}/reveal`,
    },
    {
      id: 10,
      title: 'Work Order & Delivery',
      detail: 'Supplier completes work — buyer accepts delivery & inspection',
      route: `/purchase-orders/${DEMO_PO_ID}`,
    },
    {
      id: 11,
      title: 'Invoice & Remittance',
      detail: 'Invoice approved and payment verified',
      route: `/purchase-orders/${DEMO_PO_ID}`,
    },
    {
      id: 12,
      title: 'Supplier Performance',
      detail: 'Buyer rates delivery and quality — feeds market intelligence baselines',
      route: `/rfq/${rfqId}/performance`,
    },
    {
      id: 13,
      title: 'Audit Trail',
      detail: 'Full procurement audit history',
      route: '/audit',
    },
    {
      id: 14,
      title: 'Try another pilot',
      detail: 'Return to dashboard — MSME, Textile, or Local business',
      route: '/',
    },
  ];
}

/** Default walkthrough for Pilot 1 (Durga demo). */
export const WALKTHROUGH_STEPS = buildWalkthroughSteps(getPilotById('pilot-1'));

import { isDemoMode } from '@/features/demo/demo-config';
import { DURGA_DEMO, GREENVIEW_DEMO } from '@/lib/demo-ids';
import { PILOT_LABEL, PILOT_LOCATION } from '@/lib/brand';

const ids = isDemoMode ? DURGA_DEMO : GREENVIEW_DEMO;

/** Active RFQ for identity-protected comparison walkthrough. */
export const DEFAULT_RFQ_ID = isDemoMode ? DURGA_DEMO.rfqId : GREENVIEW_DEMO.rfqId;

/** Fulfillment RFQ (awarded) — Greenview only; Durga uses same RFQ after award. */
export const FULFILLMENT_RFQ_ID = isDemoMode
  ? DURGA_DEMO.rfqId
  : GREENVIEW_DEMO.fulfillmentRfqId;

export const DEMO_PO_ID = ids.purchaseOrderId;
export const DEMO_WO_ID = ids.workOrderId;
export const DEMO_REQUIREMENT_ID = ids.requirementId;
export const DEMO_PERFORMANCE_ID = ids.performanceId;

export const ORG_DISPLAY_NAME = isDemoMode
  ? 'Durga Rainbow Flat Owner Welfare Association'
  : 'Greenview Apartments';

/** Pilot framing — buyer org is one vertical; OTP is horizontal. */
export const PILOT_CONTEXT = `${PILOT_LABEL} · ${PILOT_LOCATION}`;

export const REQUIREMENT_TITLE = '10 HP Borewell Motor Winding';

/** Horizontal procurement pilots — same engine, different verticals. */

export type PilotId = 'pilot-1' | 'pilot-2' | 'pilot-3' | 'pilot-4';

export interface PilotDefinition {
  id: PilotId;
  number: 1 | 2 | 3 | 4;
  label: string;
  vertical: string;
  buyerType: 'Community' | 'MSME' | 'Local business';
  location: string;
  orgName: string;
  requirementTitle: string;
  requirementSummary: string;
  requirementId: string;
  rfqId: string;
  /** Identity-protected quote totals for walkthrough copy */
  quoteSummary: string;
  /** Market intelligence baseline category key */
  marketIntelCategory: string;
}

/** Pilot 1 uses Greenview seed IDs; pilots 2–4 in seed_pilots_horizontals.sql */
export const PILOTS: readonly PilotDefinition[] = [
  {
    id: 'pilot-1',
    number: 1,
    label: 'Pilot 1 · Community',
    vertical: 'RWA / facility service',
    buyerType: 'Community',
    location: 'Bengaluru',
    orgName: 'Greenview Apartments',
    requirementTitle: '10 HP Borewell Motor Winding',
    requirementSummary: 'Submersible pump motor rewinding — 7-day delivery',
    requirementId: 'a2000000-0000-4000-8000-000000000001',
    rfqId: 'f1000000-0000-4000-8000-000000000001',
    quoteSummary: '₹8,500 / ₹7,800 / ₹9,200',
    marketIntelCategory: 'motor_winding_10hp',
  },
  {
    id: 'pilot-2',
    number: 2,
    label: 'Pilot 2 · MSME',
    vertical: 'Machine maintenance',
    buyerType: 'MSME',
    location: 'Coimbatore',
    orgName: 'Precision Tools Coimbatore',
    requirementTitle: 'CNC Lathe Spindle Repair & Calibration',
    requirementSummary: '5 HP lathe spindle — vibration issue, 3-day turnaround',
    requirementId: 'd2000020-0000-4000-8000-000000000001',
    rfqId: 'd2000021-0000-4000-8000-000000000001',
    quoteSummary: '₹18,500 / ₹16,200 / ₹19,800',
    marketIntelCategory: 'cnc_spindle_repair',
  },
  {
    id: 'pilot-3',
    number: 3,
    label: 'Pilot 3 · Textile',
    vertical: 'Yarn procurement',
    buyerType: 'MSME',
    location: 'Tiruppur',
    orgName: 'Sri Krishna Spinners',
    requirementTitle: '40s Combed Cotton Yarn — 500 kg',
    requirementSummary: 'Ring-spun 40s combed cotton, mill quality, 5-day delivery',
    requirementId: 'd3000020-0000-4000-8000-000000000001',
    rfqId: 'd3000021-0000-4000-8000-000000000001',
    quoteSummary: '₹2,45,000 / ₹2,38,500 / ₹2,52,000',
    marketIntelCategory: 'cotton_yarn_40s',
  },
  {
    id: 'pilot-4',
    number: 4,
    label: 'Pilot 4 · Local business',
    vertical: 'Electrical / facility service',
    buyerType: 'Local business',
    location: 'Bengaluru',
    orgName: 'Malleswaram Electronics & Services',
    requirementTitle: '3-Phase Electrical Panel Upgrade — 63A',
    requirementSummary: 'Shop electrical panel replacement with MCB protection',
    requirementId: 'd4000020-0000-4000-8000-000000000001',
    rfqId: 'd4000021-0000-4000-8000-000000000001',
    quoteSummary: '₹42,000 / ₹38,500 / ₹45,200',
    marketIntelCategory: 'electrical_panel_63a',
  },
] as const;

export const DEFAULT_PILOT_ID: PilotId = 'pilot-1';

export function getPilotById(id: PilotId): PilotDefinition {
  const pilot = PILOTS.find((p) => p.id === id);
  if (!pilot) throw new Error(`Unknown pilot: ${id}`);
  return pilot;
}

export function isPilotId(value: string): value is PilotId {
  return PILOTS.some((p) => p.id === value);
}

export function getPilotByRfqId(rfqId: string): PilotDefinition | undefined {
  return PILOTS.find((p) => p.rfqId === rfqId);
}

export function getPilotByRequirementId(requirementId: string): PilotDefinition | undefined {
  return PILOTS.find((p) => p.requirementId === requirementId);
}

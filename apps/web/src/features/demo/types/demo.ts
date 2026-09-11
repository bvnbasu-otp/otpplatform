/**
 * The demo, as the database describes it.
 *
 * Nothing in here is a hard-coded fixture. Which accounts exist, which
 * scenarios exist and whether demo mode is on at all are facts the database
 * holds, so a reseed changes the demo without a rebuild — and a production
 * deployment with demo mode off shows none of it.
 */

export interface DemoStatus {
  enabled: boolean;
  /** Changes on every reset. Audit rows from the previous run stay attributable. */
  runId: string | null;
  lastResetAt: string | null;
}

export type DemoPersona =
  | 'ADMIN'
  | 'BUYER_OWNER'
  | 'BUYER_MANAGER'
  | 'BUYER_MEMBER'
  | 'COMMITTEE'
  | 'SUPPLIER';

/** Who the signed-in user is, in the terms the demo is about. */
export interface DemoContext {
  signedIn: boolean;
  profileId: string | null;
  fullName: string | null;
  isDemo: boolean;
  demoModeEnabled: boolean;
  side: 'BUYER' | 'SUPPLIER';
  organizationId: string | null;
  organizationName: string | null;
  buyerType: string | null;
  buyerTypeLabel: string | null;
  buyerTypeDescription: string | null;
  votingPower: number;
  defaultCommitteeSize: number | null;
}

export type DemoStage =
  | 'DRAFT'
  | 'SOURCING'
  | 'QUOTING'
  | 'EVALUATION'
  | 'AWARDED'
  | 'REVEALED';

export interface DemoScenarioRow {
  code: string;
  title: string;
  narrative: string;
  buyerType: string;
  buyerTypeLabel: string | null;
  votingPower: number | null;
  organizationName: string | null;
  requirementId: string | null;
  rfqId: string | null;
  publicRef: string | null;
  stageLabel: string;
  targetStage: DemoStage;
  actualStage: DemoStage;
  requirementStatus: string | null;
  rfqStatus: string | null;
  revealStatus: string | null;
  minQuotesRequired: number | null;
  suppliersInvited: number;
  quotesReceived: number;
  membersVoted: number;
  weightCast: number;
  awardStatus: string | null;
  awardedAt: string | null;
  revealedAt: string | null;
  hasPurchaseOrder: boolean;
}

const STAGE_ORDER: DemoStage[] = [
  'DRAFT',
  'SOURCING',
  'QUOTING',
  'EVALUATION',
  'AWARDED',
  'REVEALED',
];

/** How far along, 0–1, for the progress bar on the board. */
export function stageProgress(stage: DemoStage): number {
  const index = STAGE_ORDER.indexOf(stage);
  if (index < 0) return 0;
  return index / (STAGE_ORDER.length - 1);
}

/**
 * True when a scenario has fallen behind where it was staged to be.
 *
 * A scenario that has moved *past* its target is not behind: that is a
 * presenter driving the demo forward, which is the point.
 */
export function isBehindTarget(row: {
  actualStage: DemoStage;
  targetStage: DemoStage;
}): boolean {
  return STAGE_ORDER.indexOf(row.actualStage) < STAGE_ORDER.indexOf(row.targetStage);
}

export const STAGE_LABELS: Record<DemoStage, string> = {
  DRAFT: 'Not published',
  SOURCING: 'Suppliers invited',
  QUOTING: 'Quotes In',
  EVALUATION: 'Committee voting',
  AWARDED: 'Award locked, identities still protected',
  REVEALED: 'Winner revealed',
};

export function formatVotingPower(power: number | null): string {
  if (power === null) return 'no vote';
  return power === 1 ? '1 vote' : `${power} votes`;
}

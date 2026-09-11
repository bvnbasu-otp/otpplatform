#!/usr/bin/env npx tsx
/**
 * Prints the 15-minute investor/committee walkthrough script.
 */
import { DEMO, DEMO_ORG_NAME, DEMO_QUOTES, DEMO_REQUIREMENT_TITLE } from './constants.js';

const steps = [
  {
    min: 0,
    title: 'Login as Community Manager',
    action: `Sign in as ${DEMO.users.manager.email}`,
    screen: `Dashboard — shows active RFQ for ${DEMO_REQUIREMENT_TITLE}`,
    demonstrates: 'Role-based access, community org context',
  },
  {
    min: 2,
    title: 'View Requirement',
    action: 'Open requirement detail',
    screen: 'Structured specs: 10 HP, SERVICE, Block C pump house',
    demonstrates: 'Requirement-driven procurement (not catalog shopping)',
  },
  {
    min: 4,
    title: 'RFQ & Supplier Discovery',
    action: 'Open RFQ → Invitations tab (manager view)',
    screen: '5 suppliers invited with match scores (internal only)',
    demonstrates: 'Discovery → anonymous labels A–E; D viewed, E declined',
  },
  {
    min: 6,
    title: 'Blind Quote Comparison',
    action: 'Open Compare Quotes (committee/buyer view)',
    screen: `Supplier A ₹${DEMO_QUOTES.A.totalCost} | B ₹${DEMO_QUOTES.B.totalCost} | C ₹${DEMO_QUOTES.C.totalCost}`,
    demonstrates: 'No supplier names — only anonymous labels and normalized totals',
  },
  {
    min: 8,
    title: 'Evaluation Scores',
    action: 'Show advisory scores column',
    screen: `B scores highest (${DEMO_QUOTES.B.evaluationScore}) despite not being cheapest on delivery`,
    demonstrates: 'Objective comparison — price, delivery, warranty weighted',
  },
  {
    min: 10,
    title: 'Close Quoting → Evaluation',
    action: 'Manager closes quoting window',
    screen: 'RFQ moves to EVALUATING; D/E shown as non-responders',
    demonstrates: 'State machine transitions with audit events',
  },
  {
    min: 12,
    title: 'Committee Vote',
    action: 'Log in as committee members, cast votes',
    screen: '2 recommend B, 1 recommends A',
    demonstrates: 'Human decision input — committee governance',
  },
  {
    min: 14,
    title: 'Award + Justification',
    action: 'Manager awards Supplier B with written justification',
    screen: 'Mandatory rationale citing price vs warranty tradeoff',
    demonstrates: 'Humans decide — AI recommends, humans decide',
  },
  {
    min: 16,
    title: 'Supplier Reveal',
    action: 'Confirm award → reveal identity',
    screen: 'Supplier B revealed as Krishna Pump Services',
    demonstrates: 'Blind-until-award trust model',
  },
  {
    min: 18,
    title: 'PO → Work Order → Completion',
    action: 'Issue PO, track work progress to 100%',
    screen: 'Operational fulfillment chain',
    demonstrates: 'Procurement continues past award',
  },
  {
    min: 20,
    title: 'Invoice & Payment',
    action: 'Approve invoice, record UPI payment',
    screen: '₹7,800 verified payment',
    demonstrates: 'Settlement with audit trail',
  },
  {
    min: 22,
    title: 'Performance & Audit',
    action: 'Open audit log + supplier performance',
    screen: 'Full immutable history from requirement to completion',
    demonstrates: 'Transparency and accountability',
  },
];

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  OTP Demo Walkthrough — ${DEMO_ORG_NAME.padEnd(32)}║
║  ${DEMO_REQUIREMENT_TITLE.padEnd(62)}║
╚══════════════════════════════════════════════════════════════════╝

Duration: ~15 minutes (presenter-paced)
Reset before demo: pnpm demo:reset

── Credentials ──────────────────────────────────────────────────

  Manager:    ${DEMO.users.manager.email} / ${DEMO.users.manager.password}
  Committee:  ${DEMO.users.committee1.email} / ${DEMO.users.committee1.password}
  Committee:  ${DEMO.users.committee2.email} / ${DEMO.users.committee2.password}
  Buyer:      ${DEMO.users.buyer.email} / ${DEMO.users.buyer.password}
  Admin:      ${DEMO.users.platformAdmin.email} / ${DEMO.users.platformAdmin.password}

── Walkthrough Steps ────────────────────────────────────────────
`);

for (const step of steps) {
  console.log(`[${String(step.min).padStart(2)} min] ${step.title}`);
  console.log(`         Action: ${step.action}`);
  console.log(`         Screen: ${step.screen}`);
  console.log(`         Shows:  ${step.demonstrates}`);
  console.log();
}

console.log(`── Golden Path Alignment ────────────────────────────────────────

  Stage              | Requirement | RFQ      | Quotes  | Award
  -------------------|-------------|----------|---------|--------
  Demo ready state   | QUOTING     | OPEN     | 3 SUBMITTED | —
  After walkthrough  | AWARDED     | AWARDED  | SELECTED    | REVEALED
  Complete seed      | COMPLETED   | AWARDED  | SELECTED    | REVEALED

── Reset ────────────────────────────────────────────────────────

  pnpm demo:reset     → walkthrough-ready (<30s)
  pnpm demo:seed      → apply ready seed
  pnpm demo:seed complete → full lifecycle seed

See docs/OTP-DEMO.md for full documentation.
`);

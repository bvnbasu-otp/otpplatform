/**
 * The public copy, in one place.
 *
 * Kept out of the components because several pages say the same things in
 * different shapes — the landing page states the claim, the FAQ explains it,
 * About Us argues for it — and three hand-written versions of "when is identity
 * revealed" is three chances to describe the product wrongly.
 *
 * Two rules govern what belongs here. Every claim is one the platform actually
 * enforces, and where a mechanism is not built yet the copy carries a status
 * rather than an implication. The home page states; it does not explain. The
 * mechanism — salts, views, append-only trails — lives in the FAQ, because a
 * landing page that describes its own implementation is reassuring nobody and
 * boring everybody.
 */

import { PRODUCT_NAME } from '@/lib/brand';

/**
 * The hero, and with it the product's primary terminology.
 *
 * "Identity-protected" rather than "anonymous" is deliberate and load-bearing:
 * anonymity sounds like an absence of accountability, which is the opposite of
 * what this platform is for. Identities exist, are verified, and are withheld
 * from the comparison until the decision is fixed.
 */
export const HERO = {
  eyebrow: 'OTP — Open Trade & Procurement',
  title: 'Procure Smarter. Compare Without Bias. Award with Confidence.',
  tagline: 'The identity-protected sourcing platform for Indian MSMEs, Communities & Enterprises.',
  body:
    'A transparent procurement platform where buyers and suppliers can compete fairly '
    + 'while identities remain protected until award.',
  /** The first interaction, kept to one question. */
  prompt: 'What do you need to procure today?',
  promptExample: 'e.g. 10 HP borewell motor winding in Coimbatore within 3 days',
};

/**
 * The one idea a first-time visitor has to leave with.
 *
 * The caveat is not hedging. A sourcing platform that implies it finds the
 * cheapest price has promised the one thing weighted evaluation exists to avoid
 * promising.
 */
export const CORE_MESSAGE = {
  headline: 'Don’t choose a supplier. Let competition help you choose.',
  definition:
    'An identity-protected competitive sourcing and procurement orchestration platform.',
  caveat:
    'The lowest quote isn’t necessarily the best quote. '
    + `${PRODUCT_NAME} does not promise the cheapest price — it makes the comparison `
    + 'consistent, and is designed to reduce identity-driven bias.',
};

export interface Audience {
  name: string;
  body: string;
}

/**
 * The four buyer types, which are org_type values in the database rather than
 * marketing segments. A community running a committee vote and an individual
 * replacing a burnt-out motor use the same engine at different weights.
 */
export const AUDIENCES: Audience[] = [
  { name: 'Individual', body: 'Source products and services competitively.' },
  { name: 'MSME', body: 'Buy better without building a large procurement function.' },
  { name: 'Community / RWA', body: 'Run transparent, democratic evaluation & voting.' },
  {
    name: 'Enterprise',
    body: 'Govern sourcing with structured evaluation and auditability.',
  },
];

export interface LifecycleGroup {
  name: string;
  body: string;
  stages: string[];
}

/**
 * The whole lifecycle, once.
 *
 * Twelve stages is too many to read as a flat row and too few to deserve four
 * separate sections, which is what this page used to give them. Grouped into
 * three acts it fits one glance, and the grouping carries meaning the flat list
 * could not: everything in Source and most of Decide happens under aliases,
 * everything in Deliver happens between two named parties.
 */
export const LIFECYCLE_GROUPS: LifecycleGroup[] = [
  {
    name: 'Source',
    body: 'Say what you need. Eligible suppliers are found and invited to compete.',
    stages: [
      'Requirement',
      'Supplier discovery',
      'Identity-protected RFQ',
      'Quotes & negotiation',
    ],
  },
  {
    name: 'Decide',
    body: 'Compare on weights published in advance, decide, then unmask the winner.',
    stages: [
      'Weighted evaluation',
      'Buyer evaluation & voting decision',
      'Award lock',
      'Identity reveal',
    ],
  },
  {
    name: 'Deliver',
    body: 'The order, the work and the invoice stay attached to the enquiry that started them.',
    stages: [
      'Purchase order',
      'Work order / execution',
      'Invoice / payment',
      'Supplier performance',
    ],
  },
];

export interface Phase {
  ordinal: string;
  title: string;
  window: string;
}

/**
 * The four windows the engine enforces, as labels rather than paragraphs.
 *
 * Supplier discovery is deliberately absent: it runs on a draft, before anything
 * is published, and dressing it as a fifth phase would misdescribe what the
 * deadline machinery covers. It appears in the lifecycle above instead.
 */
export const PHASES: Phase[] = [
  { ordinal: 'Phase 1', title: 'Publishing and Quoting', window: 'Closes on the quote deadline' },
  {
    ordinal: 'Phase 2',
    title: 'Clarification and Revision',
    window: 'Closes on the revision deadline',
  },
  {
    ordinal: 'Phase 3',
    title: 'Evaluation and Voting',
    window: 'Closes on the voting deadline',
  },
  {
    ordinal: 'Phase 4',
    title: 'Award and Identity Reveal',
    window: 'Triggered by the decision, not by a clock',
  },
];

export interface Pillar {
  title: string;
  body: string;
}

export const PILLARS: Pillar[] = [
  {
    title: 'Identity-Protected Sourcing',
    body: 'Buyer and supplier identities stay protected through sourcing and evaluation.',
  },
  {
    title: 'Time-Bound Procurement',
    body: 'Every phase runs to a deadline, enforced on every route in.',
  },
  {
    title: 'Comparable Evaluation',
    body: 'Price, delivery, warranty and compliance, normalised on weights set in advance.',
  },
  {
    title: 'Governed Decisions',
    body: 'Authorised members vote, reasons are recorded, the decision trail is preserved.',
  },
];

/**
 * How reachable a supplier channel actually is today.
 *
 * The status is the whole reason this section can exist. Six names in a funnel
 * diagram implies six working integrations; there are two, one in pilot, and
 * three that are intent. Saying so costs a little swagger and buys the only
 * thing a procurement product sells, which is being believed.
 */
export type ChannelStatus = 'LIVE' | 'PILOT' | 'PLANNED';

export const CHANNEL_STATUS_LABEL: Record<ChannelStatus, string> = {
  LIVE: 'Available now',
  PILOT: 'In pilot',
  PLANNED: 'Planned',
};

export interface SupplierChannel {
  name: string;
  status: ChannelStatus;
  description?: string;
  badgeIcon?: string;
}

export const SUPPLIER_CHANNELS: SupplierChannel[] = [
  {
    name: `${PRODUCT_NAME} supplier registry`,
    status: 'LIVE',
    description: '104 verified domain suppliers active across 16 industrial & service taxonomies with real-time matching.',
    badgeIcon: '✓',
  },
  {
    name: 'Direct suppliers',
    status: 'LIVE',
    description: 'Buyers directly invite preferred vendors or known contractors via phone, email, or instant link to submit sealed quotes.',
    badgeIcon: '⚡',
  },
  {
    name: 'WhatsApp and SMS',
    status: 'LIVE',
    description: 'Zero-app quotation intake, OTPs, and automated RFQ notifications dispatched over self-hosted WAHA WhatsApp gateway.',
    badgeIcon: '💬',
  },
  {
    name: 'ONDC',
    status: 'PLANNED',
    description: 'Open Network for Digital Commerce inter-network discovery and procurement interoperability.',
    badgeIcon: '🌐',
  },
  {
    name: 'BNI and referrals',
    status: 'PLANNED',
    description: 'Structured business networking and peer referral channels for trusted local sourcing.',
    badgeIcon: '🤝',
  },
  {
    name: 'Local business associations',
    status: 'PLANNED',
    description: 'Regional trade bodies, chambers of commerce, and industrial estate associations for localized market access.',
    badgeIcon: '🏛️',
  },
];

/**
 * Why any of this is worth changing a habit for.
 *
 * The left column describes how sourcing usually goes, not how a named
 * competitor works — comparing against a rival on your own home page invites
 * the reader to go and check.
 */
export const CONTRASTS = {
  conventional: [
    'Identity can sway the decision and invite bias',
    'Quotes arrive in different unstructured shapes',
    'Negotiation history sits scattered across inboxes',
    'The outcome depends on who ran it',
    'No complete statutory record of why',
  ],
  otp: [
    'Eliminates favoritism and vendor lock-in',
    'Prevents predatory pricing based on buyer identity',
    'Assures full GST & ITC compliance upon award',
    'One consistent scoring formula for every quote',
    'Votes carry a recorded reason and immutable audit trail',
  ],
};

/**
 * Roles, at the weight a home page can carry. The full model is eleven roles
 * across two sides; what a first-time visitor needs is the principle and one
 * example sharp enough to prove the principle is real.
 */
export const ROLE_SUMMARY = {
  headline: 'Your role determines what you can see, approve and change.',
  body: 'Buyer and supplier teams get the screens their job needs and nothing more. An auditor reads everything and changes nothing — a restriction most procurement tools cannot express.',
};

/**
 * The demonstration, shown once.
 *
 * Figures are illustrative and labelled as such. Two things about them are not
 * illustrative: the reference format is the one the platform really mints, and
 * the alias format is the one it really generates, because a visual that invents
 * a tidier shape than the product is a small lie a new user discovers on day one.
 */
export interface DemoQuote {
  alias: string;
  rank: 'L1' | 'L2' | 'L3';
  total: string;
  delivery: string;
  warranty: string;
  score: number;
}

export const DEMO_RFQ = {
  reference: 'RFQ-7K29AB',
  title: '10 HP borewell motor winding',
  summary: 'Bhavani · 1 unit · within 4 days · 6 months minimum warranty',
  weights: 'Price 50% · Delivery 30% · Warranty 20%',
  quotes: [
    {
      alias: 'Supplier A7K3',
      rank: 'L1',
      total: '₹8,800',
      delivery: '2 days',
      warranty: '12 months',
      score: 91.2,
    },
    {
      alias: 'Supplier P8K2',
      rank: 'L2',
      total: '₹9,300',
      delivery: '2 days',
      warranty: '12 months',
      score: 89.7,
    },
    {
      alias: 'Supplier M4Q9',
      rank: 'L3',
      total: '₹8,150',
      delivery: '5 days',
      warranty: '6 months',
      score: 84.6,
    },
  ] as DemoQuote[],
  lessonHeadline: "The lowest quote isn't automatically the winner.",
  lesson: 'The cheapest quote takes five days and carries half the warranty.',
  disclaimer: 'Demonstration data · ranked by score, not by price',
};

export interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * The questions someone asks before they have decided which side they are on.
 *
 * This is also where the detail the home page no longer carries has gone: how
 * masking works, which channels are real, what the parser actually is. A reader
 * who wants the mechanism should be able to find all of it — just not in a hero.
 */
export const GENERAL_FAQS: FaqEntry[] = [
  {
    question: `What is ${PRODUCT_NAME} explicitly not?`,
    answer:
      'Not apartment/RWA software, not an IndiaMART clone, not an anonymous marketplace, '
      + 'not an ERP, not an ONDC replacement, not a supplier ad platform.',
  },
  {
    question: `What is ${PRODUCT_NAME}?`,
    answer:
      `${PRODUCT_NAME} is an identity-protected competitive sourcing platform. You describe what you need, `
      + 'the platform finds suppliers who can do it and invites them to compete anonymously. You evaluate '
      + 'quotes as scored, aliased cards (Supplier A, B, C) — neither side sees who the other is during '
      + 'commercial evaluation. The winning supplier\'s identity is revealed only after the award decision '
      + 'is locked and justified. Then it continues into purchase order, delivery, and invoice — all '
      + 'attached to the original requirement with full audit trail.',
  },
  {
    question: 'What are Fast Track and Full Governance flows?',
    answer:
      'OTP offers two procurement experiences: **Fast Track (2-step, 3-5 min)** for Individual/MSME buyers '
      + '— just describe what you need with real-time AI parsing, review smart defaults (50km radius, '
      + 'evaluation weights 60/30/10), and publish. **Full Governance (4-step, 12-15 min)** for RWA/Enterprise '
      + '— structured intake with technical specs, mandatory committee configuration (min 2 votes for RWA, '
      + '3 for Enterprise), democratic voting with COI declarations, and detailed manager justification '
      + '(min 50 characters). Both flows maintain 100% identity protection until award.',
  },
  {
    question: 'What are the 8 Core Procurement Lifecycle States on OTP Platform?',
    answer:
      'Every procurement enquiry on the OTP Platform transitions through 7 chronological stages with State 8 as an automated SLA exception overlay:\n\n'
      + '1. **Draft & Intake** — Commercial and technical specification intake (Express AI or 4-step wizard) with smart defaults.\n'
      + '2. **Sourcing & Quoting** — Multi-pass verified supplier matching, discovery, and anonymous sealed quote submission.\n'
      + '3. **Evaluation & Voting** — Identity-protected comparison matrix, anonymous clarifications, and committee consensus voting.\n'
      + '4. **Award & Reveal** — Permanent freeze of evaluation scores, justification recording, and winning supplier identity unmasking.\n'
      + '5. **PO & Execution** — Purchase Order issuance, live delivery tracking (0–100%), and on-site inspection sign-off.\n'
      + '6. **Invoiced & Review** — GST tax invoice matching, line-item verification, and approval.\n'
      + '7. **Settled & Rating** — Direct UPI/bank remittance, supplier merit score rating, and sealed immutable audit logging.\n'
      + '8. **Stalled (>24h SLA Overlay)** — Automated detection of bottlenecks at any stage with 1-click diagnostic and unblocking actions.',
  },
  {
    question: `Who can use ${PRODUCT_NAME}?`,
    answer:
      'An individual sourcing a local service, a small business buying components or machinery, a '
      + 'residential community putting maintenance work out to tender, and an enterprise running '
      + 'governed procurement. It is the same engine in each case; what changes is how many people '
      + 'have to approve the decision and how the votes are weighted.',
  },
  {
    question: 'How does identity protection actually work?',
    answer:
      'Multi-layered protection: **(1) Comparison screens** — buyer evaluation screens never receive a '
      + 'supplier\'s business name, phone, email, or other identifying fields; those are withheld at the '
      + 'source, not just hidden in the interface. **(2) Filename Sanitization** — the server generates neutral '
      + 'names ("Document 1", "Photo 2") stripping original filenames. **(3) Metadata Stripping** — '
      + 'photos/PDFs/voice notes are processed to remove EXIF GPS, camera info, author names, company '
      + 'metadata (in development). **(4) Social Media Redaction** — LinkedIn, Twitter, Instagram, Facebook '
      + 'links are automatically removed from clarification messages. **(5) Anonymous Aliases** — each RFQ '
      + 'generates unique supplier labels (A, B, C) using cryptographic salts. Identity is revealed only, '
      + 'irreversibly, after the award decision is locked.',
  },
  {
    question: 'How are suppliers discovered?',
    answer:
      'From the requirement. The category decides which capabilities are needed, and candidates are '
      + 'ranked on holding those capabilities, having declared enough spare capacity for the job, '
      + 'and covering the delivery location — with on-time record and dispute rate as softer '
      + 'signals. The buyer picks who to invite from that ranking; nobody is invited because they '
      + 'paid for placement.',
  },
  {
    question: 'Can a buyer invite known or existing vendors directly?',
    answer:
      'Yes. The Direct suppliers channel allows buyers to invite trusted vendors or known contractors directly by entering their mobile phone number or email address, or sharing a secure invitation link. Invited Direct suppliers can review the requirement specifications and submit an identity-protected quote into the same evaluation room under identical competitive rules, without their identity leaking to evaluators prior to award.',
  },
  {
    question: 'Can a supplier take part without registering first?',
    answer:
      'That is what the WhatsApp and SMS messaging channel enables today. An invited supplier can '
      + 'receive the enquiry directly on WhatsApp, reply with an indicative price and delivery schedule '
      + 'which our parsing engine records into the RFQ, and access a single-use secure link to finalize '
      + `line-item details. Every notice flows through the platform’s self-hosted WAHA WhatsApp gateway—`
      + 'suppliers never see the buyer’s contact info and buyers never see the supplier’s until an award is locked.',
  },
  {
    question: 'Can ONDC or BNI suppliers take part?',
    answer:
      'Not yet. ONDC has a documented adapter shape behind a feature flag that is off by '
      + 'default, and BNI and local associations are modelled as supplier sources with stub '
      + 'adapters — none of the three is connected to a real network, so no supplier is '
      + 'reachable through them today. The design intent is that one requirement can be put '
      + 'to several supplier networks at once; the honest current position is that the local '
      + 'registry, direct suppliers by phone/email, and WhatsApp messaging are the channels that '
      + 'work end to end.',
  },
  {
    question: 'What happens after the award?',
    answer:
      'The purchase order is raised against the awarded quote, a work order tracks the job as it '
      + 'progresses, invoices are raised against work that has been signed off, and payments and '
      + 'supplier performance are recorded for the next round. All of it stays attached to the '
      + 'enquiry that started it, so the order can always be read back to the quote that won.',
  },
  {
    question: `How does ${PRODUCT_NAME} make money?`,
    answer:
      'A subscription on the buying side. Suppliers are not charged to register, to be invited or to '
      + 'win, and there are no lead fees — a platform that takes a cut of the supplier’s margin has '
      + 'a stake in who wins, and this one must not. There is no billing system behind the pricing '
      + 'page yet, so nothing is charged while we onboard the first cohort.',
  },
  {
    question: 'Does the platform use AI to read my requirement?',
    answer:
      'No, and it is worth being exact about this. Free text is parsed into a structured requirement '
      + 'by rules built on the category taxonomy — keywords, quantities, units, locations and dates — '
      + 'not by a language model. It shows you what it understood and lets you correct it, precisely '
      + 'because a rule-based reading of a sentence is often incomplete.',
  },
];

export const BUYER_FAQS: FaqEntry[] = [
  {
    question: 'How is a supplier actually hidden from us?',
    answer:
      "Each enquiry has its own random salt. A supplier's alias is a hash of that salt and their identity, so the same firm is \"Supplier K7P4\" on one enquiry and \"Supplier A3F9\" on the next, with no way to link the two. Your comparison screen reads from a view that has no company name, contact or tax ID in it at all — the columns are not hidden by the interface, they are not in the data the interface receives.",
  },
  {
    question: 'Can we see reliability without seeing who it is?',
    answer:
      'Yes, and this is the compromise worth understanding. Ratings, on-time performance and job counts are shown in bands — half a star, five percent, “20–49 jobs” — rather than exact figures. An exact 4.37 rating would be as identifying as a name.',
  },
  {
    question: 'Who sets the scoring formula, and can it be changed mid-round?',
    answer:
      'You do, before quoting opens. The weights across price, turnaround, compliance and any custom criteria are recorded against the enquiry, and every quote is scored with the version in force when it was evaluated. Changing weights after quotes are in is visible in the audit trail, which is the point.',
  },
  {
    question: 'What happens if a quote arrives after the deadline?',
    answer:
      'It is refused. The deadline is enforced when the quote is written, on every route in — the web form, the WhatsApp reply, the API. There is no “accept late” button, because a deadline that can be waived quietly is not a deadline.',
  },
  {
    question: 'How does the Evaluation & Voting Room work?',
    answer:
      'Members you assign to that enquiry see the anonymous, scored comparison and record a vote with a reason. Votes are weighted by your organisation type, tallied automatically in real time, and appended to an immutable audit log that cannot be edited or deleted.',
  },
  {
    question: 'When do we learn who won?',
    answer:
      'When you lock the award. At that moment the winning supplier’s verified contact details and company credentials are released to you, and yours to them, so contracting can start. Everyone else stays anonymous forever.',
  },
  {
    question: `Does ${PRODUCT_NAME} handle the money?`,
    answer:
      'No. You contract and settle directly with the supplier. The platform records purchase orders, work orders, sign-offs, invoices and approvals so there is an audit trail — but no payment passes through us, and we do not guarantee one.',
  },
  {
    question: 'How do buyers navigate the 7 procurement lifecycle stages?',
    answer:
      'Buyers progress smoothly through: (1) Draft requirement specification, (2) Sourcing and supplier invitation, (3) Sealed quote evaluation and committee voting, (4) Award lock and supplier reveal, (5) Purchase order issuance and execution tracking, (6) GST tax invoice review, and (7) Payment settlement with merit rating. If an order exceeds 24 hours without action, automated Stalled SLA diagnostics help you unblock it with one click.',
  },
];

export const SUPPLIER_FAQS: FaqEntry[] = [
  {
    question: 'How do suppliers participate across the procurement lifecycle stages?',
    answer:
      'Suppliers receive enquiry invitations via portal or WhatsApp in Stage 2 (Quoting), submit competitive sealed prices without revealing company identities during Stage 3 (Evaluation), and upon award in Stage 4, receive unmasked buyer details to generate official Purchase Orders (Stage 5), submit verified GST invoices (Stage 6), and receive direct settlement with trust-building ratings (Stage 7).',
  },
  {
    question: 'Will the buyer know it is us when they compare quotes?',
    answer:
      'No. You appear as an alias for that enquiry only. Your company name, contact person, phone number, email, logo, tax ID and address are not present in the data the buyer’s comparison screen reads.',
  },
  {
    question: 'Do we know who the buyer is?',
    answer:
      'Not by default. You see the specification, the delivery city, the criteria and the weights — enough to price the work and the travel — and the buying organisation stays masked unless they choose to run the enquiry openly.',
  },
  {
    question: 'What stops a buyer from just picking their existing supplier?',
    answer:
      'They cannot see which quote is their existing supplier. Quotes are ranked by the formula published before quoting opened, votes carry a recorded reason, and the whole sequence is in an append-only trail. Favouring a name becomes something you would have to do in writing.',
  },
  {
    question: 'Can we quote from WhatsApp?',
    answer:
      'Yes. Through the WhatsApp and SMS channel, you can receive the enquiry reference on WhatsApp, reply directly with your price and timeline, and our automated parser records it as an identity-protected quote. You also receive a secure single-use link to submit itemised specifications and documentation without creating a complex account upfront.',
  },
  {
    question: 'Can we revise our price?',
    answer:
      'Until the revision deadline for that enquiry. Every revision is a new version with the old one kept, so a buyer can see that you improved your offer and cannot pretend they never saw the first one.',
  },
  {
    question: 'What do we get if we win, and if we lose?',
    answer:
      "If you win, the buyer's verified contact details and company credentials are released to you when the award is locked, and the order, work and invoices run through the platform. If you lose, you are told the enquiry closed, and your identity stays masked permanently — losing a quote does not put you on anybody's list.",
  },
  {
    question: 'Are there lead fees?',
    answer:
      'No. Enquiries reach you because you declared the capability and the coverage, not because you paid for placement, and your details are not resold.',
  },
];

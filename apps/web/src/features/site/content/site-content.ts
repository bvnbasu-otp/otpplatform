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
 * rather than an implication. Public copy is written for customers: it says what
 * happens to them, never how the system is built. Implementation terms belong in
 * internal documentation, not on any unauthenticated page, the FAQ included.
 */

import {
  PRODUCT_NAME,
  PRODUCT_PLATFORM_SUBTITLE,
  PRODUCT_TAGLINE,
  PRODUCT_TITLE,
  PUBLIC_JOURNEY_STEPS,
} from '@/lib/brand';

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
  title: PRODUCT_TITLE,
  tagline: PRODUCT_TAGLINE,
  body: PRODUCT_PLATFORM_SUBTITLE,
  prompt: 'What do you need to procure today?',
  promptExample: 'e.g. 10 HP borewell motor winding in Coimbatore within 3 days',
};

export interface JourneyStep {
  title: (typeof PUBLIC_JOURNEY_STEPS)[number];
  body: string;
}

const JOURNEY_STEP_BODY: Record<(typeof PUBLIC_JOURNEY_STEPS)[number], string> = {
  Request: 'Describe what you need, in your own words.',
  Compare: 'Suppliers send quotes. See price, delivery and warranty side by side.',
  Decide: 'You choose the best offer. Supplier names are shown only after you decide.',
  Purchase: 'Send the order to the supplier you chose and pay them directly.',
  Track: 'Follow the work until it is delivered and signed off.',
};

/**
 * The one customer journey shown on public pages. Internal workflow stages
 * (discovery, clarification, voting, reveal…) stay inside the app.
 */
export const PUBLIC_JOURNEY: JourneyStep[] = PUBLIC_JOURNEY_STEPS.map((title) => ({
  title,
  body: JOURNEY_STEP_BODY[title],
}));

export interface TrustPrinciple {
  title: string;
  body: string;
}

/**
 * What a customer can rely on, kept apart from the journey so the steps read as
 * steps and the promises read as promises.
 */
export const TRUST_PRINCIPLES: TrustPrinciple[] = [
  {
    title: 'Identity-protected quotes',
    body: 'Suppliers see your requirement, not your name. You see prices, not supplier names — until you award.',
  },
  {
    title: 'You decide',
    body: `${PRODUCT_NAME} never picks a supplier for you. You decide — or your committee, if your RWA has set one up.`,
  },
  {
    title: 'A clear record',
    body: 'Every request, quote and decision is saved with who did it and when, so you can show how a choice was made.',
  },
  {
    title: 'Your money stays with you',
    body: `You pay the supplier directly. ${PRODUCT_NAME} does not collect, hold or settle payments.`,
  },
];

export const CORE_MESSAGE = {
  headline: 'Don’t choose a supplier. Let competition help you choose.',
  definition:
    'An identity-protected competitive sourcing and procurement platform.',
  caveat:
    'The lowest quote isn’t necessarily the best quote. '
    + `${PRODUCT_NAME} standardizes the comparison across price, delivery speed, and warranty terms to reduce identity-driven bias by design.`,
};

export interface Audience {
  name: string;
  body: string;
}

/**
 * The three canonical buyer types: Individual, MSME, and Community / RWA.
 * A community running a committee vote and an individual replacing a
 * burnt-out motor use the same engine at different governance weights.
 */
export const AUDIENCES: Audience[] = [
  { name: 'Individual', body: 'Source products and services competitively.' },
  { name: 'MSME', body: 'Buy better without building a large procurement function.' },
  { name: 'Community / RWA', body: 'Run transparent, democratic evaluation & voting.' },
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
    description: 'Suppliers who have registered on OTP and told us what they do and where they work.',
    badgeIcon: '✓',
  },
  {
    name: 'Direct suppliers',
    status: 'LIVE',
    description: 'Buyers directly invite preferred vendors or known contractors and share an invite link so they can submit sealed quotes.',
    badgeIcon: '⚡',
  },
  {
    name: 'WhatsApp and SMS',
    status: 'PLANNED',
    description: 'Not yet live. OTP does not currently send requests to suppliers by WhatsApp or SMS.',
    badgeIcon: '💬',
  },
  {
    name: 'ONDC',
    status: 'PLANNED',
    description: 'Not connected. OTP does not discover or invite suppliers through ONDC.',
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
    'Prevents predatory pricing: buyer identity is protected',
    'Assures full GST & ITC compliance upon award',
    'One consistent scoring formula for every quote',
    'Votes carry a recorded reason and end-to-end audit trail',
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
 * Answered in the customer's words. Anything that needs a technical term to
 * explain belongs in internal documentation, not here.
 */
export const GENERAL_FAQS: FaqEntry[] = [
  {
    question: `What is ${PRODUCT_NAME}?`,
    answer:
      `${PRODUCT_NAME} (Open Trade & Procurement) is an identity-protected competitive sourcing platform. `
      + 'You describe what you need, suppliers send competing quotes, and you compare them side by side '
      + 'to make a better buying decision. Neither side sees who the other is until you award the work.',
  },
  {
    question: `Who can use ${PRODUCT_NAME}?`,
    answer:
      'Individuals, small and medium businesses, housing societies and RWAs, and institutions. '
      + 'Everyone follows the same simple process; what changes is how many people need to approve the decision.',
  },
  {
    question: `How do I buy something through ${PRODUCT_NAME}?`,
    answer:
      'Register, then raise a request: say what you need, where and by when, in your own words. '
      + 'Suitable suppliers are invited to quote, their quotes come back to you side by side, and you choose. '
      + 'You then send the purchase order to that supplier and track the work until it is done.',
  },
  {
    question: 'How do suppliers take part?',
    answer:
      'Suppliers register once and say what they do and where they work. When a request matches, they are '
      + 'invited to quote on the website. WhatsApp and SMS invitations are planned but not yet live. '
      + 'Buyers can also invite suppliers they already know. Every supplier quotes under the same rules and deadline.',
  },
  {
    question: 'How are suppliers discovered for my request?',
    answer:
      'From your request. OTP looks at the kind of work and where it needs to be done, and suggests suppliers '
      + 'from the OTP supplier registry who have said they do that work in that area and have room to take it on. '
      + 'Their record on past jobs counts too. You choose who to invite — no supplier can pay to be placed higher.',
  },
  {
    question: 'How are quotes compared?',
    answer:
      'Every quote is shown in the same format — price, delivery time and warranty — with a score based on '
      + 'weights you choose before quoting opens. The lowest price does not automatically win: a slightly dearer '
      + 'quote with faster delivery and a longer warranty can score higher. Supplier names are hidden while you compare.',
  },
  {
    question: 'How is identity protected?',
    answer:
      'While quotes are collected and compared, suppliers do not see who the buyer is, and the buyer sees '
      + 'suppliers only as labels such as “Supplier A7K3”. Names, phone numbers and company details are withheld, '
      + 'not just covered up on screen. Only when you award the work are you and the chosen supplier introduced. '
      + 'Suppliers who were not chosen stay masked permanently.',
  },
  {
    question: 'Who makes the decision, and how does approval work?',
    answer:
      `You do. ${PRODUCT_NAME} never chooses a supplier for you. An individual or business decides alone, or with `
      + 'the approvers they add. Housing societies and RWAs that have set up a committee vote on the comparison, '
      + 'each member records a reason, and the award follows the committee’s decision.',
  },
  {
    question: 'What happens after the award, and how do I track my order?',
    answer:
      `You send a purchase order to the chosen supplier from within ${PRODUCT_NAME}. The supplier updates progress `
      + 'as the work goes on, you sign off when it is done, and the invoice is recorded against the same order. '
      + 'Everything stays linked to your original request, so you can always see where an order stands.',
  },
  {
    question: 'What does Pilot Mode mean?',
    answer:
      `${PRODUCT_NAME} is currently running as a pilot. During the pilot no payments are processed through `
      + `${PRODUCT_NAME} and nothing is charged: plans cost ₹0 and the supplier fee is waived. The prices on the `
      + 'pricing page show what will apply after the pilot.',
  },
  {
    question: `How does ${PRODUCT_NAME} make money?`,
    answer:
      'Through a subscription paid by buyers, shown on the pricing page. Suppliers are not charged to register, '
      + 'to be invited or to quote, and there are no lead fees. After the pilot, a small fee applies only to orders '
      + 'a supplier wins; during the pilot it is waived and nothing is charged to anyone.',
  },
  {
    question: `Does ${PRODUCT_NAME} use AI to read my request?`,
    answer:
      'No. Your words are turned into a structured request using fixed rules that look for the type of work, '
      + 'quantities, units, place and dates. It shows you what it understood so you can correct anything it missed.',
  },
];

export const BUYER_FAQS: FaqEntry[] = [
  {
    question: 'How is OTP similar to GeM?',
    answer:
      "GeM is India's Government e-Marketplace for digital procurement by government organizations. OTP is an independent platform designed for housing societies, RWAs, MSMEs and other organizations. The similarity is in the procurement experience: structured requirements, competitive proposals, transparent comparison, governed decisions and an end-to-end purchase record. OTP is not affiliated with, endorsed by, or operated by GeM or the Government of India.",
  },
  {
    question: 'Can I invite suppliers I already work with?',
    answer:
      'Yes. With the Direct suppliers option you can invite a contractor or vendor you already know and share '
      + 'the invite link with them yourself. They quote on the same request, under the same rules and deadline as '
      + 'everyone else, and appear to you under a label like any other supplier until you award.',
  },
  {
    question: 'How is a supplier hidden from us?',
    answer:
      'Each supplier appears under a label, such as “Supplier K7P4”, that changes from one request to the next, '
      + 'so you cannot recognise the same firm across requests. Company names, contact details and tax numbers '
      + 'are not sent to your comparison screen at all — they are withheld, not just covered up.',
  },
  {
    question: 'Can we see reliability without seeing who it is?',
    answer:
      'Yes. Ratings, on-time record and number of jobs are shown in bands — half a star, five percent, '
      + '“20–49 jobs” — rather than exact figures, because an exact 4.37 rating would be as recognisable as a name.',
  },
  {
    question: 'Who sets the scoring formula, and can it be changed midway?',
    answer:
      'You do, before quoting opens. You choose how much price, delivery time, warranty and any other criteria '
      + 'count, and every quote is scored the same way. If the weights are changed after quotes arrive, that '
      + 'change is recorded where everyone involved can see it.',
  },
  {
    question: 'What happens if a quote arrives after the deadline?',
    answer:
      'It is refused. The deadline is enforced automatically on every quote, whether it comes through the '
      + 'website or an invite link, and there is no button to accept a late quote — a deadline that can be quietly '
      + 'waived is not a deadline.',
  },
  {
    question: 'How does committee voting work?',
    answer:
      'Members you add to the request see the same scored comparison, with supplier names hidden, and each '
      + 'records a vote with a reason. Votes are counted automatically and kept on record, and they cannot be '
      + 'edited or deleted afterwards.',
  },
  {
    question: 'When do we learn who won?',
    answer:
      'When you confirm the award. At that moment the winning supplier’s contact and company details are '
      + 'shared with you, and yours with them, so you can agree terms. Everyone else stays anonymous forever.',
  },
  {
    question: `Does ${PRODUCT_NAME} handle the money?`,
    answer:
      'No. You agree terms with the supplier and pay them directly. The platform records the purchase order, '
      + 'the work, sign-offs, invoices and approvals so you have a full record — but no payment passes through '
      + 'us, and we do not guarantee one.',
  },
];

export const SUPPLIER_FAQS: FaqEntry[] = [
  {
    question: 'Will the buyer know it is us when they compare quotes?',
    answer:
      'No. You appear under a label for that request only. Your company name, contact person, phone number, '
      + 'email, logo, tax number and address are not shown to the buyer unless they award the work to you.',
  },
  {
    question: 'Do we know who the buyer is?',
    answer:
      'Not by default. You see what is needed, the delivery city and how quotes will be scored — enough to '
      + 'price the work and the travel — and the buyer’s name stays hidden unless they choose to run the request openly.',
  },
  {
    question: 'What stops a buyer from just picking their existing supplier?',
    answer:
      'They cannot tell which quote is from their existing supplier. Quotes are scored the same way, on weights '
      + 'set before quoting opened, every vote carries a written reason, and each step is kept on record. '
      + 'Favouring a name would have to be done openly and in writing.',
  },
  {
    question: 'Can we quote without registering first?',
    answer:
      'If a buyer invites you directly, they can share a secure one-time link that lets you add your price, item '
      + 'details and documents without creating an account first. Quoting by replying to a WhatsApp or SMS '
      + 'message is planned but not yet live. The buyer never sees your contact details, and '
      + 'you never see theirs, until the work is awarded.',
  },
  {
    question: 'Can we revise our price?',
    answer:
      'Until the revision deadline for that request. Every revision is saved as a new version with the old one '
      + 'kept, so a buyer can see that you improved your offer and cannot pretend they never saw the first one.',
  },
  {
    question: 'What do we get if we win, and if we lose?',
    answer:
      "If you win, the buyer's contact and company details are shared with you when the award is confirmed, and "
      + 'the order, work and invoice are then handled through OTP. If you lose, you are told the request has '
      + "closed, and your identity stays masked permanently — losing a quote does not put you on anybody's list.",
  },
  {
    question: 'Are there lead fees?',
    answer:
      'No. Requests reach you because you declared what you do and where you work, not because you paid for '
      + 'placement, and your details are not resold. After the pilot, a small fee applies only to orders you win; '
      + 'during the pilot it is waived.',
  },
  {
    question: 'Can suppliers from ONDC or BNI take part?',
    answer:
      'Not yet. Connections to ONDC, BNI and local business associations are planned but not live, so no '
      + 'supplier can be reached through them today. Right now suppliers take part through the OTP supplier '
      + 'registry and direct invitations from buyers. WhatsApp and SMS are also planned but not yet live.',
  },
];

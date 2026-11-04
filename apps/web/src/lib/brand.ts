/** Product positioning — horizontal local procurement, not RWA-only. */

export const PRODUCT_NAME = 'X2O';
export const PRODUCT_FULL_NAME = 'Anything to Order';
export const PRODUCT_PLATFORM_NAME = 'Anything to Order';

/** X2O Visual Identity & Evolution ("Anything To Order") */
export const X2O_NAME = 'X2O';
export const X2O_FULL_NAME = 'Anything to Order';
export const X2O_TAGLINE =
  "Smarter, Faster & Built for One's Everyday Business ! just Tell, Review, Decide & Track your commercial deals digitally all in one place";
export const X2O_PHILOSOPHY =
  "Smarter, Faster & Built for One's Everyday Business ! just Tell, Review, Decide & Track your commercial deals digitally all in one place";

export const PRODUCT_TAGLINE = 'Identity-Protected Competitive Sourcing';
export const PRODUCT_PLATFORM_TITLE = 'Anything to Order';
export const PRODUCT_PLATFORM_SUBTITLE =
  "Smarter, Faster & Built for One's Everyday Business ! just Tell, Review, Decide & Track your commercial deals digitally all in one place";

/** Browser title, share cards and the public hero all use this one string. */
export const PRODUCT_TITLE = `${PRODUCT_NAME} — ${PRODUCT_PLATFORM_TITLE}`;

export const PRODUCT_PHILOSOPHY =
  "Smarter, Faster & Built for One's Everyday Business ! just Tell, Review, Decide & Track your commercial deals digitally all in one place";

/** The one customer journey shown publicly. Internal workflow states stay inside the app. */
export const PUBLIC_JOURNEY_STEPS = ['Tell', 'Review', 'Decide', 'Track'] as const;
export const PRODUCT_JOURNEY_STATEMENT = `${PUBLIC_JOURNEY_STEPS.join('. ')}.`;

/**
 * The date the public copy was last reviewed. Bump it here when the copy is
 * reviewed again; pages that show a "last updated" line read it from here
 * rather than each carrying their own literal that goes stale separately.
 */
export const PUBLIC_CONTENT_LAST_REVIEWED = '17 October 2026';

export const PRODUCT_CONCEPT =
  'A local procurement network and procurement operating system — one engine, any buyer, any locality, any supplier network.';

export const IDENTITY_PROTECTED_RFQ_LABEL = 'Identity-Protected Evaluation';

export const IDENTITY_PROTECTED_RFQ_DESCRIPTION =
  'Supplier and buyer identities stay hidden during commercial comparison. Evaluation & Voting Room decides on merit; winning supplier contact & GST details are revealed only after award.';

/** Legacy constant - use IDENTITY_PROTECTED_RFQ_LABEL instead */
export const BLIND_RFQ_LABEL = IDENTITY_PROTECTED_RFQ_LABEL;
/** Legacy constant - use IDENTITY_PROTECTED_RFQ_DESCRIPTION instead */
export const BLIND_RFQ_DESCRIPTION = IDENTITY_PROTECTED_RFQ_DESCRIPTION;

/** Current demo scenario — Pilot 1 of a horizontal platform (not the product scope). */
export const PILOT_LABEL = 'Pilot 1 · Local facility service';
export const PILOT_LOCATION = 'Bengaluru';
export const PILOT_VERTICAL = 'Community · MSME · Institution · Individual';

export const BUYER_TYPES = [
  'Individual',
  'MSME',
  'Community',
  'Local business',
  'Institution',
] as const;

export const SUPPLIER_NETWORKS = [
  'ONDC',
  'BNI',
  'Trade associations',
  'Direct suppliers',
  'X2O Local registry',
] as const;

/**
 * What the platform does and, just as importantly, what it does not do.
 *
 * Money never moves through OTP. Buyers and suppliers contract and settle
 * directly, and saying so on every unauthenticated page is not legal
 * decoration — it is the single most consequential thing a new user can
 * misunderstand about the product.
 */
/**
 * Split where the meaning splits: what the platform is, then what it will not do
 * with your money. A footer that lets the browser choose the break puts "does not
 * collect, hold, settle" wherever the column width happens to fall, and the one
 * sentence a supplier must not skim deserves a line of its own.
 *
 * Both lines are kept short enough to survive a narrow window without wrapping
 * inside themselves. "Facilitation" is the word doing the legal work in the first
 * one — it is what says the platform is not a party to the transaction — so it
 * stays however much else is trimmed.
 */
export const PLATFORM_DISCLAIMER_LINES = [
  `Platform Disclaimer: ${PRODUCT_NAME} is a subscription-based procurement facilitation `
  + 'platform. Buyers and Sellers negotiate, contract and settle directly.',
  `${PRODUCT_NAME} does not collect, hold, settle, or guarantee Buyer-Seller payments.`,
] as const;

/** The same text as one string, for the places that set it as a single paragraph. */
export const PLATFORM_DISCLAIMER = PLATFORM_DISCLAIMER_LINES.join(' ');

/**
 * OTP Next / X2O positioning — next-generation operating system & network.
 */
export const OTP_NEXT_NAME = 'X2O';
export const OTP_NEXT_CODE = 'Anything to Order';
export const OTP_NEXT_FULL_TITLE =
  'X2O — Anything To Order: Modern Digital Procurement Platform';
export const OTP_NEXT_DESCRIPTION =
  'Dual-speed procurement engine powering Express Quick Orders and Governed Multi-Quote RFQs across 17 verified categories with identity-protected evaluation.';

/**
 * White-Label & Brand Architecture:
 * Evolved standard: X2O ("Anything To Order").
 */
export const ACTIVE_BRAND_CODE = 'X2O';
export const ACTIVE_BRAND_NAME = 'X2O';
export const ACTIVE_BRAND_FULL_NAME = 'X2O — Anything to Order';
export const ACTIVE_BRAND_TAGLINE = 'Continuous Commerce & Frictionless Procurement';

export const OTP_NEXT_FEATURES = [
  'Dual-Speed Procurement: Express Quick Orders & Governed RFQs',
  '17-Category Radial Supplier Network Engine (SNE)',
  'Cryptographically Decoupled Identity-Protected Quoting',
  'Direct Buyer-Seller Settlement with 0.50% Wallet Fee Accounting',
  'Multi-Persona Internal & Executive Operating Consoles',
] as const;


/** Product positioning — horizontal local procurement, not RWA-only. */

export const PRODUCT_NAME = 'OTP';
export const PRODUCT_FULL_NAME = 'Open Trade & Procurement';

export const PRODUCT_TAGLINE = 'Identity-Protected Competitive Sourcing';
export const PRODUCT_PLATFORM_SUBTITLE = 'Neutral Sourcing & Governance Platform';
export const PRODUCT_JOURNEY_STATEMENT = 'Request. Compare. Decide.';

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
  'OTP Local registry',
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

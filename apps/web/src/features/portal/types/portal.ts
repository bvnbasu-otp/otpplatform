/**
 * The two sides of the market, as the unauthenticated pages present them.
 *
 * A visitor arrives as one or the other and almost never both, so everything on
 * the registration page — the copy, the illustrations, the fields on the form —
 * is chosen by this one value rather than compromised between them.
 *
 * There is no path per side any more. Each side used to have its own page at
 * /buyer and /seller carrying a second copy of the sign-in and registration
 * forms; both are now query parameters on /signup, so the side is a choice within
 * a page rather than an address of its own.
 */
export type PortalSide = 'BUYER' | 'SUPPLIER';

export interface PortalCopy {
  side: PortalSide;
  /** Label on the side switch. */
  switchLabel: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  /** What signing up gets them, in their own terms. */
  propositions: { title: string; body: string }[];
  signInTitle: string;
  registerTitle: string;
  registerSubtitle: string;
}

export const BUYER_COPY: PortalCopy = {
  side: 'BUYER',
  switchLabel: 'I need work to be done',
  eyebrow: 'Buyer portal',
  headline: 'Say what you need. Let suppliers compete for it.',
  subhead:
    'Raise a request once. Verified suppliers quote against it, you compare them side by side, and your committee signs off with the reasoning on record.',
  propositions: [
    {
      title: 'Raise a request',
      body: 'Describe the job in your own words. The platform turns it into a specification suppliers can price against.',
    },
    {
      title: 'Verified suppliers',
      body: 'Requests reach firms that have declared the capability and the coverage to do the work — not whoever paid for placement.',
    },
    {
      title: 'L1–L3 quote comparison',
      body: 'Quotes arrive ranked on the criteria you set, broken down line by line, with supplier identities hidden until you award.',
    },
    {
      title: 'Execution tracking',
      body: 'Work orders, sign-offs and an append-only audit trail from purchase order through to payment approval.',
    },
  ],
  signInTitle: 'Sign in to your organisation',
  registerTitle: 'Register your organisation',
  registerSubtitle:
    'Tell us who you are buying for. We verify the organisation before your first request goes out.',
};

export const SUPPLIER_COPY: PortalCopy = {
  side: 'SUPPLIER',
  switchLabel: 'I provide services',
  eyebrow: 'Supplier portal',
  headline: 'Commercial work, priced on merit.',
  subhead:
    'Declare what you can do and where you will travel. Matching requests come to you, and you are judged on your offer rather than on who you know.',
  propositions: [
    {
      title: 'Direct commercial leads',
      body: 'Real requests from verified buyers in your categories and your coverage area. No lead fees, no reselling your details.',
    },
    {
      title: 'Transparent quoting',
      body: 'You see the criteria before you quote. Every quoting supplier is judged on the same weights, and nobody sees your name while they compare.',
    },
    {
      title: 'Work order tracking',
      body: 'Log progress with proof of work so sign-off and payment approval are not waiting on a phone call.',
    },
  ],
  signInTitle: 'Sign in to your business',
  registerTitle: 'Register your business',
  registerSubtitle:
    'What you can do and where you work is what makes you findable. Everything else can wait.',
};

export const PORTALS: PortalCopy[] = [BUYER_COPY, SUPPLIER_COPY];

export function copyFor(side: PortalSide): PortalCopy {
  return side === 'BUYER' ? BUYER_COPY : SUPPLIER_COPY;
}

export function otherSide(side: PortalSide): PortalSide {
  return side === 'BUYER' ? 'SUPPLIER' : 'BUYER';
}

/**
 * The side named in a URL, if it names one at all.
 *
 * Both words for the selling side are accepted because the product uses both: the
 * copy says "supplier" throughout and the route is /seller, so whichever one a
 * person reaches for should land them on the right form rather than silently on
 * the other one. Anything unrecognised is treated as absent, not as an error —
 * a mistyped parameter should still show a registration form.
 */
export function sideFromParam(value: string | null): PortalSide | null {
  switch (value?.trim().toLowerCase()) {
    case 'buyer':
      return 'BUYER';
    case 'supplier':
    case 'seller':
      return 'SUPPLIER';
    default:
      return null;
  }
}

/** The canonical query value, so a link built here is a link that parses here. */
export function sideParam(side: PortalSide): string {
  return side === 'BUYER' ? 'buyer' : 'supplier';
}

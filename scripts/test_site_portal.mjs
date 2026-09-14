import {
  AUDIENCES,
  BUYER_FAQS,
  CONTRASTS,
  CORE_MESSAGE,
  DEMO_RFQ,
  GENERAL_FAQS,
  HERO,
  LIFECYCLE_GROUPS,
  PHASES,
  PILLARS,
  ROLE_SUMMARY,
  SUPPLIER_CHANNELS,
  SUPPLIER_FAQS,
} from '../apps/web/src/features/site/content/site-content.js';
import {
  BUYER_COPY,
  PORTALS,
  SUPPLIER_COPY,
  copyFor,
  otherSide,
  sideFromParam,
  sideParam,
} from '../apps/web/src/features/portal/types/portal.js';
import {
  humanizeSignupError,
  normalizePhone,
  resolveBuyerOrganisation,
  resolveBuyerRoleCode,
} from '../apps/web/src/features/portal/api/signup.js';
import {
  PLATFORM_DISCLAIMER,
  PLATFORM_DISCLAIMER_LINES,
  PRODUCT_NAME,
} from '../apps/web/src/lib/brand.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`❌ FAILED: ${message}`);
  }
}

console.log('=================================================================');
console.log('  🧪 RUNNING SITE & PORTAL UNIT TESTS');
console.log('=================================================================');

// 1. Site content tests
assert(/identity[- ]protected/i.test(HERO.tagline), 'HERO.tagline mentions identity-protected');
assert(/procure smarter/i.test(HERO.title), 'HERO.title mentions procure smarter');
assert(AUDIENCES.length === 4, '4 buyer audiences defined');
assert(PILLARS.length === 4, '4 pillars defined');
assert(LIFECYCLE_GROUPS.length === 3, '3 lifecycle groups defined');
assert(PHASES.length === 4, '4 phases defined');
assert(SUPPLIER_CHANNELS.length >= 4, 'Supplier channels defined');

// 2. Portal tests
assert(copyFor('BUYER') === BUYER_COPY, 'copyFor BUYER returns BUYER_COPY');
assert(copyFor('SUPPLIER') === SUPPLIER_COPY, 'copyFor SUPPLIER returns SUPPLIER_COPY');
assert(otherSide('BUYER') === 'SUPPLIER', 'otherSide BUYER is SUPPLIER');
assert(sideFromParam('buyer') === 'BUYER', 'sideFromParam buyer is BUYER');
assert(sideFromParam('supplier') === 'SUPPLIER', 'sideFromParam supplier is SUPPLIER');
assert(sideFromParam('seller') === 'SUPPLIER', 'sideFromParam seller is SUPPLIER');

// 3. Normalization tests
assert(normalizePhone('9876543210') === '+919876543210', 'Phone normalize 10 digit to +91');
assert(resolveBuyerOrganisation('INDIVIDUAL', '') === 'Self', 'Individual buyer defaults to Self');
assert(resolveBuyerRoleCode('INDIVIDUAL') === 'PROPERTY_OWNER', 'Individual buyer role is PROPERTY_OWNER');

// 4. Vocabulary invariance
const prohibitedTerms = /\b(bid|bids|bidder|bidders|bidding|blind)\b/i;
const allStrings = [
  ...PILLARS.flatMap(p => [p.title, p.body]),
  ...AUDIENCES.flatMap(a => [a.name, a.body]),
  ...LIFECYCLE_GROUPS.flatMap(g => [g.name, g.body, ...g.stages]),
  ...PHASES.flatMap(p => [p.title, p.window]),
  ...SUPPLIER_CHANNELS.flatMap(c => [c.name, c.description || '']),
  ...BUYER_COPY.propositions.flatMap(p => [p.title, p.body]),
  ...SUPPLIER_COPY.propositions.flatMap(p => [p.title, p.body]),
  ...GENERAL_FAQS.flatMap(f => [f.question, f.answer]),
  ...BUYER_FAQS.flatMap(f => [f.question, f.answer]),
  ...SUPPLIER_FAQS.flatMap(f => [f.question, f.answer]),
];

let vocabErrors = 0;
allStrings.forEach(str => {
  if (prohibitedTerms.test(str)) {
    vocabErrors++;
    console.error(`❌ Vocabulary violation in text: "${str}"`);
  }
});
assert(vocabErrors === 0, 'Zero vocabulary violations in site and portal copy structures');

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
process.exit(0);

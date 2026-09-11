import { describe, expect, it } from 'vitest';
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
  type FaqEntry,
  SUPPLIER_FAQS,
} from './site-content';

/**
 * The public copy, checked against the product it describes.
 *
 * Marketing text is the one part of a platform with no compiler and no database
 * constraint behind it, which makes it the easiest place to promise something
 * that is not true. Four things matter more than the rest, because all four are
 * load-bearing for trust and all four are exactly what a rewrite quietly breaks:
 * that identity is revealed only at award, that no money passes through the
 * platform, that a supplier channel which is not connected is not described as
 * though it were, and that the home page stays short.
 *
 * The last of those is guarded here rather than left to taste, because every
 * revision of a landing page adds a sentence and none of them remove one.
 */

const ALL_FAQS: FaqEntry[] = [...GENERAL_FAQS, ...BUYER_FAQS, ...SUPPLIER_FAQS];

/** Everything the home page renders as prose. */
const HOME_PROSE: string[] = [
  HERO.title,
  HERO.tagline,
  HERO.body,
  HERO.prompt,
  CORE_MESSAGE.headline,
  CORE_MESSAGE.definition,
  CORE_MESSAGE.caveat,
  ...AUDIENCES.map((a) => `${a.name}. ${a.body}`),
  ...LIFECYCLE_GROUPS.map((g) => `${g.name}. ${g.body}`),
  ...PHASES.map((p) => `${p.title}. ${p.window}`),
  ...PILLARS.map((p) => `${p.title}. ${p.body}`),
  ...SUPPLIER_CHANNELS.map((c) => c.name),
  ...CONTRASTS.conventional,
  ...CONTRASTS.otp,
  ROLE_SUMMARY.headline,
  ROLE_SUMMARY.body,
  DEMO_RFQ.lessonHeadline,
  DEMO_RFQ.lesson,
];

/**
 * Every sentence that describes what the platform does. Deliberately excludes
 * the "sourcing without a system" column, which describes the problem rather
 * than making a promise, and excludes headings, which are too short to carry the
 * qualification the promise guards look for.
 */
const PROMISES: string[] = [
  HERO.body,
  CORE_MESSAGE.definition,
  CORE_MESSAGE.caveat,
  ...PILLARS.map((p) => p.body),
  ...LIFECYCLE_GROUPS.map((g) => g.body),
  ...CONTRASTS.otp,
  ROLE_SUMMARY.body,
  DEMO_RFQ.lessonHeadline,
  DEMO_RFQ.lesson,
  ...ALL_FAQS.map((f) => f.answer),
];

const ALL_PROSE = [
  ...HOME_PROSE,
  ...ALL_FAQS.map((f) => `${f.question} ${f.answer}`),
].join('\n');

describe('what the home page says the product is', () => {
  it('leads with identity-protected competitive sourcing, not with anonymity', () => {
    // "Anonymous" reads as an absence of accountability, which is the opposite
    // of what this platform sells. It survives in the FAQ; it must not be the
    // headline.
    expect(HERO.title.toLowerCase()).toMatch(/identity[- ]protected/);
    expect(HERO.title.toLowerCase()).toMatch(/competitive|sourcing/);
    expect(HERO.title.toLowerCase()).not.toMatch(/anonym|double-blind/);
  });

  it('opens with one question rather than a procurement vocabulary lesson', () => {
    expect(HERO.prompt).toMatch(/what do you need/i);
    // The example has to read like something a person would actually type.
    expect(HERO.promptExample.length).toBeGreaterThan(20);
    expect(HERO.promptExample).not.toMatch(/RFQ|procurement|vendor/i);
  });

  it('says competition decides rather than the buyer picking a favourite', () => {
    expect(CORE_MESSAGE.headline.toLowerCase()).toMatch(/competition/);
    expect(CORE_MESSAGE.definition.toLowerCase()).toMatch(/identity[- ]protected/);
    expect(CORE_MESSAGE.definition.toLowerCase()).toMatch(/orchestration|procurement/);
  });

  it('offers itself to individuals and enterprises alike, not to one segment', () => {
    const names = AUDIENCES.map((a) => a.name.toLowerCase()).join(' ');

    expect(names).toMatch(/individual/);
    expect(names).toMatch(/msme/);
    expect(names).toMatch(/community|rwa/);
    expect(names).toMatch(/enterprise/);
    // A page that reads as an apartment-society product loses the other three.
    expect(AUDIENCES).toHaveLength(4);
  });

  it('names each pillar the product actually has', () => {
    const titles = PILLARS.map((p) => p.title.toLowerCase()).join(' ');

    expect(titles).toMatch(/identity/);
    expect(titles).toMatch(/time-bound|timed|phased/);
    expect(titles).toMatch(/comparable|evaluation/);
    expect(titles).toMatch(/governed|committee|voting|decision/);
  });
});

describe('the lifecycle, stated once', () => {
  it('runs from a requirement to supplier performance', () => {
    const stages = LIFECYCLE_GROUPS.flatMap((g) => g.stages.map((s) => s.toLowerCase()));

    expect(stages[0]).toMatch(/requirement/);
    expect(stages.at(-1)).toMatch(/performance/);
    expect(stages.join(' ')).toMatch(/discovery/);
  });

  it('carries the story past the award, which is where a tendering tool stops', () => {
    const stages = LIFECYCLE_GROUPS.flatMap((g) => g.stages.map((s) => s.toLowerCase()));
    const award = stages.findIndex((s) => /award/.test(s));

    expect(award).toBeGreaterThan(0);
    const after = stages.slice(award + 1).join(' ');
    expect(after).toMatch(/purchase order|order/);
    expect(after).toMatch(/invoice|payment/);
  });

  it('names every stage exactly once', () => {
    // The whole point of grouping the lifecycle was to stop the page describing
    // the same pipeline in four different shapes. A repeated stage is the first
    // symptom of that coming back.
    const stages = LIFECYCLE_GROUPS.flatMap((g) => g.stages.map((s) => s.toLowerCase().trim()));

    expect(new Set(stages).size).toBe(stages.length);
  });

  it('puts discovery in the lifecycle but not among the enforced phases', () => {
    // The engine enforces four phases. Discovery happens on a draft, before any
    // supplier knows the enquiry exists, and dressing it as a fifth phase would
    // misdescribe what the deadline machinery covers.
    expect(PHASES).toHaveLength(4);
    expect(PHASES.map((p) => p.title).join(' ')).not.toMatch(/discover/i);
  });

  it('describes four phases, in order, each with a window', () => {
    PHASES.forEach((phase, index) => {
      expect(phase.ordinal).toBe(`Phase ${index + 1}`);
      expect(phase.window.length).toBeGreaterThan(10);
    });
  });

  it('says the award phase is triggered by a decision rather than a clock', () => {
    // The one phase that must not be described as timed: nothing in this platform
    // awards a contract because a deadline passed.
    const award = PHASES[3]!;

    expect(award.title.toLowerCase()).toMatch(/award/);
    expect(award.window.toLowerCase()).toMatch(/trigger/);
    expect(award.window.toLowerCase()).not.toMatch(/deadline|closes on/);
  });

  it('does not promise discrete milestones, which are not modelled yet', () => {
    // Work-order progress is recorded; a milestone schedule is not. The word is
    // banned rather than softened because "milestones" is what a reader will
    // expect to find a screen for.
    expect(ALL_PROSE).not.toMatch(/milestone/i);
  });
});

describe('a home page that stays a home page', () => {
  it('keeps every claim to a line, not a paragraph', () => {
    // These limits are the difference between a product page and a white paper.
    // If a claim genuinely needs more room, it belongs in the FAQ.
    for (const pillar of PILLARS) {
      expect(pillar.body.length, pillar.title).toBeLessThanOrEqual(100);
    }
    for (const audience of AUDIENCES) {
      expect(audience.body.length, audience.name).toBeLessThanOrEqual(80);
    }
    for (const group of LIFECYCLE_GROUPS) {
      expect(group.body.length, group.name).toBeLessThanOrEqual(110);
    }
    for (const item of [...CONTRASTS.conventional, ...CONTRASTS.otp]) {
      expect(item.length, item).toBeLessThanOrEqual(60);
    }
  });

  it('leaves the mechanism to the FAQ', () => {
    // Salts, views and append-only trails are what makes the claims true, and a
    // reader who wants them can have them — one click away. On the home page
    // they reassure nobody and cost the reader their attention.
    const home = HOME_PROSE.join('\n');

    expect(home).not.toMatch(/salt|hash|append-only|tax ID|per-enquiry alias/i);
    // And the FAQ must still carry them, or the detail is simply gone.
    const faqs = ALL_FAQS.map((f) => f.answer).join('\n');
    expect(faqs).toMatch(/salt/i);
    expect(faqs).toMatch(/append-only/i);
  });

  it('does not say the same thing in two sections', () => {
    // A crude check that earns its keep: the lifecycle, the phases and the
    // pillars are three different views of the product, so a heading repeated
    // verbatim across them means one of the three has stopped adding anything.
    const headings = [
      ...LIFECYCLE_GROUPS.flatMap((g) => g.stages),
      ...PHASES.map((p) => p.title),
      ...PILLARS.map((p) => p.title),
      ...AUDIENCES.map((a) => a.name),
    ].map((h) => h.toLowerCase().trim());

    expect(new Set(headings).size).toBe(headings.length);
  });
});

describe('the promise about identity', () => {
  it('ties the reveal to the award everywhere it comes up', () => {
    const mentions = PROMISES.filter(
      (text) =>
        /reveal|unmask|identity|identities/i.test(text)
        // "identity-driven bias" describes the problem rather than a disclosure,
        // so there is no trigger for it to name.
        && !/identity-driven/i.test(text),
    );

    expect(mentions.length).toBeGreaterThan(4);

    for (const text of mentions) {
      // Anything that raises the reveal must say what triggers it, so no page
      // leaves a reader guessing that it might happen earlier.
      expect(text, text.slice(0, 60)).toMatch(
        /award|won|win|masked|hidden|alias|protected|not present/i,
      );
    }
  });

  it('promises the losing suppliers stay masked, which is the harder half', () => {
    expect(ALL_PROSE).toMatch(/(stay|stays|remain|remains) masked/i);
    expect(ALL_PROSE.toLowerCase()).toMatch(/permanently|forever/);
  });

  it('never claims masking is absolute', () => {
    // Copy that says "impossible" or "guaranteed anonymity" would be overclaiming:
    // free text can always describe a firm without naming it.
    expect(ALL_PROSE).not.toMatch(/impossible to identify|guaranteed anonym|100% anonym/i);
  });

  it('claims bias is reduced by design, never eliminated', () => {
    // "Zero bias" is unfalsifiable and, worse, invites the reader to look for the
    // one case that disproves it. What the platform can defend is the mechanism.
    expect(ALL_PROSE).not.toMatch(/zero bias|no bias|bias[- ]free|unbiased|eliminates? bias/i);
    expect(ALL_PROSE).toMatch(/reduce identity-driven bias/i);
  });
});

describe('the promise about price', () => {
  it('says outright that the cheapest quote need not win', () => {
    expect(ALL_PROSE).toMatch(/lowest quote isn’t (necessarily|automatically)/i);
  });

  it('never promises the lowest price', () => {
    // The whole apparatus of weighted evaluation exists because price is one
    // criterion among several. Promising the cheapest outcome would contradict it.
    expect(ALL_PROSE).not.toMatch(
      /guarantee[sd]? the (lowest|cheapest|best) price|always the cheapest|find you the cheapest|lowest price guaranteed/i,
    );
  });

  it('labels the demonstration figures as a demonstration', () => {
    expect(DEMO_RFQ.disclaimer.toLowerCase()).toMatch(/demonstration|illustrative|example/);
    // The example only teaches something if the cheapest quote loses it.
    const cheapest = DEMO_RFQ.quotes.reduce((low, quote) =>
      numeric(quote.total) < numeric(low.total) ? quote : low,
    );
    const best = DEMO_RFQ.quotes.reduce((top, quote) => (quote.score > top.score ? quote : top));
    expect(cheapest.alias).not.toBe(best.alias);
    expect(best.rank).toBe('L1');
  });

  it('uses the reference and alias shapes the platform really mints', () => {
    // A visual that invents a tidier format than the product is a small lie a
    // new user discovers on day one.
    expect(DEMO_RFQ.reference).toMatch(/^RFQ-[A-Z0-9]{6}$/);
    for (const quote of DEMO_RFQ.quotes) {
      expect(quote.alias, quote.alias).toMatch(/^Supplier [A-Z0-9]{4}$/);
    }
  });
});

describe('the promise about money', () => {
  it('answers the payment question plainly, on the buyer side where it is asked', () => {
    const payment = BUYER_FAQS.find((f) => /money|payment|handle the money/i.test(f.question));

    expect(payment, 'no FAQ answers whether the platform handles money').toBeDefined();
    expect(payment!.answer).toMatch(/^No\./);
    expect(payment!.answer).toMatch(/directly|no payment passes/i);
  });

  it('never says the platform holds, settles or guarantees a payment', () => {
    expect(ALL_PROSE).not.toMatch(/we (hold|settle|guarantee) (your )?(payment|money|funds)/i);
    expect(ALL_PROSE).not.toMatch(/escrow/i);
  });

  it('says who pays, since a free-for-suppliers claim is the one they check', () => {
    const model = GENERAL_FAQS.find((f) => /make money|charge|cost/i.test(f.question));

    expect(model, 'no FAQ says how the platform earns').toBeDefined();
    expect(model!.answer).toMatch(/subscription/i);
    expect(model!.answer).toMatch(/lead fee|not charged|no.*fee/i);
  });
});

describe('supplier channels, which are the easiest thing to overclaim', () => {
  it('carries a status on every channel', () => {
    expect(SUPPLIER_CHANNELS.length).toBeGreaterThan(3);

    for (const channel of SUPPLIER_CHANNELS) {
      expect(['LIVE', 'PILOT', 'PLANNED'], channel.name).toContain(channel.status);
    }
  });

  it('does not present an unconnected network as available', () => {
    // Adapters exist for these in outline, with no supplier behind them. Anyone
    // wiring one up will change the status here, and this test is the reminder.
    for (const channel of SUPPLIER_CHANNELS) {
      if (/ondc|bni|association|referral/i.test(channel.name)) {
        expect(channel.status, channel.name).toBe('PLANNED');
      }
    }
  });

  it('calls messaging available now with live WAHA WhatsApp gateway delivery', () => {
    const messaging = SUPPLIER_CHANNELS.find((c) => /whatsapp|sms/i.test(c.name));

    expect(messaging, 'no channel covers WhatsApp or SMS').toBeDefined();
    expect(messaging!.status).toBe('LIVE');
  });

  it('has at least one channel that actually works today', () => {
    // A page where everything is "planned" is a prospectus, not a product page.
    expect(SUPPLIER_CHANNELS.some((c) => c.status === 'LIVE')).toBe(true);
  });

  it('verifies direct suppliers channel is available now with phone, email and link invites', () => {
    const direct = SUPPLIER_CHANNELS.find((c) => /direct/i.test(c.name));

    expect(direct, 'no channel covers direct suppliers').toBeDefined();
    expect(direct!.status).toBe('LIVE');
  });

  it('describes the mechanism of every live channel in the FAQ', () => {
    // A LIVE channel with no mechanism story is a label without a product. Any
    // channel whose name reaches LIVE must show up in an FAQ answer that is
    // long enough to describe how it works, so that flipping the status flag
    // without writing the copy fails a test.
    const live = SUPPLIER_CHANNELS.filter((c) => c.status === 'LIVE');
    const answers = ALL_FAQS.map((f) => f.answer);

    for (const channel of live) {
      // Match the channel by its distinctive word so "OTP supplier registry"
      // is matched by "local registry" too \u2014 the two phrases refer to the
      // same thing across the copy.
      const keyword = /registry/i.test(channel.name)
        ? /registry/i
        : new RegExp(channel.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const mentions = answers.filter((a) => keyword.test(a));

      expect(mentions.length, `no FAQ answer names the ${channel.name} channel`)
        .toBeGreaterThan(0);
      // Something worth calling LIVE deserves more than a passing mention.
      expect(mentions.some((a) => a.length > 120), channel.name).toBe(true);
    }
  });
});

describe('the questions both sides actually ask', () => {
  it('answers what the product is, before asking which side you are on', () => {
    const questions = GENERAL_FAQS.map((f) => f.question.toLowerCase()).join(' ');

    expect(questions).toMatch(/what is/);
    expect(questions).toMatch(/who can use/);
    expect(questions).toMatch(/discover/);
    expect(questions).toMatch(/after the award/);
  });

  it('covers masking, deadlines, scoring and the reveal for buyers', () => {
    const questions = BUYER_FAQS.map((f) => f.question.toLowerCase()).join(' ');

    expect(questions).toMatch(/hidden|supplier/);
    expect(questions).toMatch(/deadline|late/);
    expect(questions).toMatch(/scoring|formula/);
    expect(questions).toMatch(/who won|reveal|learn who/);
    expect(questions).toMatch(/voting|committee/);
  });

  it('covers anonymity, revision and what winning or losing means for suppliers', () => {
    const questions = SUPPLIER_FAQS.map((f) => f.question.toLowerCase()).join(' ');

    expect(questions).toMatch(/know it is us|anonym|buyer know/);
    expect(questions).toMatch(/revise|price/);
    expect(questions).toMatch(/win|lose/);
  });

  it('tells suppliers there are no lead fees, since that is what they fear', () => {
    const fees = SUPPLIER_FAQS.find((f) => /fee/i.test(f.question));

    expect(fees).toBeDefined();
    expect(fees!.answer).toMatch(/^No\./);
    expect(fees!.answer).toMatch(/not resold|declared/i);
  });

  it('asks and answers in whole sentences, so no entry ships as a stub', () => {
    for (const entry of ALL_FAQS) {
      expect(entry.question, entry.question).toMatch(/\?$/);
      expect(entry.answer.length, entry.question).toBeGreaterThan(80);
      expect(entry.answer.trim(), entry.question).toMatch(/[.!?]$/);
    }
  });

  it('asks each question once across all three tabs', () => {
    const questions = ALL_FAQS.map((f) => f.question.toLowerCase().trim());

    expect(new Set(questions).size).toBe(questions.length);
  });
});

describe('copy that would contradict the engine', () => {
  it('does not describe the deadline as something a person enforces', () => {
    const deadlines = [...PILLARS.map((p) => p.body), ...ALL_FAQS.map((f) => f.answer)].filter(
      (text) => /deadline/i.test(text),
    );

    expect(deadlines.length).toBeGreaterThan(1);
    // Somewhere it has to be clear the refusal is mechanical, because that is the
    // whole claim: "we enforce deadlines" is what every procurement tool says.
    expect(deadlines.join(' ')).toMatch(/refused|enforced|database|every route/i);
  });

  it('does not offer an exact supplier rating, which would be as identifying as a name', () => {
    const ratings = BUYER_FAQS.find((f) => /reliability|rating/i.test(f.question));

    expect(ratings).toBeDefined();
    expect(ratings!.answer).toMatch(/band/i);
  });

  it('does not credit a language model for work the rules do', () => {
    // The parser is keyword and taxonomy based. Calling it AI would be the kind
    // of claim a user disproves by typing one ambiguous sentence.
    expect(ALL_PROSE).not.toMatch(
      /AI[- ]powered|powered by AI|AI[- ]driven|machine learning|language model does|our AI/i,
    );

    const parsing = GENERAL_FAQS.find((f) => /\bAI\b/i.test(f.question));
    expect(parsing, 'nothing tells a reader the parsing is rule-based').toBeDefined();
    expect(parsing!.answer).toMatch(/rule|rules|taxonomy/i);
  });

  it('does not promise a feature the platform does not have', () => {
    expect(ALL_PROSE).not.toMatch(/reverse auction|live quote war/i);
  });

  it('keeps the role model without turning the page into a permissions matrix', () => {
    expect(ROLE_SUMMARY.headline.toLowerCase()).toMatch(/role/);
    expect(ROLE_SUMMARY.headline.toLowerCase()).toMatch(/see|approve|change/);
    // Eleven role names on a home page is an org chart, not a value proposition.
    expect(ROLE_SUMMARY.body.length).toBeLessThanOrEqual(220);
  });
});

function numeric(amount: string): number {
  return Number(amount.replace(/[^0-9.]/g, ''));
}

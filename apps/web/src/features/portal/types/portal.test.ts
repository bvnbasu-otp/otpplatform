import { describe, expect, it } from 'vitest';
import { PLATFORM_DISCLAIMER, PLATFORM_DISCLAIMER_LINES, PRODUCT_NAME } from '@/lib/brand';
import {
  BUYER_COPY,
  PORTALS,
  SUPPLIER_COPY,
  copyFor,
  otherSide,
  sideFromParam,
  sideParam,
} from './portal';
import { BUYER_GLYPHS, SUPPLIER_GLYPHS } from '../components/PortalGlyphs';

describe('portal copy', () => {
  it('resolves each side to its own copy', () => {
    expect(copyFor('BUYER')).toBe(BUYER_COPY);
    expect(copyFor('SUPPLIER')).toBe(SUPPLIER_COPY);
  });

  it('flips to the other side of the market', () => {
    expect(otherSide('BUYER')).toBe('SUPPLIER');
    expect(otherSide('SUPPLIER')).toBe('BUYER');
  });

  it('has a glyph for every promise it makes', () => {
    expect(BUYER_GLYPHS.length).toBeGreaterThanOrEqual(BUYER_COPY.propositions.length);
    expect(SUPPLIER_GLYPHS.length).toBeGreaterThanOrEqual(
      SUPPLIER_COPY.propositions.length,
    );
  });

  it('names the four things the buyer side promises', () => {
    expect(BUYER_COPY.propositions.map((p) => p.title)).toEqual([
      'Raise a request',
      'Verified suppliers',
      'L1–L3 quote comparison',
      'Execution tracking',
    ]);
  });

  it('names the three things the supplier side promises', () => {
    expect(SUPPLIER_COPY.propositions.map((p) => p.title)).toEqual([
      'Direct commercial leads',
      'Transparent quoting',
      'Work order tracking',
    ]);
  });

  it('does not promise milestones, which are not modelled', () => {
    // Work-order progress is recorded; a discrete milestone schedule is not.
    // Same rule the public site is held to, applied to the copy behind the door.
    const prose = PORTALS.flatMap((portal) => [
      portal.headline,
      portal.subhead,
      ...portal.propositions.flatMap((p) => [p.title, p.body]),
    ]).join('\n');

    expect(prose).not.toMatch(/milestone/i);
  });

  it('describes each side in the words that side would use', () => {
    // The switch is what someone came to do, not the role name we give them.
    expect(BUYER_COPY.switchLabel).not.toMatch(/buyer/i);
    expect(SUPPLIER_COPY.switchLabel).not.toMatch(/supplier|seller/i);
    expect(BUYER_COPY.switchLabel).toBe('I need work to be done');
    expect(SUPPLIER_COPY.switchLabel).toBe('I provide services');
  });

  it('offers exactly two sides, described differently', () => {
    expect(PORTALS).toHaveLength(2);
    expect(new Set(PORTALS.map((p) => p.side)).size).toBe(2);
    expect(new Set(PORTALS.map((p) => p.headline)).size).toBe(2);
  });
});

describe('naming a side in a URL', () => {
  it('reads both sides, so neither is only reachable by default', () => {
    expect(sideFromParam('buyer')).toBe('BUYER');
    expect(sideFromParam('supplier')).toBe('SUPPLIER');
  });

  it('accepts the word the route uses as well as the word the copy uses', () => {
    // The route is /seller and the copy says "supplier". Someone hand-writing a
    // link will reach for either, and landing on the wrong form is worse than
    // being generous about the spelling.
    expect(sideFromParam('seller')).toBe('SUPPLIER');
    expect(sideFromParam('SUPPLIER')).toBe('SUPPLIER');
    expect(sideFromParam(' buyer ')).toBe('BUYER');
  });

  it('reports an absent or unrecognised side rather than guessing', () => {
    // The caller decides what a missing side means. A parser that answers
    // "BUYER" to nonsense makes a mistyped link look like a working one.
    expect(sideFromParam(null)).toBeNull();
    expect(sideFromParam('')).toBeNull();
    expect(sideFromParam('vendor')).toBeNull();
  });

  it('builds links it can read back', () => {
    expect(sideFromParam(sideParam('BUYER'))).toBe('BUYER');
    expect(sideFromParam(sideParam('SUPPLIER'))).toBe('SUPPLIER');
  });
});

describe('the payments disclaimer', () => {
  it('says the platform never touches the money', () => {
    expect(PLATFORM_DISCLAIMER).toMatch(
      /does not collect, hold, settle, or guarantee Buyer-Seller payments/,
    );
  });

  it('keeps the money sentence on a line of its own', () => {
    // The break is structural rather than a wrap the browser picks, so the one
    // sentence a supplier must not skim always starts a line.
    expect(PLATFORM_DISCLAIMER_LINES).toHaveLength(2);
    expect(PLATFORM_DISCLAIMER_LINES[1]).toMatch(/^OTP does not collect/);
  });

  it('keeps each line short enough not to wrap in a narrow window', () => {
    // Roughly 150 characters is what fits on one line of 12px text in the footer
    // of a window around 850px wide. Past that the line folds and the two-line
    // shape this is arranged for stops holding.
    for (const line of PLATFORM_DISCLAIMER_LINES) {
      expect(line.length, line).toBeLessThanOrEqual(150);
    }
  });

  it('still says the platform only facilitates', () => {
    // The word that carries the legal point: OTP is not a party to the trade.
    expect(PLATFORM_DISCLAIMER).toMatch(/facilitation/i);
  });

  it('is built from the product name, so a rename cannot leave it stale', () => {
    expect(PLATFORM_DISCLAIMER.startsWith(`Platform Disclaimer: ${PRODUCT_NAME} is`)).toBe(
      true,
    );
  });
});

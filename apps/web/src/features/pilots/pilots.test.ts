import { describe, it, expect } from 'vitest';
import { PILOTS, getPilotById, getPilotByRequirementId, getPilotByRfqId, isPilotId } from '@/lib/pilots';

describe('Pilots Feature Module Tests', () => {
  it('defines 4 canonical horizontal pilot scenarios', () => {
    expect(PILOTS).toHaveLength(4);

    const numbers = PILOTS.map(p => p.number);
    expect(numbers).toEqual([1, 2, 3, 4]);

    const locations = PILOTS.map(p => p.location);
    expect(locations).toContain('Bengaluru');
    expect(locations).toContain('Coimbatore');
    expect(locations).toContain('Tiruppur');
  });

  it('retrieves pilot by id correctly', () => {
    const p1 = getPilotById('pilot-1');
    expect(p1).toBeDefined();
    expect(p1.orgName).toBe('Greenview Apartments');
    expect(p1.buyerType).toBe('Community');

    expect(() => getPilotById('pilot-99' as any)).toThrow();
  });

  it('validates pilot id type guard', () => {
    expect(isPilotId('pilot-1')).toBe(true);
    expect(isPilotId('pilot-4')).toBe(true);
    expect(isPilotId('pilot-99')).toBe(false);
  });

  it('retrieves pilot by requirementId and rfqId correctly', () => {
    const p2Req = getPilotByRequirementId('d2000020-0000-4000-8000-000000000001');
    expect(p2Req).toBeDefined();
    expect(p2Req?.number).toBe(2);
    expect(p2Req?.location).toBe('Coimbatore');

    const p3Rfq = getPilotByRfqId('d3000021-0000-4000-8000-000000000001');
    expect(p3Rfq).toBeDefined();
    expect(p3Rfq?.number).toBe(3);
    expect(p3Rfq?.vertical).toBe('Yarn procurement');
  });

  it('ensures all pilots adhere to canonical procurement vocabulary', () => {
    const prohibitedTerms = /\b(bid|bids|bidder|bidders|bidding|blind)\b/i;
    for (const pilot of PILOTS) {
      expect(prohibitedTerms.test(pilot.label)).toBe(false);
      expect(prohibitedTerms.test(pilot.requirementTitle)).toBe(false);
      expect(prohibitedTerms.test(pilot.requirementSummary)).toBe(false);
      expect(prohibitedTerms.test(pilot.quoteSummary)).toBe(false);
    }
  });
});

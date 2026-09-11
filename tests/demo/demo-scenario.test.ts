import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO, DEMO_QUOTES } from '../../scripts/demo/constants';

/** Mirrors packages/domain BLIND_FORBIDDEN_FIELDS for test isolation */
const BLIND_FORBIDDEN_FIELDS = [
  'supplierId', 'supplier_id', 'businessName', 'business_name',
  'phone', 'email', 'address', 'source', 'matchScore', 'match_score',
] as const;

function assertBlindPayloadSafe(payload: Record<string, unknown>): void {
  for (const field of BLIND_FORBIDDEN_FIELDS) {
    if (field in payload && payload[field] !== undefined) {
      throw new Error(`Blind payload violation: forbidden field "${field}" present`);
    }
  }
}

const root = resolve(__dirname, '../..');

function readSeed(name: string): string {
  const path = resolve(root, 'supabase', name);
  expect(existsSync(path), `${name} should exist`).toBe(true);
  return readFileSync(path, 'utf8');
}

describe('Demo scenario — Durga Rainbow borewell', () => {
  const readySql = readSeed('seed_demo_ready.sql');
  const completeSql = readSeed('seed_demo_complete.sql');
  const sharedSql = readSeed('seed_demo_shared.sql');

  it('has 5 rfq invitations', () => {
    const inviteIds = Object.values(DEMO.invites);
    for (const id of inviteIds) {
      expect(sharedSql).toContain(id);
    }
    expect(sharedSql.match(/INSERT INTO rfq_invitations/g)?.length).toBe(1);
    expect(sharedSql).toContain('Supplier A');
    expect(sharedSql).toContain('Supplier E');
  });

  it('has exactly 3 quotes in ready seed (A, B, C only)', () => {
    expect(readySql).toContain(DEMO.quotes.A);
    expect(readySql).toContain(DEMO.quotes.B);
    expect(readySql).toContain(DEMO.quotes.C);
    expect(readySql).not.toContain(`'${DEMO.suppliers.D.id}'`);
    // D and E supplier IDs appear in shared invites but not in quote inserts
    const quoteInserts = readySql.match(
      /INSERT INTO quotes[\s\S]*?;/g,
    )?.[0];
    expect(quoteInserts).toBeDefined();
    expect(quoteInserts!.match(/d100004/g)?.length).toBe(3);
  });

  it('marks D as VIEWED and E as DECLINED (non-quoting)', () => {
    expect(sharedSql).toContain(`'${DEMO.invites.D}'`);
    expect(sharedSql).toContain(`'VIEWED'`);
    expect(sharedSql).toContain(`'DECLINED'`);
    expect(sharedSql).toContain('No 10 HP specialist');
  });

  it('has canonical quote prices with GST normalization', () => {
    expect(readySql).toContain(String(DEMO_QUOTES.A.totalCost));
    expect(readySql).toContain(String(DEMO_QUOTES.B.totalCost));
    expect(readySql).toContain(String(DEMO_QUOTES.C.totalCost));
    expect(readySql).toContain('gstAmount');
    expect(readySql).toContain('transportCost');
  });

  it('computes evaluation_scores for all 3 quotes', () => {
    expect(readySql).toContain(String(DEMO_QUOTES.A.evaluationScore));
    expect(readySql).toContain(String(DEMO_QUOTES.B.evaluationScore));
    expect(readySql).toContain(String(DEMO_QUOTES.C.evaluationScore));
    expect(readySql).toContain('quote_evaluations');
  });

  it('blind DTO must not include supplier_id', () => {
    const blindQuote = {
      quoteId: DEMO.quotes.A,
      anonymousLabel: 'Supplier A',
      version: 1,
      status: 'SUBMITTED',
      basePrice: DEMO_QUOTES.A.basePrice,
      gstAmount: DEMO_QUOTES.A.gstAmount,
      transportCost: DEMO_QUOTES.A.transportCost,
      totalCost: DEMO_QUOTES.A.totalCost,
      deliveryDays: DEMO_QUOTES.A.deliveryDays,
      warrantyMonths: DEMO_QUOTES.A.warrantyMonths,
      evaluationScore: DEMO_QUOTES.A.evaluationScore,
      supplierRatingAvg: 4.6,
      pastPerformanceScore: null,
      submittedAt: new Date().toISOString(),
    };
    expect(() =>
      assertBlindPayloadSafe(blindQuote as unknown as Record<string, unknown>),
    ).not.toThrow();

    for (const field of BLIND_FORBIDDEN_FIELDS) {
      const polluted = { ...blindQuote, [field]: 'leak' };
      expect(() =>
        assertBlindPayloadSafe(polluted as unknown as Record<string, unknown>),
      ).toThrow();
    }
  });

  it('complete seed has full audit trail events', () => {
    const requiredEvents = [
      'requirement.created',
      'rfq.opened',
      'quote.submitted',
      'evaluation.computed',
      'vote.cast',
      'award.recorded',
      'rfq.revealed',
      'po.issued',
      'work_order.completed',
      'payment.verified',
      'performance.recorded',
      'requirement.completed',
    ];
    for (const event of requiredEvents) {
      expect(completeSql).toContain(event);
    }
  });

  it('complete seed awards Supplier B with committee split', () => {
    expect(completeSql).toContain(DEMO.quotes.B);
    expect(completeSql).toContain('Krishna Pump Services');
    expect(completeSql).toContain('committee_votes');
    expect(completeSql).toContain('₹7,800');
  });

  it('uses fixed demo org UUID', () => {
    expect(DEMO.orgId).toBe('d1000000-0000-4000-8000-000000000001');
    expect(sharedSql).toContain(DEMO.orgId);
    expect(sharedSql).toContain('Durga Rainbow Community');
  });
});

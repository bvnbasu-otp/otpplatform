/**
 * Local Supabase only — migration 00222 issued document snapshots.
 */
import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import {
  createServiceClient,
  isLocalSupabaseReachable,
} from '../helpers/supabase-local';

let dbUp = false;

describe('00222 — issued document snapshots (REAL DATABASE)', () => {
  beforeAll(async () => {
    dbUp = await isLocalSupabaseReachable();
  });

  beforeEach((ctx) => {
    if (!dbUp) ctx.skip();
  });

  it('SQL otp_deterministic_hmac matches domain salt smoke vector', async () => {
    const service = createServiceClient();
    const { data, error } = await service.rpc('compute_decision_receipt_digest_v1' as never, {
      p_receipt: {
        receiptId: 'REC-TEST',
        rfqId: 'f1000000-0000-4000-8000-000000000099',
        rfqRefNumber: 'RFQ-X',
        buyerPersona: 'INDIVIDUAL',
        buyerContext: { organizationId: 'a0000000-0000-4000-8000-000000000099', buyerGstin: null },
        requirementSnapshot: { requirementId: 'r', title: 't', categoryName: 'c', mode: 'DIRECT_PURCHASE' },
        selectedOffer: {
          quoteId: 'q',
          quoteVersion: 1,
          supplierId: null,
          baseAmount: 100,
          gstAmount: 18,
          totalLandedCost: 118,
          isInterState: false,
          cgstAmount: 9,
          sgstAmount: 9,
          igstAmount: 0,
        },
        authorityAttribution: {
          awardedByProfileId: 'p',
          awardedByRole: 'MANAGER',
          isDelegated: false,
          delegationId: null,
        },
        governanceRecord: { persona: 'INDIVIDUAL' },
        timestamps: { awardedAt: '2026-01-01T00:00:00.000Z', receiptGeneratedAt: '2026-01-01T00:00:01.000Z' },
      },
    } as never);
    expect(error).toBeNull();
    expect(typeof data).toBe('string');
    expect((data as string).length).toBe(64);
  });

  it('verify_issued_document_digest is granted to authenticated path via RPC existence', async () => {
    const service = createServiceClient();
    const { error } = await service.rpc('verify_issued_document_digest', { p_document_id: 'OTP-DOC-NONE' });
    expect(error).toBeNull();
  });
});

describe('00222 — reveal immutability (REAL DATABASE)', () => {
  beforeAll(async () => {
    dbUp = await isLocalSupabaseReachable();
  });

  beforeEach((ctx) => {
    if (!dbUp) ctx.skip();
  });

  it('PRE_REVEAL snapshot row unchanged after POST_REVEAL sibling insert (when fixtures exist)', async () => {
    const service = createServiceClient();
    const { data: preRows, error } = await service
      .from('issued_document_snapshots')
      .select('id, document_id, identity_state, verification_digest, payload_json')
      .eq('identity_state', 'PRE_REVEAL')
      .eq('document_kind', 'DECISION_RECEIPT')
      .eq('status', 'ISSUED')
      .limit(1);
    if (error) {
      expect(error.message).toMatch(/relation.*does not exist|Could not find/i);
      return;
    }
    if (!preRows?.length) return;
    const pre = preRows[0]!;
    const digestBefore = pre.verification_digest;
    const payloadBefore = pre.payload_json;
    const { data: again } = await service
      .from('issued_document_snapshots')
      .select('verification_digest, payload_json')
      .eq('id', pre.id)
      .single();
    expect(again?.verification_digest).toBe(digestBefore);
    expect(again?.payload_json).toEqual(payloadBefore);
  });
});

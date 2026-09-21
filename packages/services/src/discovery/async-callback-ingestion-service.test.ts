import { describe, expect, it } from 'vitest';
import {
  AsyncCallbackIngestionService,
  computePayloadDigest,
} from './async-callback-ingestion-service';
import { SupplierNetwork, TruthfulProviderStatus } from '@otp/domain';

describe('AsyncCallbackIngestionService', () => {
  it('computes deterministic payload digests for identical content', () => {
    const payloadA = { candidate: 'alpha', score: 90 };
    const payloadB = { candidate: 'alpha', score: 90 };

    const digestA = computePayloadDigest(payloadA);
    const digestB = computePayloadDigest(payloadB);

    expect(digestA).toBe(digestB);
    expect(digestA).toHaveLength(64); // SHA-256 hex string
  });

  it('processes valid callback and returns normalized candidates with dynamic confidence', async () => {
    const service = new AsyncCallbackIngestionService();

    const result = await service.processCallback(
      {
        provider: SupplierNetwork.LOCAL_REGISTRY,
        messageId: 'msg-valid-100',
        transactionId: 'tx-100',
        timestamp: new Date().toISOString(),
        body: {
          candidates: [
            {
              externalRef: 'supplier-loc-100',
              businessName: 'Precision Engineering Ltd',
              capability: {
                categories: ['CNC_MACHINING'],
                verificationStatus: 'VERIFIED',
              },
              matchScore: 85,
              matchReasons: ['capability_match'],
            },
          ],
        },
      },
      'CNC_MACHINING',
    );

    expect(result.success).toBe(true);
    expect(result.candidatesProcessed).toBe(1);
    expect(result.candidates).toHaveLength(1);

    const cand = result.candidates[0]!;
    expect(cand.anonymousLabel).toMatch(/^Supplier [0-9A-HJKMNP-Z]{4}$/);
    expect(cand.matchScore).toBe(85);
    expect(cand.confidenceScore).toBeGreaterThanOrEqual(60);
    expect(cand.provenance.primaryNetwork).toBe(SupplierNetwork.LOCAL_REGISTRY);
    expect(cand.provenance.truthfulStatus).toBe(TruthfulProviderStatus.LIVE_ACTIVE);
  });

  it('rejects callback with future timestamp exceeding drift tolerance', async () => {
    const service = new AsyncCallbackIngestionService({ maxClockDriftSeconds: 60 });

    const futureTimestamp = new Date(Date.now() + 1000 * 1000).toISOString();

    const result = await service.processCallback({
      provider: SupplierNetwork.DIRECT,
      messageId: 'msg-future-101',
      transactionId: 'tx-101',
      timestamp: futureTimestamp,
      body: { candidates: [] },
    });

    expect(result.success).toBe(false);
    expect(result.verification.valid).toBe(false);
    expect(result.verification.rejectionCode).toBe('FUTURE_TIMESTAMP');
  });

  it('rejects duplicate message ID with altered payload body (integrity failure)', async () => {
    const service = new AsyncCallbackIngestionService();

    // Ingest first message
    await service.processCallback({
      provider: SupplierNetwork.BNI,
      messageId: 'msg-dup-102',
      transactionId: 'tx-102',
      timestamp: new Date().toISOString(),
      body: { version: 1, text: 'original' },
    });

    // Ingest same messageId with modified body
    const replayResult = await service.processCallback({
      provider: SupplierNetwork.BNI,
      messageId: 'msg-dup-102',
      transactionId: 'tx-102',
      timestamp: new Date().toISOString(),
      body: { version: 2, text: 'modified' },
    });

    expect(replayResult.success).toBe(false);
    expect(replayResult.verification.valid).toBe(false);
    expect(replayResult.verification.rejectionCode).toBe('INTEGRITY_MISMATCH');
  });
});

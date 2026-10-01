/**
 * ONDC-03 security checks. MOCK and in-memory only. No live network call.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OndcObservationSource,
  OndcRuntimeEnvironment,
  admitOndcOnSearchCallback,
  createOndcDiscoveryStore,
  normalizeOndcOnSearchRecord,
  ondcDiscoveryProcurementCounts,
  ondcDiscoveryRfqCapability,
  rejectOndcProviderMutation,
  resolveOndcEnvironmentGate,
  retainOndcDiscoveryFromUntrusted,
  retainOndcDiscoveryObservation,
  type OndcEnvironmentConfigInput,
} from '@otp/domain';
import { createOndcAuthHeader, generateOndcKeyPair } from '../../packages/services/src/ondc/crypto/ondc-auth-crypto';
import { OndcBapReceiver } from '../../packages/services/src/ondc/receiver/ondc-bap-receiver';

const root = fileURLToPath(new URL('../..', import.meta.url));

function read(relative: string): string {
  return readFileSync(`${root}/${relative}`, 'utf8');
}

function slot(prefix: string) {
  return {
    gatewayUrl: `https://${prefix}.example.test/gateway`,
    subscriberId: `${prefix}-slot.example.test`,
    uniqueKeyId: `${prefix}-key`,
    signingPrivateKey: `${prefix}-signing-material`,
    registryUrl: `https://${prefix}.example.test/registry`,
    callbackUrl: `https://${prefix}.example.test/callback`,
  };
}

function gate(overrides: Partial<OndcEnvironmentConfigInput> = {}): OndcEnvironmentConfigInput {
  return {
    environmentRaw: overrides.environmentRaw,
    providerEnabled: overrides.providerEnabled,
    networkEnabled: overrides.networkEnabled,
    timeoutMs: overrides.timeoutMs,
    maxRetries: overrides.maxRetries,
    productionEnabled: overrides.productionEnabled,
    preprod: overrides.preprod ?? {},
    production: overrides.production ?? {},
  };
}

function candidate() {
  const result = normalizeOndcOnSearchRecord(
    {
      participantId: 'participant-security-a',
      sellerId: 'seller-security-a',
      sellerName: 'Security Reported Seller',
      endpoint: 'https://bpp.example.test/ondc',
      sellerPin: '641001',
      correlationId: 'tx-security-a',
      messageId: 'msg-security-a',
      contextTimestamp: '2026-10-01T05:30:00.000Z',
    },
    { requestedPin: '560048', requestedCategory: 'cotton yarn' },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.candidate;
}

describe('ONDC-03 security', () => {
  it('keeps identity unique without name merge or cross-provider collision', () => {
    const store = createOndcDiscoveryStore();
    const meta = { source: OndcObservationSource.MOCK, environment: OndcRuntimeEnvironment.LOCAL } as const;
    retainOndcDiscoveryObservation(store, candidate(), meta);
    retainOndcDiscoveryObservation(store, candidate(), meta);
    const sameName = normalizeOndcOnSearchRecord(
      {
        participantId: 'participant-security-b',
        sellerId: 'seller-security-b',
        sellerName: 'Security Reported Seller',
        endpoint: 'https://bpp.example.test/ondc',
        correlationId: 'tx-security-b',
        contextTimestamp: '2026-10-01T05:40:00.000Z',
      },
      { requestedPin: '560048', requestedCategory: 'cotton yarn' },
    );
    expect(sameName.ok).toBe(true);
    if (!sameName.ok) return;
    retainOndcDiscoveryObservation(store, sameName.candidate, meta);
    expect(store.identities.size).toBe(2);
    const saved = [...store.identities.values()][0];
    expect(saved).toBeDefined();
    if (!saved) return;
    expect(rejectOndcProviderMutation(saved, 'GOOGLE_PLACES').ok).toBe(false);
    expect([...store.identities.keys()].every((key) => key.startsWith('ONDC'))).toBe(true);
  });

  it('rejects client injection and does not create invitation, quote, award, PO, or payment', () => {
    const store = createOndcDiscoveryStore();
    const meta = { source: OndcObservationSource.MOCK, environment: OndcRuntimeEnvironment.LOCAL } as const;
    expect(retainOndcDiscoveryFromUntrusted(store, { supplierId: '11111111-1111-4111-8111-111111111111', rating: 4.5 }, candidate(), meta).ok).toBe(false);
    retainOndcDiscoveryObservation(store, candidate(), meta);
    expect(ondcDiscoveryProcurementCounts(store).invitations).toBe(0);
    expect(ondcDiscoveryProcurementCounts(store).quotes).toBe(0);
    expect(ondcDiscoveryProcurementCounts(store).awards).toBe(0);
    expect(ondcDiscoveryProcurementCounts(store).purchaseOrders).toBe(0);
    expect(ondcDiscoveryProcurementCounts(store).payments).toBe(0);
    expect(ondcDiscoveryProcurementCounts(store).suppliersInserted).toBe(0);
    expect(ondcDiscoveryRfqCapability().canReceiveRfq).toBe(false);
    expect(ondcDiscoveryRfqCapability().invitationCreated).toBe(false);
  });

  it('rejects invalid and missing signatures, malformed callbacks, unknown transactions, and replays once', async () => {
    const receiver = new OndcBapReceiver({ skipSignatureVerification: true });
    expect((await receiver.verifyWebhook(null, { hello: true })).valid).toBe(false);
    expect((await receiver.verifyWebhook('Signature keyId="missing"', { hello: true })).valid).toBe(false);

    const keys = generateOndcKeyPair();
    const other = generateOndcKeyPair();
    const body = { context: { action: 'on_search', transaction_id: 'tx-security-a', message_id: 'msg-security-a' }, message: {} };
    const authHeader = createOndcAuthHeader({
      body,
      subscriberId: 'bpp.example.test',
      uniqueKeyId: 'key-security',
      privateKeyPem: keys.privateKeyPem,
    });
    const signed = new OndcBapReceiver({ lookupPublicKeyFn: async () => other.publicKeyPem });
    expect((await signed.verifyWebhook(authHeader, body)).valid).toBe(false);

    const base = {
      authorizationHeader: authHeader,
      publicKeyConfigured: true,
      signatureValid: true,
      knownTransactionIds: ['tx-security-a'],
      seenMessageKeys: [] as string[],
    };
    expect(admitOndcOnSearchCallback({ ...base, payload: { not: 'json-shape' } })).toMatchObject({ ok: false, reason: 'malformed_callback' });
    expect(admitOndcOnSearchCallback({ ...base, payload: { context: body.context, message: {} }, knownTransactionIds: [] })).toMatchObject({
      ok: false,
      reason: 'unknown_transaction',
    });
    const first = admitOndcOnSearchCallback({ ...base, payload: { context: body.context, message: {} } });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(admitOndcOnSearchCallback({ ...base, payload: { context: body.context, message: {} }, seenMessageKeys: [first.messageKey] })).toMatchObject({
      ok: true,
      replay: true,
    });
  });

  it('separates mock provenance from real network and isolates credential slots', () => {
    const store = createOndcDiscoveryStore();
    expect(
      retainOndcDiscoveryObservation(store, candidate(), {
        source: OndcObservationSource.MOCK,
        environment: OndcRuntimeEnvironment.LOCAL,
      }).ok,
    ).toBe(true);
    expect([...store.identities.values()][0]?.source).toBe('MOCK');
    expect(
      retainOndcDiscoveryObservation(store, candidate(), {
        source: OndcObservationSource.REAL_NETWORK,
        environment: OndcRuntimeEnvironment.CI,
      }).ok,
    ).toBe(false);

    const preprod = resolveOndcEnvironmentGate(gate({ environmentRaw: 'PRE_PROD', preprod: slot('preprod'), production: slot('production') }));
    const production = resolveOndcEnvironmentGate(
      gate({ environmentRaw: 'PRODUCTION', productionEnabled: 'true', preprod: slot('preprod'), production: slot('production') }),
    );
    expect(preprod.client?.subscriberId).toBe('preprod-slot.example.test');
    expect(preprod.client?.subscriberId).not.toBe(production.client?.subscriberId);
    expect(production.client?.gatewayUrl).not.toContain('preprod.example.test');
    expect(preprod.client?.gatewayUrl).not.toContain('production.example.test');

    const productionOff = resolveOndcEnvironmentGate(gate({ environmentRaw: 'PRODUCTION', production: slot('production') }));
    expect(productionOff.realClientAllowed).toBe(false);
    expect(productionOff.productionActivationSatisfied).toBe(false);

    const preprodMissing = resolveOndcEnvironmentGate(gate({ environmentRaw: 'PRE_PROD', production: slot('production') }));
    expect(preprodMissing.realClientAllowed).toBe(false);
    expect(preprodMissing.client).toBeUndefined();
    expect(preprodMissing.error).toContain('Missing:');
  });

  it('keeps the production factory non-live and the migration free of supplier, place, and procurement writes', () => {
    const factory = read('packages/services/src/factory/create-otp-services.ts');
    const ondcAt = factory.indexOf('new OndcNetworkAdapter()');
    expect(ondcAt).toBeGreaterThan(0);
    const ondcBlock = factory.slice(ondcAt, ondcAt + 280);
    expect(ondcBlock).toContain('isLive: false');
    expect(ondcBlock).toContain('DISABLED_GATE');
    expect(ondcBlock).not.toContain('isLive: true');

    const receiver = read('packages/services/src/ondc/receiver/ondc-bap-receiver.ts');
    expect(receiver).not.toContain('unknown-bpp');
    expect(receiver).not.toContain('ONDC Verified Supplier');
    expect(receiver).not.toContain('4.5');

    const migration = read('supabase/migrations/00230_ondc_discovery_observations.sql');
    expect(migration).not.toMatch(/p_live_success/i);
    expect(migration).not.toMatch(/place_id/i);
    expect(migration).not.toMatch(/insert\s+into\s+suppliers/i);
    expect(migration).not.toMatch(/insert\s+into\s+rfq_invitations/i);
    expect(migration).not.toMatch(/insert\s+into\s+quotes/i);
    expect(migration).not.toMatch(/insert\s+into\s+awards/i);
    expect(migration).not.toMatch(/insert\s+into\s+purchase_orders/i);
    expect(migration).not.toMatch(/insert\s+into\s+payments/i);
    expect(migration).not.toMatch(/discover_and_invite_for_rfq/i);
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.ondc_discovery_observations FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO service_role');
    expect(migration).toContain('provider_immutable');

    const persistence = read('packages/domain/src/ondc/ondc-discovery-persistence.ts');
    expect(persistence).not.toMatch(/requestedPin\s*=\s*sellerPin/);
    expect(persistence).not.toMatch(/requestedPin\s*=\s*candidate\.location/);
    const servicePersistence = read('packages/services/src/ondc/ondc-discovery-persistence.ts');
    expect(servicePersistence).not.toContain('ondc-bap-receiver');
    expect(servicePersistence).toContain('normalizeBecknOnSearchCatalog');

    const reader = read('packages/services/src/ondc/ondc-environment-config.ts');
    expect(reader).not.toContain('ONDC_SUBSCRIBER_ID');
    expect(reader).not.toContain('ONDC_SIGNING_PRIVATE_KEY_PEM');
    expect(reader).not.toContain('ONDC_GATEWAY_URL');
    expect(reader).not.toContain('ONDC_ENABLED');
  });
});

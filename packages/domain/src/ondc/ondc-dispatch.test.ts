import { describe, expect, it } from 'vitest';
import {
  OndcDispatchFailureClass,
  OndcDispatchStatus,
  admitOndcDiscoveryDispatch,
  buildOndcCanonicalSearch,
  classifyOndcTransportFailure,
  createOndcDispatchLedger,
  evaluateOndcDispatchCallback,
  isLiveOndcCallbackUrl,
  isProductionOndcHost,
  noteOndcDispatchCallbackTimeout,
  ondcCallbackReplayKey,
  rememberOndcDispatch,
  toOndcDispatchBuyerView,
  validateOndcSearchPayload,
  type OndcDispatchRecord,
} from './ondc-dispatch';
import {
  OndcObservationSource,
  OndcRuntimeEnvironment,
  resolveOndcEnvironmentGate,
  toPublicOndcEnvironmentDecision,
  type OndcEnvironmentConfigInput,
} from './ondc-environment';
import { OndcGeographyMatch, classifyOndcBuyerSellerGeography } from './ondc-geography';

const FIXED = '2026-10-04T03:30:00.000Z';

function slot(prefix: string) {
  return {
    gatewayUrl: `https://gateway.${prefix}.otp.test/gateway`,
    subscriberId: `${prefix}.otp.test`,
    uniqueKeyId: `${prefix}-key`,
    signingPrivateKey: `${prefix}-signing-material`,
    registryUrl: `https://registry.${prefix}.otp.test`,
    callbackUrl: `https://callback.${prefix}.otp.test/ondc`,
  };
}

function gate(overrides: Partial<OndcEnvironmentConfigInput> = {}) {
    return toPublicOndcEnvironmentDecision(
    resolveOndcEnvironmentGate({
      environmentRaw: overrides.environmentRaw,
      providerEnabled: overrides.providerEnabled,
      networkEnabled: overrides.networkEnabled,
      timeoutMs: overrides.timeoutMs,
      maxRetries: overrides.maxRetries,
      productionEnabled: overrides.productionEnabled,
      preprod: overrides.preprod ?? {},
      production: overrides.production ?? {},
    }),
  );
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    otpTransactionId: 'tx-mock-dispatch',
    subcategoryCode: 'cotton_yarn',
    requirementMode: 'PRODUCT_MATERIAL',
    buyerRequestedPin: '560048',
    cityCode: 'std:080',
    itemName: 'MOCK cotton yarn',
    initiatorId: 'operator-mock',
    client: null,
    ...overrides,
  };
}

function issued(overrides: Partial<OndcDispatchRecord> = {}): OndcDispatchRecord {
  return {
    correlationId: 'corr-mock-1',
    idempotencyKey: 'tx-mock-dispatch\u001fsearch\u001f560048\u001fONDC:RET12',
    otpTransactionId: 'tx-mock-dispatch',
    transactionId: 'tx-mock-dispatch',
    messageId: 'msg-mock-1',
    operation: 'search',
    provider: 'ONDC',
    environment: OndcRuntimeEnvironment.LOCAL,
    observationSource: OndcObservationSource.MOCK,
    buyerRequestedPin: '560048',
    domain: 'ONDC:RET12',
    city: 'std:080',
    categoryLabel: 'cotton yarn',
    subcategoryCode: 'cotton_yarn',
    requirementMode: 'PRODUCT_MATERIAL',
    initiatedAt: FIXED,
    initiatorId: 'operator-mock',
    expectedBapId: 'mock.otp.test',
    status: OndcDispatchStatus.MOCK_ACK,
    transactionIssued: true,
    gatewayAcknowledged: false,
    realNetworkVerified: false,
    failure: null,
    reason: null,
    callbackDigest: null,
    canonicalObservedAt: null,
    boundParticipantId: null,
    persistence: 'NOT_STORED',
    ...overrides,
  };
}

function onSearch(overrides: Record<string, unknown> = {}) {
  return {
    context: {
      domain: 'ONDC:RET12',
      country: 'IND',
      city: 'std:080',
      action: 'on_search',
      core_version: '1.2.0',
      bap_id: 'mock.otp.test',
      bap_uri: 'https://mock.otp.test/ondc-callback',
      bpp_id: 'bpp.mock.otp.test',
      bpp_uri: 'https://bpp.mock.otp.test/ondc',
      transaction_id: 'tx-mock-dispatch',
      message_id: 'msg-mock-1',
      timestamp: FIXED,
      ...overrides,
    },
    message: { catalog: { providers: [] } },
  };
}

describe('ONDC-06 dispatch decisions (MOCK)', () => {
  it('builds an allow-listed search and keeps the buyer PIN in area_code', () => {
    const payload = buildOndcCanonicalSearch({
      domain: 'ONDC:RET12',
      subscriberId: 'mock.otp.test',
      callbackUrl: 'https://mock.otp.test/ondc-callback',
      transactionId: 'tx-mock-dispatch',
      messageId: 'msg-mock-1',
      timestamp: FIXED,
      city: 'std:080',
      buyerRequestedPin: '560048',
      itemName: 'MOCK cotton yarn',
      categoryLabel: 'cotton yarn',
    });
    expect(validateOndcSearchPayload(payload)).toEqual({ ok: true });
    expect(payload.context.core_version).toBe('1.2.0');
    expect(payload.context.action).toBe('search');
    expect(payload.context.ttl).toBe('PT30S');
    expect(payload.message.intent.fulfillment.end.location.address.area_code).toBe('560048');
    expect(validateOndcSearchPayload({ ...payload, context: { ...payload.context, action: 'select' } })).toEqual({
      ok: false,
      reason: 'action_not_search',
    });
    expect(validateOndcSearchPayload({ ...payload, context: { ...payload.context, core_version: '1.1.0' } })).toEqual({
      ok: false,
      reason: 'core_version_mismatch',
    });
  });

  it('admits LOCAL as MOCK and does not treat a title as a domain', () => {
    const admitted = admitOndcDiscoveryDispatch({ request: request(), decision: gate({ environmentRaw: 'LOCAL' }) });
    expect(admitted.admitted).toBe(true);
    expect(admitted.realDispatch).toBe(false);
    expect(admitted.observationSource).toBe('MOCK');
    expect(admitted.domain).toBe('ONDC:RET12');

    const titled = admitOndcDiscoveryDispatch({
      request: request({ subcategoryCode: null, itemName: 'Home CCTV & Surveillance' }),
      decision: gate({ environmentRaw: 'LOCAL' }),
    });
    expect(titled.admitted).toBe(false);
    expect(titled.failure).toBe(OndcDispatchFailureClass.UNSUPPORTED_DOMAIN);
    expect(titled.reason).toBe('not_supported');
  });

  it('does not invent std:080, a radius, or a seller PIN', () => {
    const missingCity = admitOndcDiscoveryDispatch({
      request: request({ cityCode: undefined }),
      decision: gate({ environmentRaw: 'LOCAL' }),
    });
    expect(missingCity.admitted).toBe(false);
    expect(missingCity.reason).toBe('city_unresolved');
    expect(missingCity.city).toBeNull();
    expect(JSON.stringify(missingCity)).not.toContain('std:080');

    const invalidCity = admitOndcDiscoveryDispatch({
      request: request({ cityCode: '*' }),
      decision: gate({ environmentRaw: 'LOCAL' }),
    });
    expect(invalidCity.reason).toBe('invalid_city');

    const missingPin = admitOndcDiscoveryDispatch({
      request: request({ buyerRequestedPin: '   ' }),
      decision: gate({ environmentRaw: 'LOCAL' }),
    });
    expect(missingPin.reason).toBe('missing_buyer_pin');

    const invalidPin = admitOndcDiscoveryDispatch({
      request: request({ buyerRequestedPin: '56004' }),
      decision: gate({ environmentRaw: 'LOCAL' }),
    });
    expect(invalidPin.reason).toBe('invalid_buyer_pin');

    const explicit = admitOndcDiscoveryDispatch({
      request: request({ cityCode: 'std:0421' }),
      decision: gate({ environmentRaw: 'LOCAL' }),
    });
    expect(explicit.admitted).toBe(true);
    expect(explicit.city).toBe('std:0421');
    expect(explicit.buyerRequestedPin).toBe('560048');

    const geography = classifyOndcBuyerSellerGeography({
      buyerRequestedPin: '560048',
      sellerPin: '641001',
      sellerCity: 'Coimbatore',
    });
    expect(geography.ok).toBe(true);
    if (geography.ok) {
      expect(geography.geography.buyerRequestedPin).toBe('560048');
      expect(geography.geography.sellerPin).toBe('641001');
      expect(geography.geography.match).toBe(OndcGeographyMatch.OUT_OF_AREA);
    }
    expect(JSON.stringify(geography)).not.toMatch(/radius|std:080|NEARBY/);
    expect(isLiveOndcCallbackUrl('https://callback.preprod.otp.test/ondc')).toBe(false);
    expect(isLiveOndcCallbackUrl('http://127.0.0.1/functions/v1/ondc-on-search')).toBe(false);
    expect(isLiveOndcCallbackUrl('https://buyer.example.com/functions/v1/ondc-on-search')).toBe(false);
    expect(isLiveOndcCallbackUrl('https://buyer.opentradeprocurement.ai/functions/v1/ondc-on-search')).toBe(true);
  });

  it('rejects client-supplied identity, category, endpoint, and environment', () => {
    for (const key of ['providerSupplierId', 'participantId', 'category', 'ondcCategory', 'endpoint', 'environment', 'cityCode']) {
      const decision = admitOndcDiscoveryDispatch({
        request: request({ client: { [key]: 'client-supplied' } }),
        decision: gate({ environmentRaw: 'LOCAL' }),
      });
      expect(decision.admitted).toBe(false);
      expect(decision.failure).toBe(OndcDispatchFailureClass.CLIENT_OVERRIDE);
      expect(decision.realDispatch).toBe(false);
    }
  });

  it('refuses production and does not fall back to a production slot', () => {
    const production = admitOndcDiscoveryDispatch({
      request: request(),
      decision: gate({
        environmentRaw: 'PRODUCTION',
        productionEnabled: 'true',
        production: slot('production'),
        preprod: slot('preprod'),
      }),
      gatewayUrl: 'https://gateway.preprod.otp.test/gateway',
      callbackUrl: 'https://callback.preprod.otp.test/ondc',
    });
    expect(production.failure).toBe(OndcDispatchFailureClass.PRODUCTION_REFUSED);
    expect(production.realDispatch).toBe(false);

    const fallback = admitOndcDiscoveryDispatch({
      request: request(),
      decision: gate({ environmentRaw: 'PRE_PROD', production: slot('production') }),
      gatewayUrl: slot('production').gatewayUrl,
    });
    expect(fallback.realDispatch).toBe(false);
    expect(fallback.failure).not.toBeNull();
    expect(isProductionOndcHost('https://prod.gateway.ondc.org/search')).toBe(true);
    expect(isProductionOndcHost('https://prod.registry.ondc.org/v2.0/lookup')).toBe(true);
    expect(isProductionOndcHost('https://preprod.gateway.ondc.org/search')).toBe(false);
  });

  it('requires an addressable https gateway before real PRE_PROD admission', () => {
    const ready = gate({ environmentRaw: 'PRE_PROD', preprod: slot('preprod') });
    const synthetic = admitOndcDiscoveryDispatch({
      request: request(),
      decision: ready,
      gatewayUrl: 'https://preprod.example.test/gateway',
      callbackUrl: 'https://callback.preprod.otp.test/ondc',
    });
    expect(synthetic.failure).toBe(OndcDispatchFailureClass.NOT_ADDRESSABLE);

    const productionHost = admitOndcDiscoveryDispatch({
      request: request(),
      decision: ready,
      gatewayUrl: 'https://prod.gateway.ondc.org/search',
      callbackUrl: 'https://callback.preprod.otp.test/ondc',
    });
    expect(productionHost.failure).toBe(OndcDispatchFailureClass.PRODUCTION_REFUSED);

    const admitted = admitOndcDiscoveryDispatch({
      request: request(),
      decision: ready,
      gatewayUrl: slot('preprod').gatewayUrl,
      callbackUrl: slot('preprod').callbackUrl,
    });
    expect(admitted.admitted).toBe(true);
    expect(admitted.realDispatch).toBe(true);
    expect(admitted.observationSource).toBe('REAL_NETWORK');
    expect(admitted.gatewayAddressable).toBe(true);
  });

  it('rejects an unknown message, a wrong subscriber, a duplicate digest, and an older callback', () => {
    const record = issued();
    const unknown = evaluateOndcDispatchCallback({
      record,
      payload: onSearch({ message_id: 'msg-other' }),
      signerSubscriberId: 'bpp.mock.otp.test',
      bodyDigest: 'BLAKE-512=mock-digest-a',
      processingEnvironment: OndcRuntimeEnvironment.LOCAL,
      processingSource: OndcObservationSource.MOCK,
      seenReplayKeys: [],
    });
    expect(unknown).toMatchObject({ ok: false, reason: 'unknown_message' });

    const wrongSubscriber = evaluateOndcDispatchCallback({
      record,
      payload: onSearch(),
      signerSubscriberId: 'other.mock.otp.test',
      bodyDigest: 'BLAKE-512=mock-digest-a',
      processingEnvironment: OndcRuntimeEnvironment.LOCAL,
      processingSource: OndcObservationSource.MOCK,
      seenReplayKeys: [],
    });
    expect(wrongSubscriber).toMatchObject({ ok: false, reason: 'wrong_subscriber' });

    const duplicate = evaluateOndcDispatchCallback({
      record: issued({ callbackDigest: 'BLAKE-512=mock-digest-a', canonicalObservedAt: FIXED }),
      payload: onSearch(),
      signerSubscriberId: 'bpp.mock.otp.test',
      bodyDigest: 'BLAKE-512=mock-digest-b',
      processingEnvironment: OndcRuntimeEnvironment.LOCAL,
      processingSource: OndcObservationSource.MOCK,
      seenReplayKeys: [],
    });
    expect(duplicate).toMatchObject({ ok: false, failure: OndcDispatchFailureClass.DUPLICATE, reason: 'duplicate_message' });

    const stale = evaluateOndcDispatchCallback({
      record: issued({ canonicalObservedAt: '2026-10-04T04:00:00.000Z' }),
      payload: onSearch({ timestamp: FIXED }),
      signerSubscriberId: 'bpp.mock.otp.test',
      bodyDigest: 'BLAKE-512=mock-digest-a',
      processingEnvironment: OndcRuntimeEnvironment.LOCAL,
      processingSource: OndcObservationSource.MOCK,
      seenReplayKeys: [],
    });
    expect(stale).toMatchObject({ ok: true, stale: true, apply: false });
  });

  it('keeps mock evidence out of a real environment and does not regress a timed-out dispatch into success', () => {
    const separated = evaluateOndcDispatchCallback({
      record: issued(),
      payload: onSearch(),
      signerSubscriberId: 'bpp.mock.otp.test',
      bodyDigest: 'BLAKE-512=mock-digest-a',
      processingEnvironment: OndcRuntimeEnvironment.PRE_PROD,
      processingSource: OndcObservationSource.REAL_NETWORK,
      seenReplayKeys: [],
    });
    expect(separated).toMatchObject({ ok: false, failure: OndcDispatchFailureClass.ENVIRONMENT_SEPARATION });

    const ledger = createOndcDispatchLedger();
    const pending = issued({
      environment: OndcRuntimeEnvironment.PRE_PROD,
      observationSource: OndcObservationSource.REAL_NETWORK,
      status: OndcDispatchStatus.PENDING_CALLBACK,
      gatewayAcknowledged: true,
    });
    rememberOndcDispatch(ledger, pending);
    const timedOut = noteOndcDispatchCallbackTimeout(ledger, pending.correlationId);
    expect(timedOut?.status).toBe(OndcDispatchStatus.CALLBACK_TIMED_OUT);
    expect(timedOut?.realNetworkVerified).toBe(false);
    expect(timedOut?.failure).toBe(OndcDispatchFailureClass.CALLBACK_TIMEOUT);

    const replayKey = ondcCallbackReplayKey({
      transactionId: 'tx-mock-dispatch',
      messageId: 'msg-mock-1',
      timestamp: FIXED,
      operation: 'on_search',
      callbackIdentity: 'bpp.mock.otp.test',
    });
    expect(replayKey).toContain('on_search');
    expect(replayKey).toContain('bpp.mock.otp.test');
  });

  it('keeps the buyer view free of endpoints and a verified-supplier claim', () => {
    const view = toOndcDispatchBuyerView(issued());
    expect(view.verifiedSupplier).toBeNull();
    expect(view.provider).toBe('ONDC');
    expect(JSON.stringify(view)).not.toMatch(/bpp|callback|Authorization|PRIVATE|Verified Supplier/i);
    expect(classifyOndcTransportFailure({ errorCode: 'TIMEOUT' }).retryable).toBe(true);
    expect(classifyOndcTransportFailure({ errorCode: 'HTTP_STATUS', statusCode: 503 }).retryable).toBe(true);
    expect(classifyOndcTransportFailure({ errorCode: 'HTTP_STATUS', statusCode: 401 })).toMatchObject({
      failure: OndcDispatchFailureClass.AUTH_FAILURE,
      retryable: false,
    });
    expect(classifyOndcTransportFailure({ errorCode: 'PRODUCTION_REFUSED' }).retryable).toBe(false);
  });
});

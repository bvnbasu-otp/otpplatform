import { OndcGatewayClient, type OndcEnvironment } from './client/ondc-gateway-client';
import { executeOndcDiscoveryDispatch } from './ondc-discovery-dispatch';
import type { OndcDiscoveryDispatchStore } from './ondc-discovery-dispatch-store';
import { OndcBapReceiver } from './receiver/ondc-bap-receiver';
import type { OndcDomain } from './types/ondc-beckn';
import {
  createOndcDispatchLedger,
  isProductionOndcHost,
  mapOndcDiscoveryCategory,
  toPublicOndcEnvironmentDecision,
  type OndcDispatchLedger,
  type OndcEnvironmentDecision,
  type OndcTaxonomyContext,
} from '@otp/domain';
import { resolveOndcEnvironmentFromEnv } from './ondc-environment-config';

export interface OndcServiceOptions {
  environment?: OndcEnvironment;
  subscriberId?: string;
  uniqueKeyId?: string;
  bapUri?: string;
  signingPrivateKeyPem?: string;
  gatewayUrl?: string;
  enabled?: boolean;
  /** When set, Beckn `context.domain` for search (must match registry subscribe domain). */
  discoveryDomain?: string;
  /** 00231 lifecycle. PRE_PROD /search refuses without it. LOCAL/CI may omit it. */
  dispatchStore?: OndcDiscoveryDispatchStore;
}

const ONDC_DOMAIN_PATTERN = /^ONDC:[A-Z0-9]+$/;

function parseOndcEnvironment(raw?: string): OndcEnvironment | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toUpperCase().replace(/-/g, '_');
  if (normalized === 'MOCK') return 'MOCK';
  if (normalized === 'STAGING') return 'STAGING';
  if (normalized === 'PREPROD' || normalized === 'PRE_PRODUCTION') return 'PRE_PRODUCTION';
  if (normalized === 'PROD' || normalized === 'PRODUCTION') return 'PRODUCTION';
  return undefined;
}

/** Merge explicit options with documented ONDC_* env vars (no secrets invented). */
export function mergeOndcServiceOptionsFromEnv(options: OndcServiceOptions = {}): OndcServiceOptions {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  if (!env) return options;

  const discoveryDomain =
    options.discoveryDomain ??
    (env.ONDC_DISCOVERY_DOMAIN?.trim() && ONDC_DOMAIN_PATTERN.test(env.ONDC_DISCOVERY_DOMAIN.trim())
      ? env.ONDC_DISCOVERY_DOMAIN.trim()
      : undefined);

  return {
    ...options,
    enabled: options.enabled ?? (env.ONDC_ENABLED === 'true' ? true : options.enabled),
    environment: options.environment ?? parseOndcEnvironment(env.ONDC_ENVIRONMENT),
    subscriberId: options.subscriberId ?? env.ONDC_SUBSCRIBER_ID?.trim(),
    uniqueKeyId: options.uniqueKeyId ?? env.ONDC_UNIQUE_KEY_ID?.trim(),
    bapUri: options.bapUri ?? env.ONDC_BAP_URI?.trim(),
    signingPrivateKeyPem: options.signingPrivateKeyPem ?? env.ONDC_SIGNING_PRIVATE_KEY_PEM,
    gatewayUrl: options.gatewayUrl ?? env.ONDC_GATEWAY_URL?.trim(),
    discoveryDomain,
  };
}

/**
 * Canonical search domain. Allow-list only.
 * A caller-supplied domain and the title heuristic are not consulted.
 */
export function resolveOndcSearchDomain(
  category: string,
  discoveryDomain?: string,
  taxonomyContext?: OndcTaxonomyContext,
): OndcDomain | null {
  const mapping = mapOndcDiscoveryCategory({
    otpCategory: category,
    subcategoryCode: taxonomyContext?.subcategoryCode,
    requirementMode: taxonomyContext?.requirementMode,
    ondcDomain: discoveryDomain,
    title: category,
    taxonomy: taxonomyContext,
  });
  if (mapping.ondcDomain === 'ONDC:RET12' || mapping.ondcDomain === 'ONDC:RET14') {
    return mapping.ondcDomain;
  }
  return null;
}

/**
 * Title heuristic kept for existing direct unit tests.
 * resolveOndcSearchDomain does not call this. Canonical mapping is mapOndcDiscoveryCategory.
 */
export function mapCategoryToOndcDomain(category: string): OndcDomain {
  const cat = category.toLowerCase();
  if (cat.includes('yarn') || cat.includes('textile') || cat.includes('cotton') || cat.includes('fabric')) {
    return 'ONDC:RET12';
  }
  if (cat.includes('cctv') || cat.includes('security') || cat.includes('camera') || cat.includes('electronic')) {
    return 'ONDC:RET14';
  }
  if (cat.includes('cement') || cat.includes('steel') || cat.includes('rmc') || cat.includes('construction') || cat.includes('infra')) {
    return 'ONDC:B2B10';
  }
  if (cat.includes('gym') || cat.includes('fitness') || cat.includes('amc') || cat.includes('paint')) {
    return 'ONDC:SRV13';
  }
  return 'ONDC:SRV11'; // General Home & Facility Services
}

export class OndcNetworkService {
  private readonly client: OndcGatewayClient | null = null;
  private readonly receiver: OndcBapReceiver;
  private readonly enabled: boolean;
  private readonly discoveryDomain?: string;
  private readonly environmentDecision: Omit<OndcEnvironmentDecision, 'client'>;
  private readonly issuedTransactions = new Set<string>();
  private readonly dispatchLedger: OndcDispatchLedger = createOndcDispatchLedger();
  private readonly dispatchStore?: OndcDiscoveryDispatchStore;

  constructor(options: OndcServiceOptions = {}) {
    const resolved = mergeOndcServiceOptionsFromEnv(options);
    this.dispatchStore = resolved.dispatchStore;
    this.enabled = resolved.enabled ?? (process.env.ONDC_ENABLED === 'true');
    this.discoveryDomain = resolved.discoveryDomain;
    void this.discoveryDomain;
    const decision = resolveOndcEnvironmentFromEnv(typeof process !== 'undefined' ? process.env : undefined);
    this.environmentDecision = toPublicOndcEnvironmentDecision(decision);
    this.receiver = new OndcBapReceiver();

    if (
      decision.realClientAllowed &&
      decision.environment === 'PRE_PROD' &&
      decision.client &&
      !isProductionOndcHost(decision.client.gatewayUrl) &&
      !isProductionOndcHost(decision.client.registryUrl) &&
      !isProductionOndcHost(decision.client.callbackUrl)
    ) {
      this.client = new OndcGatewayClient({
        environment: 'PRE_PRODUCTION',
        subscriberId: decision.client.subscriberId,
        uniqueKeyId: decision.client.uniqueKeyId,
        bapUri: decision.client.callbackUrl,
        signingPrivateKeyPem: decision.client.signingPrivateKey,
        gatewayUrl: decision.client.gatewayUrl,
        timeoutMs: decision.timeoutMs,
      });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getReceiver(): OndcBapReceiver {
    return this.receiver;
  }

  getClient(): OndcGatewayClient | null {
    return this.client;
  }

  getEnvironmentDecision(): Omit<OndcEnvironmentDecision, 'client'> {
    return this.environmentDecision;
  }

  /** Transaction ids accepted by a later /on_search. Empty until a signed search is acknowledged. */
  listIssuedTransactions(): readonly string[] {
    return [...this.issuedTransactions];
  }

  /**
   * Signed /search. Select, init, confirm, and status are not called here.
   * A production decision never attaches a client in this service.
   */
  async broadcastRfqToOndc(params: {
    rfqId: string;
    title: string;
    category: string;
    cityCode?: string;
    taxonomyContext?: OndcTaxonomyContext;
    buyerRequestedPin?: string | null;
    initiatorId?: string | null;
  }): Promise<{ ok: boolean; transactionId: string; error?: string }> {
    if (!this.client || !this.enabled || this.environmentDecision.environment !== 'PRE_PROD' || !this.environmentDecision.realClientAllowed) {
      return {
        ok: false,
        transactionId: params.rfqId,
        error: this.environmentDecision.error ?? 'ONDC live integration is disabled or credentials not configured',
      };
    }

    const dispatched = await executeOndcDiscoveryDispatch({
      request: {
        otpTransactionId: params.rfqId,
        subcategoryCode: params.taxonomyContext?.subcategoryCode,
        requirementMode: params.taxonomyContext?.requirementMode,
        buyerRequestedPin: params.buyerRequestedPin,
        cityCode: params.cityCode,
        itemName: params.title,
        initiatorId: params.initiatorId,
      },
      categoryLabel: params.category,
      ledger: this.dispatchLedger,
      dispatchStore: this.dispatchStore,
    });
    if (dispatched.gatewayAcknowledged) this.issuedTransactions.add(dispatched.transactionId);

    return {
      ok: dispatched.gatewayAcknowledged,
      transactionId: dispatched.transactionId || params.rfqId,
      error: dispatched.gatewayAcknowledged ? undefined : dispatched.reason ?? dispatched.userMessage,
    };
  }
}

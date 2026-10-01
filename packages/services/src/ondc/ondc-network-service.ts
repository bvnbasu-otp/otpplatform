import { OndcGatewayClient, type OndcEnvironment } from './client/ondc-gateway-client';
import { OndcBapReceiver } from './receiver/ondc-bap-receiver';
import type { OndcDomain } from './types/ondc-beckn';
import {
  mapExplicitSubcategoryToOndcDomain,
  shouldUseCategoryTitleHeuristicsForOndc,
  toPublicOndcEnvironmentDecision,
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
 * Beckn search domain: optional pilot override, else category heuristic.
 * RET14 pilot: set `ONDC_DISCOVERY_DOMAIN=ONDC:RET14` to match registry subscribe domain.
 */
export function resolveOndcSearchDomain(
  category: string,
  discoveryDomain?: string,
  taxonomyContext?: OndcTaxonomyContext,
): OndcDomain | null {
  const override = discoveryDomain?.trim();
  if (override && ONDC_DOMAIN_PATTERN.test(override)) {
    return override as OndcDomain;
  }

  if (taxonomyContext?.subcategoryCode) {
    const explicit = mapExplicitSubcategoryToOndcDomain(
      taxonomyContext.subcategoryCode,
      taxonomyContext.requirementMode,
    );
    return explicit as OndcDomain | null;
  }

  if (!shouldUseCategoryTitleHeuristicsForOndc(taxonomyContext)) {
    return null;
  }

  return mapCategoryToOndcDomain(category);
}

/**
 * Domain category to ONDC Beckn domain mapping helper.
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
  private readonly searchAttempts: number;
  private readonly issuedTransactions = new Set<string>();

  constructor(options: OndcServiceOptions = {}) {
    const resolved = mergeOndcServiceOptionsFromEnv(options);
    this.enabled = resolved.enabled ?? (process.env.ONDC_ENABLED === 'true');
    this.discoveryDomain = resolved.discoveryDomain;
    const decision = resolveOndcEnvironmentFromEnv(typeof process !== 'undefined' ? process.env : undefined);
    this.environmentDecision = toPublicOndcEnvironmentDecision(decision);
    this.receiver = new OndcBapReceiver();
    this.searchAttempts = Math.max(1, decision.maxRetries + 1);

    if (decision.realClientAllowed && decision.environment === 'PRE_PROD' && decision.client) {
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
  }): Promise<{ ok: boolean; transactionId: string; error?: string }> {
    const client = this.client;
    if (!client || !this.enabled || this.environmentDecision.environment !== 'PRE_PROD' || !this.environmentDecision.realClientAllowed) {
      return {
        ok: false,
        transactionId: params.rfqId,
        error: this.environmentDecision.error ?? 'ONDC live integration is disabled or credentials not configured',
      };
    }

    const domain = resolveOndcSearchDomain(
      params.category,
      this.discoveryDomain,
      params.taxonomyContext,
    );
    if (!domain) {
      return {
        ok: false,
        transactionId: params.rfqId,
        error: 'No approved ONDC domain mapping for this OTP taxonomy selection',
      };
    }
    const context = client.createContext({
      domain,
      action: 'search',
      city: params.cityCode || 'std:080',
      transactionId: params.rfqId,
    });

    let res = await client.search({
      context,
      intent: {
        item: {
          descriptor: {
            name: params.title,
          },
        },
        category: {
          descriptor: {
            name: params.category,
          },
        },
      },
    });
    for (let attempt = 1; attempt < this.searchAttempts && !res.ok; attempt += 1) {
      if (res.errorCode !== 'TIMEOUT' && res.errorCode !== 'NETWORK_ERROR') break;
      res = await client.search({
        context,
        intent: {
          item: { descriptor: { name: params.title } },
          category: { descriptor: { name: params.category } },
        },
      });
    }

    if (res.ok) this.issuedTransactions.add(params.rfqId);

    return {
      ok: res.ok,
      transactionId: params.rfqId,
      error: res.error,
    };
  }
}

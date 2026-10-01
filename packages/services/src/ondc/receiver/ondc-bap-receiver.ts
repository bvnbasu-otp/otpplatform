import type {
  OndcAck,
  OndcCatalog,
  OndcOrder,
  OndcPayload,
} from '../types/ondc-beckn';
import { verifyOndcAuthHeader } from '../crypto/ondc-auth-crypto';
import { OndcPublicKeyCache } from '../crypto/ondc-key-cache';
import { normalizeBecknOnSearchCatalog } from '../ondc-on-search-normalizer';

export interface NormalizedOndcSupplierCandidate {
  network: 'ONDC';
  externalRef: string; // e.g. "ondc:bpp_id:provider_id"
  bppId: string;
  bppUri: string;
  providerId: string;
  businessName: string;
  rating?: number;
  itemIds: string[];
  samplePrice?: number;
  categories: string[];
}

export interface NormalizedOndcBlindQuote {
  transactionId: string;
  bppId: string;
  providerId: string;
  basePrice: number;
  taxAmount: number;
  transportCost: number;
  totalAmount: number;
  deliveryDays: number;
  warrantyMonths?: number;
  isDeliveryDaysEstimated?: boolean;
  isWarrantyEstimated?: boolean;
  rawQuote: any;
}

export interface OndcReceiverOptions {
  lookupPublicKeyFn?: (keyId: string) => Promise<string | null>;
  keyCache?: OndcPublicKeyCache;
  /** Ignored. Missing or invalid signatures fail closed, including when no public key is configured. */
  skipSignatureVerification?: boolean;
}

export class OndcBapReceiver {
  private readonly options: OndcReceiverOptions;
  private readonly keyCache?: OndcPublicKeyCache;
  /** Callback-ingested /on_search candidates keyed by Beckn transaction_id (not persisted). */
  private readonly searchResultsByTransaction = new Map<string, NormalizedOndcSupplierCandidate[]>();

  constructor(options: OndcReceiverOptions = {}) {
    this.options = options;
    this.keyCache = options.keyCache ?? (options.lookupPublicKeyFn ? new OndcPublicKeyCache({ fetchFn: options.lookupPublicKeyFn }) : undefined);
  }

  /**
   * Produce standard ACK response for Beckn callbacks.
   */
  createAck(): OndcAck {
    return {
      message: {
        ack: {
          status: 'ACK',
        },
      },
    };
  }

  /**
   * Produce standard NACK response for errors.
   */
  createNack(code: string, message: string): OndcAck {
    return {
      message: {
        ack: {
          status: 'NACK',
        },
      },
      error: {
        code,
        message,
      },
    };
  }

  /**
   * Verify Authorization header on incoming callback webhook.
   */
  async verifyWebhook(
    authHeader: string | null | undefined,
    body: string | object,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!authHeader?.trim()) {
      return { valid: false, error: 'Missing Authorization header' };
    }

    if (!this.keyCache && !this.options.lookupPublicKeyFn) {
      return { valid: false, error: 'Public key is not configured' };
    }

    const keyIdMatch = authHeader.match(/keyId="([^"]+)"/);
    const keyId = keyIdMatch?.[1];
    if (!keyId) {
      return { valid: false, error: 'Invalid keyId in Authorization header' };
    }

    let publicKeyPem: string | null = null;
    if (this.keyCache) {
      publicKeyPem = await this.keyCache.getOrFetch(keyId);
    } else if (this.options.lookupPublicKeyFn) {
      publicKeyPem = await this.options.lookupPublicKeyFn(keyId);
    }

    if (!publicKeyPem) {
      return { valid: false, error: `Public key not found for keyId: ${keyId}` };
    }

    return verifyOndcAuthHeader({ authHeader, body, publicKeyPem });
  }

  /**
   * Maps an /on_search callback through the canonical normalizer.
   * Omitted participant id, display name, or rating stays omitted.
   */
  handleOnSearch(payload: OndcPayload<{ catalog?: OndcCatalog }> | null | undefined): {
    transactionId: string;
    candidates: NormalizedOndcSupplierCandidate[];
  } {
    const context = payload?.context;
    if (!context || context.action !== 'on_search') {
      return { transactionId: '', candidates: [] };
    }
    const observedAt = context.timestamp?.trim() || new Date().toISOString();
    const normalized = normalizeBecknOnSearchCatalog(payload as OndcPayload<{ catalog?: OndcCatalog }>, observedAt);
    const providers = payload?.message?.catalog?.providers ?? [];
    const candidates: NormalizedOndcSupplierCandidate[] = [];

    for (const candidate of normalized) {
      const sellerId = candidate.ondc.sellerId;
      const provider = providers.find((row) => row?.id === sellerId);
      const reportedRating = parseReportedRating(provider?.rating);
      const firstPrice = provider?.items?.[0]?.price?.value;
      const samplePrice = firstPrice != null && firstPrice !== '' ? Number(firstPrice) : undefined;
      const categories = (provider?.categories ?? [])
        .map((category) => category.descriptor?.name || category.id)
        .filter((value): value is string => Boolean(value?.trim()));
      const row: NormalizedOndcSupplierCandidate = {
        network: 'ONDC',
        externalRef: `ondc:${candidate.providerParticipantId}:${sellerId}`,
        bppId: candidate.providerParticipantId,
        bppUri: candidate.ondc.endpoint ?? '',
        providerId: sellerId,
        businessName: candidate.displayName,
        itemIds: [...candidate.ondc.itemIds],
        categories,
      };
      if (reportedRating !== undefined) row.rating = reportedRating;
      if (samplePrice !== undefined && Number.isFinite(samplePrice)) row.samplePrice = samplePrice;
      candidates.push(row);
    }

    if (context.transaction_id) {
      this.searchResultsByTransaction.set(context.transaction_id, candidates);
    }

    return {
      transactionId: context.transaction_id,
      candidates,
    };
  }

  listPendingCandidates(transactionId: string): NormalizedOndcSupplierCandidate[] {
    return this.searchResultsByTransaction.get(transactionId) ?? [];
  }

  /**
   * Handle /on_select: Parses formal price quote from BPP into OTP blind format.
   */
  handleOnSelect(payload: OndcPayload<{ order: OndcOrder }>): {
    transactionId: string;
    quote: NormalizedOndcBlindQuote;
  } {
    const { context, message } = payload;
    const bppId = context.bpp_id || '';
    const providerId = message?.order?.provider?.id || '';
    const quote = message?.order?.quote;

    const totalAmount = quote?.price?.value ? parseFloat(quote.price.value) : 0;
    let basePrice = totalAmount;
    let taxAmount = 0;
    let transportCost = 0;

    // Parse itemized breakup if provided by BPP
    if (quote?.breakup && Array.isArray(quote.breakup)) {
      let computedBase = 0;
      for (const item of quote.breakup) {
        const titleLower = item.title.toLowerCase();
        const val = parseFloat(item.price.value || '0');
        if (titleLower.includes('tax') || titleLower.includes('gst')) {
          taxAmount += val;
        } else if (titleLower.includes('delivery') || titleLower.includes('transport') || titleLower.includes('freight')) {
          transportCost += val;
        } else {
          computedBase += val;
        }
      }
      if (computedBase > 0) {
        basePrice = computedBase;
      }
    }

    let deliveryDays = 3;
    let isDeliveryDaysEstimated = true;
    let warrantyMonths = 12;
    let isWarrantyEstimated = true;

    // Check if fulfillment or item details provide concrete delivery duration
    const fulfillments = message?.order?.fulfillments;
    if (fulfillments && Array.isArray(fulfillments) && fulfillments[0]) {
      const f = fulfillments[0] as Record<string, any>;
      const tat = f['@ondc/org/tat'] || f.tat || f.time?.duration;
      if (tat) {
        // e.g. "P3D" or "PT72H" or "3 days" or number
        const match = String(tat).match(/(\d+)/);
        if (match && match[1]) {
          deliveryDays = parseInt(match[1], 10);
          isDeliveryDaysEstimated = false;
        }
      }
    }

    return {
      transactionId: context.transaction_id,
      quote: {
        transactionId: context.transaction_id,
        bppId,
        providerId,
        basePrice,
        taxAmount,
        transportCost,
        totalAmount,
        deliveryDays,
        warrantyMonths,
        isDeliveryDaysEstimated,
        isWarrantyEstimated,
        rawQuote: quote,
      },
    };
  }
}

function parseReportedRating(rating?: string | null): number | undefined {
  if (rating == null || rating.trim() === '') return undefined;
  const parsed = Number(rating);
  return Number.isFinite(parsed) ? parsed : undefined;
}

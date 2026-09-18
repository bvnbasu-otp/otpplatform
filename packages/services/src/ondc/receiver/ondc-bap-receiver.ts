import type {
  OndcAck,
  OndcCatalog,
  OndcOrder,
  OndcPayload,
  OndcProvider,
} from '../types/ondc-beckn';
import { verifyOndcAuthHeader } from '../crypto/ondc-auth-crypto';
import { OndcPublicKeyCache } from '../crypto/ondc-key-cache';

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
  skipSignatureVerification?: boolean;
}

export class OndcBapReceiver {
  private readonly options: OndcReceiverOptions;
  private readonly keyCache?: OndcPublicKeyCache;

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
    if (this.options.skipSignatureVerification) {
      return { valid: true };
    }

    if (!authHeader) {
      return { valid: false, error: 'Missing Authorization header' };
    }

    if (!this.keyCache && !this.options.lookupPublicKeyFn) {
      // In development or staging without lookup function, accept structure
      return { valid: true };
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
   * Handle /on_search: Parses incoming supplier catalogs into OTP candidates.
   */
  handleOnSearch(payload: OndcPayload<{ catalog: OndcCatalog }>): {
    transactionId: string;
    candidates: NormalizedOndcSupplierCandidate[];
  } {
    const { context, message } = payload;
    const bppId = context.bpp_id || 'unknown-bpp';
    const bppUri = context.bpp_uri || '';
    const providers: OndcProvider[] = message?.catalog?.providers || [];

    const candidates: NormalizedOndcSupplierCandidate[] = [];

    for (const provider of providers) {
      const items = provider.items || [];
      const itemIds = items.map((i) => i.id);
      const item0 = items[0];
      const firstPrice = item0?.price?.value ? parseFloat(item0.price.value) : undefined;
      const categories = (provider.categories || []).map((c) => c.descriptor?.name || c.id);

      candidates.push({
        network: 'ONDC',
        externalRef: `ondc:${bppId}:${provider.id}`,
        bppId,
        bppUri,
        providerId: provider.id,
        businessName: provider.descriptor?.name || 'ONDC Verified Supplier',
        rating: provider.rating ? parseFloat(provider.rating) : 4.5,
        itemIds,
        samplePrice: firstPrice,
        categories,
      });
    }

    return {
      transactionId: context.transaction_id,
      candidates,
    };
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

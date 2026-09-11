import { OndcGatewayClient, type OndcEnvironment } from './client/ondc-gateway-client';
import { OndcBapReceiver, type NormalizedOndcSupplierCandidate } from './receiver/ondc-bap-receiver';
import type { OndcDomain } from './types/ondc-beckn';

export interface OndcServiceOptions {
  environment?: OndcEnvironment;
  subscriberId?: string;
  uniqueKeyId?: string;
  bapUri?: string;
  signingPrivateKeyPem?: string;
  gatewayUrl?: string;
  enabled?: boolean;
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

  constructor(options: OndcServiceOptions = {}) {
    this.enabled = options.enabled ?? (process.env.ONDC_ENABLED === 'true');
    this.receiver = new OndcBapReceiver({
      skipSignatureVerification: options.environment === 'MOCK',
    });

    if (options.signingPrivateKeyPem && options.subscriberId) {
      this.client = new OndcGatewayClient({
        environment: options.environment || 'STAGING',
        subscriberId: options.subscriberId,
        uniqueKeyId: options.uniqueKeyId || 'key-01',
        bapUri: options.bapUri || 'https://api.otp.in/ondc/bap',
        signingPrivateKeyPem: options.signingPrivateKeyPem,
        gatewayUrl: options.gatewayUrl,
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

  /**
   * Broadcast an OTP RFQ into the real-time ONDC Gateway.
   */
  async broadcastRfqToOndc(params: {
    rfqId: string;
    title: string;
    category: string;
    cityCode?: string;
  }): Promise<{ ok: boolean; transactionId: string; error?: string }> {
    if (!this.client || !this.enabled) {
      return {
        ok: false,
        transactionId: params.rfqId,
        error: 'ONDC live integration is disabled or credentials not configured',
      };
    }

    const domain = mapCategoryToOndcDomain(params.category);
    const context = this.client.createContext({
      domain,
      action: 'search',
      city: params.cityCode || 'std:080',
      transactionId: params.rfqId,
    });

    const res = await this.client.search({
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

    return {
      ok: res.ok,
      transactionId: params.rfqId,
      error: res.error,
    };
  }
}

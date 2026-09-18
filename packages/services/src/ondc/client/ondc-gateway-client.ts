import type {
  OndcAck,
  OndcContext,
  OndcOrder,
  OndcPayload,
  OndcSearchIntent,
} from '../types/ondc-beckn';
import { createOndcAuthHeader } from '../crypto/ondc-auth-crypto';

export type OndcEnvironment = 'MOCK' | 'STAGING' | 'PRE_PRODUCTION' | 'PRODUCTION';

export interface OndcClientConfig {
  environment: OndcEnvironment;
  subscriberId: string; // e.g. "bap.otp.in"
  uniqueKeyId: string; // e.g. "key-2026-01"
  bapUri: string; // e.g. "https://api.otp.in/ondc/bap"
  signingPrivateKeyPem: string;
  gatewayUrl?: string;
  timeoutMs?: number;
}

const GATEWAY_URLS: Record<OndcEnvironment, string> = {
  MOCK: 'http://localhost:8080',
  STAGING: 'https://staging.gateway.ondc.org',
  PRE_PRODUCTION: 'https://preprod.gateway.ondc.org',
  PRODUCTION: 'https://prod.gateway.ondc.org',
};

export type OndcErrorCode = 'TIMEOUT' | 'HTTP_STATUS' | 'NETWORK_ERROR' | 'INVALID_RESPONSE';

export interface OndcClientResponse {
  ok: boolean;
  ack?: OndcAck;
  error?: string;
  errorCode?: OndcErrorCode;
  statusCode?: number;
}

export class OndcGatewayClient {
  private readonly config: OndcClientConfig;
  private readonly gatewayUrl: string;

  constructor(config: OndcClientConfig) {
    this.config = config;
    this.gatewayUrl = config.gatewayUrl || GATEWAY_URLS[config.environment];
  }

  /**
   * Helper to construct a standard Beckn context.
   */
  createContext(params: {
    domain: string;
    action: OndcContext['action'];
    city?: string;
    transactionId: string;
    messageId?: string;
    bppId?: string;
    bppUri?: string;
  }): OndcContext {
    return {
      domain: params.domain,
      country: 'IND',
      city: params.city || 'std:080', // Default Bangalore
      action: params.action,
      core_version: '1.2.0',
      bap_id: this.config.subscriberId,
      bap_uri: this.config.bapUri,
      bpp_id: params.bppId,
      bpp_uri: params.bppUri,
      transaction_id: params.transactionId,
      message_id: params.messageId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ttl: 'PT30S',
    };
  }

  /**
   * Broadcast /search to ONDC Gateway.
   * Gateway routes to registered BPPs matching the domain/location.
   */
  async search(params: {
    context: OndcContext;
    intent: OndcSearchIntent;
  }): Promise<OndcClientResponse> {
    const payload: OndcPayload<{ intent: OndcSearchIntent }> = {
      context: params.context,
      message: { intent: params.intent },
    };

    return this.postSignedRequest(`${this.gatewayUrl}/search`, payload);
  }

  /**
   * Send /select to specific BPP to request a formal quotation.
   */
  async select(params: {
    bppUri: string;
    context: OndcContext;
    order: OndcOrder;
  }): Promise<OndcClientResponse> {
    const payload: OndcPayload<{ order: OndcOrder }> = {
      context: params.context,
      message: { order: params.order },
    };

    return this.postSignedRequest(`${params.bppUri}/select`, payload);
  }

  /**
   * Send /init to BPP with billing and delivery addresses.
   */
  async init(params: {
    bppUri: string;
    context: OndcContext;
    order: OndcOrder;
  }): Promise<OndcClientResponse> {
    const payload: OndcPayload<{ order: OndcOrder }> = {
      context: params.context,
      message: { order: params.order },
    };

    return this.postSignedRequest(`${params.bppUri}/init`, payload);
  }

  /**
   * Send /confirm to BPP to lock the Purchase Order on ONDC.
   */
  async confirm(params: {
    bppUri: string;
    context: OndcContext;
    order: OndcOrder;
  }): Promise<OndcClientResponse> {
    const payload: OndcPayload<{ order: OndcOrder }> = {
      context: params.context,
      message: { order: params.order },
    };

    return this.postSignedRequest(`${params.bppUri}/confirm`, payload);
  }

  /**
   * Send /status to BPP to check fulfillment progress.
   */
  async status(params: {
    bppUri: string;
    context: OndcContext;
    orderId: string;
  }): Promise<OndcClientResponse> {
    const payload: OndcPayload<{ order_id: string }> = {
      context: params.context,
      message: { order_id: params.orderId },
    };

    return this.postSignedRequest(`${params.bppUri}/status`, payload);
  }

  /**
   * Helper to sign and post JSON payload with ONDC Authorization headers.
   */
  private async postSignedRequest(
    url: string,
    payload: object,
  ): Promise<OndcClientResponse> {
    const timeoutMs = this.config.timeoutMs || 8000;
    try {
      const payloadStr = JSON.stringify(payload);
      const authHeader = createOndcAuthHeader({
        body: payloadStr,
        subscriberId: this.config.subscriberId,
        uniqueKeyId: this.config.uniqueKeyId,
        privateKeyPem: this.config.signingPrivateKeyPem,
      });

      const signal = AbortSignal.timeout(timeoutMs);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: authHeader,
        },
        body: payloadStr,
        signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return {
          ok: false,
          errorCode: 'HTTP_STATUS',
          statusCode: res.status,
          error: `HTTP ${res.status}: ${errorText}`,
        };
      }

      const ack = (await res.json()) as OndcAck;
      const isAck = ack?.message?.ack?.status === 'ACK';
      return {
        ok: isAck,
        ack,
        statusCode: res.status,
        errorCode: isAck ? undefined : 'INVALID_RESPONSE',
        error: isAck ? undefined : ack?.error?.message,
      };
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        return {
          ok: false,
          errorCode: 'TIMEOUT',
          error: `ONDC dispatch timed out after ${timeoutMs}ms`,
        };
      }
      return {
        ok: false,
        errorCode: 'NETWORK_ERROR',
        error: err?.message || 'Network dispatch failed',
      };
    }
  }
}

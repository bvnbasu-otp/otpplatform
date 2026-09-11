/**
 * The messaging boundary, as types.
 *
 * These modules are deliberately dependency-free and runtime-neutral: they run
 * inside Deno edge functions and are unit-tested under Node/vitest, so they use
 * only WebCrypto and standard globals. Nothing here reads Deno.env — configuration
 * is passed in, so the same code can be tested without a environment to stub.
 *
 * They live under supabase/functions/_shared rather than in packages/ because
 * Supabase deploys the functions directory alone; an import reaching into a
 * workspace package would work locally and fail on deploy.
 */

export type MessagingChannel = 'SMS' | 'WHATSAPP';

export type MessagingProviderId = 'TWILIO' | 'META' | 'MOCK';

export interface OutboundMessage {
  /** E.164, always. Providers reject anything else and so do we. */
  to: string;
  channel: MessagingChannel;
  body: string;
  templateId?: string;
}

export interface SendReceipt {
  provider: MessagingProviderId;
  /** Null when the provider accepted the message but named no id. */
  externalMessageId: string | null;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  failureReason?: string;
}

export interface InboundMessage {
  provider: MessagingProviderId;
  channel: MessagingChannel;
  /** The provider's id for this message: our idempotency key. */
  externalMessageId: string | null;
  /** Sender in E.164. */
  from: string;
  body: string;
  /**
   * The provider's payload, minus anything secret. Kept as evidence of what a
   * supplier actually sent when a price is later disputed.
   */
  raw: Record<string, unknown>;
}

export interface WebhookRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Unparsed body: signature verification must see the exact bytes. */
  rawBody: string;
}

export interface MessagingProvider {
  readonly id: MessagingProviderId;
  readonly channels: readonly MessagingChannel[];

  send(message: OutboundMessage): Promise<SendReceipt>;

  /**
   * True only if this request provably came from the provider.
   *
   * Called before the body is read for meaning. An unverified webhook is
   * discarded, because the alternative is letting anyone who knows the URL
   * place bids as any supplier.
   */
  verify(request: WebhookRequest): Promise<boolean>;

  /**
   * Provider payload to our shape. May return several: Meta batches messages.
   * Returns [] for callbacks that carry no supplier message, such as delivery
   * receipts.
   */
  parse(request: WebhookRequest): InboundMessage[];

  /** Delivery-status callbacks, which arrive on the same webhook. */
  parseStatus(request: WebhookRequest): DeliveryStatusUpdate[];
}

export interface DeliveryStatusUpdate {
  provider: MessagingProviderId;
  externalMessageId: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  failureReason?: string;
}

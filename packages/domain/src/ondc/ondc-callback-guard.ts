/**
 * Callback admission for /on_search.
 * Invalid or missing signatures fail closed. A missing public key is not success.
 * Unknown transactions are rejected. Replays are idempotent.
 * This module does not invent participant ids, display names, or ratings.
 */

export type OndcCallbackRejectReason =
  | 'missing_signature'
  | 'invalid_signature'
  | 'public_key_not_configured'
  | 'malformed_callback'
  | 'unknown_transaction';

export type OndcCallbackAdmission =
  | { ok: false; reason: OndcCallbackRejectReason }
  | { ok: true; replay: boolean; transactionId: string; messageId: string; messageKey: string };

export interface OndcCallbackAdmissionInput {
  authorizationHeader?: string | null;
  publicKeyConfigured: boolean;
  signatureValid: boolean;
  payload: unknown;
  knownTransactionIds: readonly string[];
  seenMessageKeys: readonly string[];
}

export function ondcCallbackMessageKey(transactionId: string, messageId: string): string {
  return `${transactionId}\u001f${messageId}`;
}

export function admitOndcOnSearchCallback(input: OndcCallbackAdmissionInput): OndcCallbackAdmission {
  if (!input.authorizationHeader?.trim()) return { ok: false, reason: 'missing_signature' };
  if (!input.publicKeyConfigured) return { ok: false, reason: 'public_key_not_configured' };
  if (!input.signatureValid) return { ok: false, reason: 'invalid_signature' };

  const parsed = parseOnSearchEnvelope(input.payload);
  if (!parsed) return { ok: false, reason: 'malformed_callback' };
  if (!input.knownTransactionIds.includes(parsed.transactionId)) {
    return { ok: false, reason: 'unknown_transaction' };
  }
  const messageKey = ondcCallbackMessageKey(parsed.transactionId, parsed.messageId);
  return {
    ok: true,
    replay: input.seenMessageKeys.includes(messageKey),
    transactionId: parsed.transactionId,
    messageId: parsed.messageId,
    messageKey,
  };
}

function parseOnSearchEnvelope(payload: unknown): { transactionId: string; messageId: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const context = (payload as { context?: unknown }).context;
  const message = (payload as { message?: unknown }).message;
  if (!context || typeof context !== 'object') return null;
  if (!message || typeof message !== 'object') return null;
  const action = (context as { action?: unknown }).action;
  const transactionId = (context as { transaction_id?: unknown }).transaction_id;
  const messageId = (context as { message_id?: unknown }).message_id;
  if (action !== 'on_search') return null;
  if (typeof transactionId !== 'string' || transactionId.trim() === '') return null;
  if (typeof messageId !== 'string' || messageId.trim() === '') return null;
  return { transactionId: transactionId.trim(), messageId: messageId.trim() };
}

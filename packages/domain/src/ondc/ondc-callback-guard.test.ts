import { describe, expect, it } from 'vitest';
import { admitOndcOnSearchCallback, ondcCallbackMessageKey } from './ondc-callback-guard';

const payload = {
  context: {
    action: 'on_search',
    transaction_id: 'tx-callback-1',
    message_id: 'msg-callback-1',
  },
  message: { catalog: { providers: [] } },
};

describe('ONDC callback guard', () => {
  it('fails closed for a missing signature, a missing public key, and an invalid signature', () => {
    expect(
      admitOndcOnSearchCallback({
        authorizationHeader: '',
        publicKeyConfigured: true,
        signatureValid: true,
        payload,
        knownTransactionIds: ['tx-callback-1'],
        seenMessageKeys: [],
      }).ok,
    ).toBe(false);
    expect(
      admitOndcOnSearchCallback({
        authorizationHeader: 'Signature keyId="x"',
        publicKeyConfigured: false,
        signatureValid: true,
        payload,
        knownTransactionIds: ['tx-callback-1'],
        seenMessageKeys: [],
      }),
    ).toMatchObject({ ok: false, reason: 'public_key_not_configured' });
    expect(
      admitOndcOnSearchCallback({
        authorizationHeader: 'Signature keyId="x"',
        publicKeyConfigured: true,
        signatureValid: false,
        payload,
        knownTransactionIds: ['tx-callback-1'],
        seenMessageKeys: [],
      }),
    ).toMatchObject({ ok: false, reason: 'invalid_signature' });
  });

  it('rejects a malformed callback and an unknown transaction', () => {
    expect(
      admitOndcOnSearchCallback({
        authorizationHeader: 'Signature keyId="x"',
        publicKeyConfigured: true,
        signatureValid: true,
        payload: { context: { action: 'on_select' } },
        knownTransactionIds: ['tx-callback-1'],
        seenMessageKeys: [],
      }),
    ).toMatchObject({ ok: false, reason: 'malformed_callback' });
    expect(
      admitOndcOnSearchCallback({
        authorizationHeader: 'Signature keyId="x"',
        publicKeyConfigured: true,
        signatureValid: true,
        payload,
        knownTransactionIds: [],
        seenMessageKeys: [],
      }),
    ).toMatchObject({ ok: false, reason: 'unknown_transaction' });
  });

  it('treats a repeated message key as an idempotent replay', () => {
    const messageKey = ondcCallbackMessageKey('tx-callback-1', 'msg-callback-1');
    const first = admitOndcOnSearchCallback({
      authorizationHeader: 'Signature keyId="x"',
      publicKeyConfigured: true,
      signatureValid: true,
      payload,
      knownTransactionIds: ['tx-callback-1'],
      seenMessageKeys: [],
    });
    const second = admitOndcOnSearchCallback({
      authorizationHeader: 'Signature keyId="x"',
      publicKeyConfigured: true,
      signatureValid: true,
      payload,
      knownTransactionIds: ['tx-callback-1'],
      seenMessageKeys: [messageKey],
    });
    expect(first).toMatchObject({ ok: true, replay: false, messageKey });
    expect(second).toMatchObject({ ok: true, replay: true, messageKey });
  });
});

/**
 * PRE_PROD registry v2.0/lookup.
 * Request fields are the cited Swagger 2.1.0 required set: subscriber_id, country, city, domain, type,
 * plus ukId. Production registry hosts are refused before any request.
 * The signing private key is used only to build the Authorization header and is not returned.
 */
import { isProductionOndcHost } from '@otp/domain';
import { createOndcAuthHeader } from './crypto/ondc-auth-crypto';

export function resolveOndcV2LookupUrl(registryUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(registryUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (isProductionOndcHost(url.toString())) return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/v2.0/lookup')) return url.toString();
  if (path === '') {
    url.pathname = '/v2.0/lookup';
    return url.toString();
  }
  return null;
}

export async function lookupOndcSigningPublicKey(input: {
  registryUrl: string;
  subscriberId: string;
  uniqueKeyId: string;
  signingPrivateKey: string;
  targetSubscriberId: string;
  targetUniqueKeyId: string;
  country: string;
  city: string;
  domain: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const lookupUrl = resolveOndcV2LookupUrl(input.registryUrl);
  if (!lookupUrl || isProductionOndcHost(lookupUrl)) return null;
  if (!input.targetSubscriberId || !input.targetUniqueKeyId || !input.city || !input.domain || !input.country) {
    return null;
  }
  const body = JSON.stringify({
    subscriber_id: input.targetSubscriberId,
    country: input.country,
    city: input.city,
    domain: input.domain,
    type: 'BPP',
    ukId: input.targetUniqueKeyId,
  });
  let authorization = '';
  try {
    authorization = createOndcAuthHeader({
      body,
      subscriberId: input.subscriberId,
      uniqueKeyId: input.uniqueKeyId,
      privateKeyPem: input.signingPrivateKey,
    });
  } catch {
    return null;
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(lookupUrl, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: authorization,
      },
      body,
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    return selectSigningPublicKey(payload, input.targetSubscriberId, input.targetUniqueKeyId);
  } catch {
    return null;
  }
}

function selectSigningPublicKey(payload: unknown, subscriberId: string, uniqueKeyId: string): string | null {
  if (!Array.isArray(payload)) return null;
  const matches = payload.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const record = row as Record<string, unknown>;
    const keyId = typeof record.ukId === 'string' ? record.ukId : typeof record.unique_key_id === 'string' ? record.unique_key_id : '';
    if (typeof record.type === 'string' && record.type !== 'BPP') return false;
    if (typeof record.status === 'string' && record.status !== 'SUBSCRIBED') return false;
    return record.subscriber_id === subscriberId && keyId === uniqueKeyId && typeof record.signing_public_key === 'string';
  });
  if (matches.length !== 1) return null;
  const record = matches[0] as Record<string, unknown>;
  if (typeof record.valid_until === 'string') {
    const until = Date.parse(record.valid_until);
    if (!Number.isFinite(until) || until <= Date.now()) return null;
  }
  const key = (record.signing_public_key as string).trim();
  return key.length > 0 ? key : null;
}

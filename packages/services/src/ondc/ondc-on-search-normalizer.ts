/**
 * Canonical Beckn /on_search translation boundary.
 * Validate, then normalize, then return NormalizedProviderSupplierCandidate values.
 * Side-effect free: no supplier, invitation, quote, award, database, notification,
 * RFQ dispatcher, or procurement decision.
 *
 * This module does not import the BAP receiver. That receiver remains a separate
 * callback adapter and is not on this path.
 * Buyer discovery scope is passed in separately and is never copied from the seller address.
 */
import {
  normalizeOndcOnSearchRecord,
  type OndcDiscoveryRequestScope,
  type OndcNormalizeResult,
  type OndcNormalizedCandidate,
  type OndcOnSearchRecord,
} from '@otp/domain';
import type { OndcCatalog, OndcPayload, OndcProvider } from './types/ondc-beckn';

export function normalizeBecknOnSearchCatalog(
  payload: OndcPayload<{ catalog?: OndcCatalog }>,
  observedAt: string,
  scope?: OndcDiscoveryRequestScope,
): OndcNormalizedCandidate[] {
  const records = becknOnSearchRecords(payload, observedAt);
  const candidates: OndcNormalizedCandidate[] = [];
  for (const record of records) {
    const result: OndcNormalizeResult = normalizeOndcOnSearchRecord(record, scope);
    if (result.ok) candidates.push(result.candidate);
  }
  return candidates;
}

export function becknOnSearchRecords(
  payload: OndcPayload<{ catalog?: OndcCatalog }>,
  observedAt: string,
): OndcOnSearchRecord[] {
  const context = payload?.context;
  if (context?.action !== 'on_search') return [];
  const participantId = context.bpp_id?.trim();
  const correlationId = context.transaction_id?.trim();
  if (!participantId || !correlationId) return [];

  const providers = payload.message?.catalog?.providers ?? [];
  const catalogueId = payload.message?.catalog?.id?.trim() || undefined;
  const records: OndcOnSearchRecord[] = [];

  for (const provider of providers) {
    const sellerId = provider?.id?.trim();
    if (!sellerId) continue;
    const locations = provider.locations ?? [];
    if (locations.length === 0) {
      records.push(toRecord(provider, undefined, { participantId, correlationId, catalogueId, observedAt, context }));
      continue;
    }
    for (const location of locations) {
      if (!location?.id?.trim()) continue;
      records.push(toRecord(provider, location, { participantId, correlationId, catalogueId, observedAt, context }));
    }
  }

  return records;
}

function toRecord(
  provider: OndcProvider,
  location: NonNullable<OndcProvider['locations']>[number] | undefined,
  shared: {
    participantId: string;
    correlationId: string;
    catalogueId?: string;
    observedAt: string;
    context: OndcPayload<{ catalog?: OndcCatalog }>['context'];
  },
): OndcOnSearchRecord {
  const coordinates = parseGps(location?.gps);
  const namedCategory = provider.categories?.find((entry) => entry.descriptor?.name?.trim());
  const identifiedCategory = provider.categories?.find((entry) => entry.id?.trim());
  const itemCategoryId = provider.items?.find((item) => item.category_id?.trim())?.category_id?.trim();

  return {
    participantId: shared.participantId,
    sellerId: provider.id,
    sellerName: provider.descriptor?.name,
    locationId: location?.id,
    catalogueId: shared.catalogueId,
    itemIds: (provider.items ?? []).map((item) => item.id),
    domain: shared.context.domain,
    providerSubcategory: identifiedCategory?.id?.trim() || itemCategoryId,
    cityCode: location?.city?.code,
    country: location?.address?.country,
    endpoint: shared.context.bpp_uri,
    formattedAddress: formatReportedAddress(location?.address),
    sellerLocality: location?.address?.locality,
    sellerPin: location?.address?.area_code,
    sellerCity: location?.address?.city || location?.city?.name,
    sellerState: location?.address?.state,
    sellerCountry: location?.address?.country,
    coordinates,
    phone: provider.contact?.phone,
    email: provider.contact?.email,
    category: namedCategory?.descriptor?.name?.trim(),
    correlationId: shared.correlationId,
    messageId: shared.context.message_id,
    contextTimestamp: shared.context.timestamp,
    observedAt: shared.observedAt,
  };
}

function parseGps(gps?: string): { lat: number; lng: number } | undefined {
  if (!gps?.trim()) return undefined;
  const [latRaw, lngRaw] = gps.split(',');
  const lat = Number(latRaw?.trim());
  const lng = Number(lngRaw?.trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function formatReportedAddress(
  address?: NonNullable<NonNullable<OndcProvider['locations']>[number]['address']>,
): string | undefined {
  if (!address) return undefined;
  const parts = [address.door, address.building, address.street, address.locality].filter(
    (part): part is string => Boolean(part?.trim()),
  );
  return parts.length > 0 ? parts.map((part) => part.trim()).join(', ') : undefined;
}

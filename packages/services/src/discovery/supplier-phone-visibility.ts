/**
 * Operational supplier phone visibility.
 *
 * Persisted Google phone is admin/SuperAdmin supplier-network data.
 * Buyer disclosure is the existing reveal contract only: `reveal_award` returns
 * `contact_phone` when `rfqs.reveal_status` is REVEALED. RFQ lifecycle status
 * (including awarded, closed, or completed) does not disclose it by itself.
 * An invitation row is not a message send and is not a reveal.
 */

const OPERATIONAL_PHONE_KEYS = new Set([
  'phone',
  'contactPhone',
  'contact_phone',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'supplierPhone',
  'supplierContactPhone',
  'supplier_phone',
  'contact_phone_number',
]);

export function readPersistedCoveragePhone(row: {
  phone?: string | null;
  locations?: Array<{ phone?: unknown } | Record<string, unknown>>;
}): string {
  if (typeof row.phone === 'string' && row.phone.trim()) return row.phone.trim();
  for (const loc of row.locations ?? []) {
    const nested = (loc as { phone?: unknown }).phone;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return '';
}

/** SuperAdmin operational coverage responses may carry the persisted phone. */
export function coveragePhoneVisibleToViewer(viewer: { isSuperAdmin: boolean }): boolean {
  return viewer.isSuperAdmin === true;
}

/**
 * True only for the existing identity-reveal state.
 * `AWARDED`, `SETTLED`, `COMPLETED`, and other lifecycle labels are not reveal.
 */
export function buyerMaySeeSupplierContact(revealStatus: string | null | undefined): boolean {
  return revealStatus === 'REVEALED';
}

function stripPhoneKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripPhoneKeys(item));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (OPERATIONAL_PHONE_KEYS.has(key)) continue;
    out[key] = stripPhoneKeys(nested);
  }
  return out;
}

/** Removes operational phone fields at every depth. Does not invent a replacement. */
export function redactOperationalPhone<T>(value: T): T {
  return stripPhoneKeys(structuredClone(value)) as T;
}

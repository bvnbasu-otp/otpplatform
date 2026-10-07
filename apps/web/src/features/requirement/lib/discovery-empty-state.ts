export type DiscoveryEmptyKind =
  | 'HAS_RESULTS'
  | 'LEGITIMATE_ZERO'
  | 'SERVICE_FAILURE'
  | 'AUTH_PENDING'
  | 'QUOTA_FAILURE'
  | 'UNSUPPORTED_CATEGORY'
  | 'INVALID_REQUIREMENT'
  | 'ELIGIBILITY_REJECTION';

/**
 * Zero eligible suppliers stay a real empty result.
 * Auth, quota, category, validity, eligibility, and service failures are not
 * reported as "no suppliers found".
 */
export function classifyDiscoveryEmpty(input: {
  supplierCount: number;
  error: string | null;
}): DiscoveryEmptyKind {
  if (input.supplierCount > 0) return 'HAS_RESULTS';
  const error = input.error?.trim() ?? '';
  if (!error) return 'LEGITIMATE_ZERO';
  if (/not authenticated|access denied|sign in/i.test(error)) return 'AUTH_PENDING';
  if (/quota|resource_exhausted|over_query_limit/i.test(error)) return 'QUOTA_FAILURE';
  if (/unsupported category|category is not supported|category not supported/i.test(error)) {
    return 'UNSUPPORTED_CATEGORY';
  }
  if (/rfq not found|requirement not found|invalid requirement|pincode|pin code/i.test(error)) {
    return 'INVALID_REQUIREMENT';
  }
  if (/not addressable|eligibility|quality gate|ineligible/i.test(error)) return 'ELIGIBILITY_REJECTION';
  return 'SERVICE_FAILURE';
}

export function discoveryFailureCopy(kind: DiscoveryEmptyKind): { title: string; body: string } | null {
  switch (kind) {
    case 'AUTH_PENDING':
      return {
        title: 'Sign-in is required before discovery',
        body: 'This is not a zero-supplier result. The requirement is still available from the specification page. Finish sign-in, then use Retry Discovery.',
      };
    case 'QUOTA_FAILURE':
      return {
        title: 'Google Places quota stopped this search',
        body: 'This is not a confirmed count of eligible suppliers. The requirement is unchanged. Retry discovery later, return to the specification, or invite a known supplier.',
      };
    case 'UNSUPPORTED_CATEGORY':
      return {
        title: 'This category is not supported for discovery',
        body: 'Discovery did not run a supplier search for this category. Edit the requirement or invite a known supplier. This is not a zero-result search.',
      };
    case 'INVALID_REQUIREMENT':
      return {
        title: 'Discovery could not use this requirement',
        body: 'The requirement was not searched. Check the delivery PIN and category on the specification page, then retry. This is not a zero-supplier result.',
      };
    case 'ELIGIBILITY_REJECTION':
      return {
        title: 'Suppliers were found but none were eligible',
        body: 'Places or registered businesses were considered and rejected by the existing eligibility rules. The requirement is still available. Invite a known supplier or edit the requirement and retry.',
      };
    case 'SERVICE_FAILURE':
      return {
        title: 'Discovery did not finish',
        body: 'Supplier discovery failed, so there is no confirmed count of eligible suppliers. Use Retry Discovery above, return to the requirement specification, or invite a known supplier with the button already on this page.',
      };
    default:
      return null;
  }
}

/** The pool count is the number of suppliers actually returned. Never a placeholder. */
export function displayedSupplierCount(supplierCount: number): number {
  return supplierCount > 0 ? supplierCount : 0;
}

/**
 * Canonical OTP subcategory → ONDC discovery mapping.
 * The only domain decision is mapExplicitSubcategoryToOndcDomain.
 * Title text, client domain, and client taxonomy are ignored.
 * Allow-listed domains are discovery-only. This module does not certify orders.
 */
import { mapExplicitSubcategoryToOndcDomain } from './ondc-taxonomy-boundary';

export const ONDC_CATEGORY_MAPPING_VERSION = 'ondc-04.allow-list.1' as const;

export const OndcDiscoverySupportStatus = {
  SUPPORTED: 'SUPPORTED',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
} as const;

export type OndcDiscoverySupportStatus =
  (typeof OndcDiscoverySupportStatus)[keyof typeof OndcDiscoverySupportStatus];

export const OndcLifecycleCapability = {
  DISCOVERY_ONLY: 'DISCOVERY_ONLY',
  ORDER_CAPABLE: 'ORDER_CAPABLE',
} as const;

export type OndcLifecycleCapability =
  (typeof OndcLifecycleCapability)[keyof typeof OndcLifecycleCapability];

export const ONDC_CATEGORY_MAPPING_SOURCE = 'EXPLICIT_SUBCATEGORY_ALLOW_LIST' as const;

export interface OndcDiscoveryCategoryMapping {
  otpCategory: string | null;
  ondcDomain: 'ONDC:RET12' | 'ONDC:RET14' | null;
  /** Allow-list has no ONDC category id distinct from the domain. */
  ondcCategory: null;
  supportStatus: OndcDiscoverySupportStatus;
  lifecycleCapability: typeof OndcLifecycleCapability.DISCOVERY_ONLY;
  mappingVersion: typeof ONDC_CATEGORY_MAPPING_VERSION;
  mappingSource: typeof ONDC_CATEGORY_MAPPING_SOURCE;
}

export interface OndcDiscoveryCategoryInput {
  otpCategory?: string | null;
  subcategoryCode?: string | null;
  requirementMode?: string | null;
  /** Ignored. A caller-supplied domain cannot change support. */
  ondcDomain?: string | null;
  /** Ignored. A caller-supplied category id cannot change support. */
  ondcCategory?: string | null;
  /** Ignored. Title words are not a mapping. */
  title?: string | null;
  /** Ignored. A nested taxonomy payload cannot change support. */
  taxonomy?: unknown;
}

export function mapOndcDiscoveryCategory(input: OndcDiscoveryCategoryInput): OndcDiscoveryCategoryMapping {
  void input.ondcDomain;
  void input.ondcCategory;
  void input.title;
  void input.taxonomy;

  const subcategoryCode = clean(input.subcategoryCode);
  const otpCategory = subcategoryCode ?? clean(input.otpCategory);
  const allowListed = subcategoryCode
    ? supportedDomain(mapExplicitSubcategoryToOndcDomain(subcategoryCode, clean(input.requirementMode)))
    : null;

  if (!allowListed) {
    return {
      otpCategory,
      ondcDomain: null,
      ondcCategory: null,
      supportStatus: OndcDiscoverySupportStatus.NOT_SUPPORTED,
      lifecycleCapability: OndcLifecycleCapability.DISCOVERY_ONLY,
      mappingVersion: ONDC_CATEGORY_MAPPING_VERSION,
      mappingSource: ONDC_CATEGORY_MAPPING_SOURCE,
    };
  }

  return {
    otpCategory,
    ondcDomain: allowListed,
    ondcCategory: null,
    supportStatus: OndcDiscoverySupportStatus.SUPPORTED,
    lifecycleCapability: OndcLifecycleCapability.DISCOVERY_ONLY,
    mappingVersion: ONDC_CATEGORY_MAPPING_VERSION,
    mappingSource: ONDC_CATEGORY_MAPPING_SOURCE,
  };
}

function supportedDomain(value: string | null): 'ONDC:RET12' | 'ONDC:RET14' | null {
  if (value === 'ONDC:RET12' || value === 'ONDC:RET14') return value;
  return null;
}

function clean(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

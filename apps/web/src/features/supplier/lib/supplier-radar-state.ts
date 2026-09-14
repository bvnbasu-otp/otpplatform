import type {
  SupplierCapabilityProfile,
  SupplierRadarMatchBreakdown,
} from '../types/capability-profile';
import { DEFAULT_SUPPLIER_CAPABILITY_PROFILE } from '../types/capability-profile';

const STORAGE_KEY = 'otp_supplier_capability_profile_v1';
export const SUPPLIER_CAPABILITIES_UPDATED_EVENT = 'otp:supplier-capabilities-updated';

export function loadSupplierCapabilityProfile(): SupplierCapabilityProfile {
  if (typeof window === 'undefined') {
    return DEFAULT_SUPPLIER_CAPABILITY_PROFILE;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SUPPLIER_CAPABILITY_PROFILE;
    const parsed = JSON.parse(raw) as Partial<SupplierCapabilityProfile>;
    return {
      ...DEFAULT_SUPPLIER_CAPABILITY_PROFILE,
      ...parsed,
      categories: Array.isArray(parsed.categories) && parsed.categories.length > 0
        ? parsed.categories
        : DEFAULT_SUPPLIER_CAPABILITY_PROFILE.categories,
      slaBadges: Array.isArray(parsed.slaBadges)
        ? parsed.slaBadges
        : DEFAULT_SUPPLIER_CAPABILITY_PROFILE.slaBadges,
      certifications: Array.isArray(parsed.certifications)
        ? parsed.certifications
        : DEFAULT_SUPPLIER_CAPABILITY_PROFILE.certifications,
    };
  } catch {
    return DEFAULT_SUPPLIER_CAPABILITY_PROFILE;
  }
}

export function saveSupplierCapabilityProfile(
  profile: SupplierCapabilityProfile,
): SupplierCapabilityProfile {
  const updated: SupplierCapabilityProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(
        new CustomEvent(SUPPLIER_CAPABILITIES_UPDATED_EVENT, { detail: updated }),
      );
    } catch {
      // Ignore localStorage write failures
    }
  }

  return updated;
}

export interface RfqMatchTarget {
  rfqId?: string;
  rfqTitle?: string;
  category?: string | null;
  subcategory?: string | null;
  deliveryCity?: string | null;
  description?: string | null;
  requiredByDays?: number | null;
}

export function calculateRfqMatchScore(
  profile: SupplierCapabilityProfile,
  rfq: RfqMatchTarget,
): SupplierRadarMatchBreakdown {
  const title = (rfq.rfqTitle || '').toLowerCase();
  const cat = (rfq.category || '').toLowerCase();
  const subcat = (rfq.subcategory || '').toLowerCase();
  const desc = (rfq.description || '').toLowerCase();
  const city = (rfq.deliveryCity || '').toLowerCase();
  const baseCity = (profile.baseCity || 'bengaluru').toLowerCase();

  const reasons: string[] = [];

  // 1. Category Matching (0 - 45 pts)
  let categoryMatch = false;
  let matchedCatName = '';

  for (const declaredCat of profile.categories) {
    const dLower = declaredCat.toLowerCase();
    const keywords = dLower.split(/[\s&,/]+/).filter((w) => w.length > 2);
    const hasMatch =
      title.includes(dLower) ||
      cat.includes(dLower) ||
      subcat.includes(dLower) ||
      desc.includes(dLower) ||
      keywords.some((k) => title.includes(k) || cat.includes(k) || subcat.includes(k));

    if (hasMatch) {
      categoryMatch = true;
      matchedCatName = declaredCat;
      break;
    }
  }

  // Fallback: If no strict keyword match, partial match if supplier has broad categories
  const categoryScore = categoryMatch
    ? 45
    : profile.categories.length > 0
    ? 30
    : 15;

  if (categoryMatch) {
    reasons.push(`Domain Match: ${matchedCatName}`);
  } else if (profile.categories.length > 0) {
    reasons.push(`Catalog Domain Active (${profile.categories.length} categories)`);
  }

  // 2. Proximity & Radius Matching (0 - 25 pts)
  let radiusMatch = false;
  let radiusScore = 15;

  if (profile.isPanIndia) {
    radiusMatch = true;
    radiusScore = 25;
    reasons.push('Pan-India Coverage');
  } else if (city && (city.includes(baseCity) || baseCity.includes(city))) {
    radiusMatch = true;
    radiusScore = 25;
    reasons.push(`Proximity Match: ${profile.baseCity} (Within ${profile.radiusKm} km)`);
  } else if (!city) {
    radiusMatch = true;
    radiusScore = 20;
    reasons.push(`Regional Scope (${profile.radiusKm} km)`);
  } else {
    radiusScore = profile.radiusKm >= 100 ? 20 : 12;
    reasons.push(`Operating Radius: ${profile.radiusKm} km`);
  }

  // 3. SLA & Turnaround (0 - 15 pts)
  let slaMatch = false;
  let slaScore = 10;
  if (profile.slaBadges.length > 0) {
    slaMatch = true;
    slaScore = Math.min(15, 10 + profile.slaBadges.length * 2);
    reasons.push(`Active SLA: ${profile.slaBadges[0]}`);
  }

  // 4. Trust & Certifications (0 - 15 pts)
  let trustScore = 8;
  if (profile.certifications.length > 0) {
    trustScore = Math.min(15, 8 + profile.certifications.length * 3);
    reasons.push(`Verified: ${profile.certifications.join(', ')}`);
  }

  const overallScore = Math.min(99, categoryScore + radiusScore + slaScore + trustScore);
  const badgeLabel = `${overallScore}% Radar Match`;

  return {
    categoryMatch,
    categoryScore,
    radiusMatch,
    radiusScore,
    slaMatch,
    slaScore,
    trustScore,
    overallScore,
    matchReasons: reasons,
    badgeLabel,
  };
}

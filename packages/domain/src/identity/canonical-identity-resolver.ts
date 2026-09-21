import {
  IdentityMatchConfidence,
  IdentityResolutionMethod,
  type CanonicalIdentityResolution,
} from '../types/supplier-network-engine';
import { validateGstin } from '../gst/gstin-validator';
import { validatePan, PAN_REGEX, type PanValidationResult } from '../tax/tds-calculator';
import type { SupplierNetwork } from '../enums/supplier-network';

export interface KnownSupplierRegistryEntry {
  canonicalSupplierId: string;
  pan?: string | null;
  gstin?: string | null;
  tenantId?: string | null;
}

export interface IdentityResolutionCandidateInput {
  candidateId?: string;
  canonicalSupplierId?: string;
  pan?: string | null;
  gstin?: string | null;
  externalRef?: string | null;
  businessName?: string | null;
  network?: SupplierNetwork;
  tenantId?: string | null;
}

/**
 * Canonical Identity Resolver for Supplier Network Engine (Phase SN.3).
 *
 * Enforces:
 * 1. Exact canonical resolution on verified PAN / Luhn Mod-36 GSTIN checksum or internal UUID.
 * 2. Strict conflict prevention: contradictory PAN / GSTIN pairs or mismatched registry claims
 *    are flagged as CONFLICT and NEVER merged.
 * 3. Prevention of false merges based on fuzzy similarity, phone, or name alone.
 * 4. Multi-tenant boundary preservation: cross-tenant identity resolution is strictly prevented.
 */
export class CanonicalIdentityResolver {
  /**
   * Resolves canonical identity for an individual candidate input.
   */
  public static resolveIdentity(
    candidate: IdentityResolutionCandidateInput,
    knownRegistry?: Map<string, KnownSupplierRegistryEntry> | KnownSupplierRegistryEntry[],
  ): CanonicalIdentityResolution {
    const rawPan = candidate.pan?.trim().toUpperCase();
    const rawGstin = candidate.gstin?.trim().toUpperCase();
    const rawCanonicalId = candidate.canonicalSupplierId?.trim();

    // 1. Validate PAN and GSTIN if provided
    const panResult = rawPan ? validatePan(rawPan) : null;
    const gstinResult = rawGstin ? validateGstin(rawGstin) : null;

    // Check for invalid formatting errors if provided
    if (rawPan && panResult && !panResult.isValid) {
      return {
        matchConfidence: IdentityMatchConfidence.UNRESOLVED,
        resolutionMethod: IdentityResolutionMethod.UNRESOLVED,
        isMerged: false,
        conflictDetected: true,
        conflictReason: `Invalid PAN structure: ${panResult.error}`,
        resolvedProvenanceCount: 1,
      };
    }

    if (rawGstin && gstinResult && !gstinResult.valid) {
      return {
        matchConfidence: IdentityMatchConfidence.UNRESOLVED,
        resolutionMethod: IdentityResolutionMethod.UNRESOLVED,
        isMerged: false,
        conflictDetected: true,
        conflictReason: `Invalid GSTIN checksum or structure: ${gstinResult.error}`,
        resolvedProvenanceCount: 1,
      };
    }

    // 2. Cross-check PAN vs GSTIN for internal contradiction
    if (panResult?.isValid && gstinResult?.valid && gstinResult.pan) {
      if (rawPan !== gstinResult.pan) {
        return {
          matchConfidence: IdentityMatchConfidence.CONFLICT,
          resolutionMethod: IdentityResolutionMethod.UNRESOLVED,
          isMerged: false,
          conflictDetected: true,
          conflictReason: `Conflicting identity: Provided PAN (${rawPan}) does not match PAN in GSTIN (${gstinResult.pan})`,
          resolvedProvenanceCount: 1,
        };
      }
    }

    // Lookup against known registry if provided
    let registryMap: Map<string, KnownSupplierRegistryEntry> | undefined;
    if (knownRegistry) {
      if (knownRegistry instanceof Map) {
        registryMap = knownRegistry;
      } else if (Array.isArray(knownRegistry)) {
        registryMap = new Map();
        for (const entry of knownRegistry) {
          registryMap.set(entry.canonicalSupplierId, entry);
          if (entry.pan) registryMap.set(`pan:${entry.pan.toUpperCase()}`, entry);
          if (entry.gstin) registryMap.set(`gstin:${entry.gstin.toUpperCase()}`, entry);
        }
      }
    }

    // 3. Check known registry conflict if canonical ID is claimed
    if (rawCanonicalId && registryMap) {
      const known = registryMap.get(rawCanonicalId);
      if (known) {
        // Multi-tenant check
        if (candidate.tenantId && known.tenantId && candidate.tenantId !== known.tenantId) {
          return {
            matchConfidence: IdentityMatchConfidence.CONFLICT,
            resolutionMethod: IdentityResolutionMethod.UNRESOLVED,
            isMerged: false,
            conflictDetected: true,
            conflictReason: `Tenant isolation violation: candidate tenant (${candidate.tenantId}) does not match supplier registry tenant (${known.tenantId})`,
            resolvedProvenanceCount: 1,
          };
        }

        // PAN contradiction check
        if (panResult?.isValid && known.pan && rawPan !== known.pan.toUpperCase()) {
          return {
            matchConfidence: IdentityMatchConfidence.CONFLICT,
            resolutionMethod: IdentityResolutionMethod.UNRESOLVED,
            isMerged: false,
            conflictDetected: true,
            conflictReason: `Registry identity conflict: Claimed supplier ${rawCanonicalId} has registered PAN ${known.pan}, but candidate provided ${rawPan}`,
            resolvedProvenanceCount: 1,
          };
        }

        // GSTIN contradiction check
        if (gstinResult?.valid && known.gstin && gstinResult.pan && known.pan && gstinResult.pan !== known.pan.toUpperCase()) {
          return {
            matchConfidence: IdentityMatchConfidence.CONFLICT,
            resolutionMethod: IdentityResolutionMethod.UNRESOLVED,
            isMerged: false,
            conflictDetected: true,
            conflictReason: `Registry identity conflict: Claimed supplier ${rawCanonicalId} has registered GSTIN ${known.gstin}, but candidate provided ${rawGstin}`,
            resolvedProvenanceCount: 1,
          };
        }

        return {
          matchConfidence: IdentityMatchConfidence.EXACT_CANONICAL,
          resolutionMethod: IdentityResolutionMethod.CANONICAL_UUID,
          canonicalSupplierId: known.canonicalSupplierId,
          isMerged: false,
          conflictDetected: false,
          resolvedProvenanceCount: 1,
        };
      }
    }

    // 4. Exact match on valid GSTIN (Luhn Mod-36 checksum validated)
    if (gstinResult?.valid) {
      return {
        matchConfidence: IdentityMatchConfidence.VERIFIED_MATCH,
        resolutionMethod: IdentityResolutionMethod.GSTIN_LUHN_MOD36,
        canonicalSupplierId: rawCanonicalId,
        isMerged: false,
        conflictDetected: false,
        resolvedProvenanceCount: 1,
      };
    }

    // 5. Verified match on valid PAN structure
    if (panResult?.isValid) {
      return {
        matchConfidence: IdentityMatchConfidence.VERIFIED_MATCH,
        resolutionMethod: IdentityResolutionMethod.PAN_STRUCTURE,
        canonicalSupplierId: rawCanonicalId,
        isMerged: false,
        conflictDetected: false,
        resolvedProvenanceCount: 1,
      };
    }

    // 6. External ref without verified tax ID
    if (candidate.externalRef) {
      return {
        matchConfidence: IdentityMatchConfidence.PROBABLE_MATCH,
        resolutionMethod: IdentityResolutionMethod.EXTERNAL_REF,
        canonicalSupplierId: rawCanonicalId,
        isMerged: false,
        conflictDetected: false,
        resolvedProvenanceCount: 1,
      };
    }

    // 7. Unresolved
    return {
      matchConfidence: IdentityMatchConfidence.UNRESOLVED,
      resolutionMethod: IdentityResolutionMethod.UNRESOLVED,
      isMerged: false,
      conflictDetected: false,
      resolvedProvenanceCount: 1,
    };
  }

  /**
   * Deduplicates candidates across providers into canonical identity groups.
   * If identity conflict is detected between two candidates, DOES NOT MERGE and keeps them separate.
   */
  public static deduplicateCandidates<T extends IdentityResolutionCandidateInput>(
    candidates: T[],
    options?: {
      tenantId?: string;
      knownRegistry?: Map<string, KnownSupplierRegistryEntry> | KnownSupplierRegistryEntry[];
    },
  ): {
    deduped: Array<{
      primary: T;
      all: T[];
      resolution: CanonicalIdentityResolution;
    }>;
    conflicts: Array<{
      candidateA: T;
      candidateB: T;
      reason: string;
    }>;
  } {
    const dedupedGroups: Array<{
      primary: T;
      all: T[];
      canonicalKey: string;
      resolution: CanonicalIdentityResolution;
    }> = [];

    const conflicts: Array<{
      candidateA: T;
      candidateB: T;
      reason: string;
    }> = [];

    for (const candidate of candidates) {
      const resolution = CanonicalIdentityResolver.resolveIdentity(
        candidate,
        options?.knownRegistry,
      );

      // If individual resolution has a conflict, keep separate
      if (resolution.conflictDetected) {
        dedupedGroups.push({
          primary: candidate,
          all: [candidate],
          canonicalKey: `conflict-${candidate.candidateId ?? Math.random()}`,
          resolution,
        });
        continue;
      }

      // Determine canonical grouping key
      let canonicalKey: string | null = null;
      const cleanPan = candidate.pan?.trim().toUpperCase();
      const cleanGstin = candidate.gstin?.trim().toUpperCase();

      if (candidate.canonicalSupplierId) {
        canonicalKey = `uuid:${candidate.canonicalSupplierId.trim()}`;
      } else if (cleanPan && validatePan(cleanPan).isValid) {
        canonicalKey = `pan:${cleanPan}`;
      } else if (cleanGstin && validateGstin(cleanGstin).valid) {
        const panFromGst = cleanGstin.substring(2, 12);
        canonicalKey = `pan:${panFromGst}`;
      } else if (candidate.externalRef) {
        canonicalKey = `ref:${candidate.externalRef.trim()}`;
      }

      // If no valid unique key could be established (e.g. only name/phone provided), DO NOT MERGE
      if (!canonicalKey) {
        dedupedGroups.push({
          primary: candidate,
          all: [candidate],
          canonicalKey: `unresolved-${candidate.candidateId ?? Math.random()}`,
          resolution: {
            matchConfidence: IdentityMatchConfidence.UNRESOLVED,
            resolutionMethod: IdentityResolutionMethod.UNRESOLVED,
            isMerged: false,
            conflictDetected: false,
            resolvedProvenanceCount: 1,
          },
        });
        continue;
      }

      // Tenant isolation: prefix canonical key with tenant if tenant-scoped
      if (options?.tenantId || candidate.tenantId) {
        const tenant = candidate.tenantId ?? options?.tenantId;
        canonicalKey = `tenant:${tenant}:${canonicalKey}`;
      }

      // Look for existing group with matching canonical key
      const existingGroup = dedupedGroups.find((g) => g.canonicalKey === canonicalKey);

      if (existingGroup) {
        // Cross-check for identity conflicts before merging
        const existingCand = existingGroup.primary;
        const existingPan = existingCand.pan?.trim().toUpperCase();
        const candPan = candidate.pan?.trim().toUpperCase();

        if (existingPan && candPan && existingPan !== candPan) {
          // Conflicting PANs! DO NOT MERGE!
          const reason = `Identity conflict: Candidate ${candidate.candidateId ?? 'B'} PAN (${candPan}) conflicts with existing candidate ${existingCand.candidateId ?? 'A'} PAN (${existingPan})`;
          conflicts.push({
            candidateA: existingCand,
            candidateB: candidate,
            reason,
          });
          dedupedGroups.push({
            primary: candidate,
            all: [candidate],
            canonicalKey: `conflict-${candidate.candidateId ?? Math.random()}`,
            resolution: {
              matchConfidence: IdentityMatchConfidence.CONFLICT,
              resolutionMethod: IdentityResolutionMethod.UNRESOLVED,
              isMerged: false,
              conflictDetected: true,
              conflictReason: reason,
              resolvedProvenanceCount: 1,
            },
          });
          continue;
        }

        // Safely merge into existing group
        existingGroup.all.push(candidate);
        existingGroup.resolution.isMerged = true;
        existingGroup.resolution.resolvedProvenanceCount = existingGroup.all.length;
        if (existingGroup.resolution.matchConfidence === IdentityMatchConfidence.PROBABLE_MATCH) {
          existingGroup.resolution.matchConfidence = IdentityMatchConfidence.VERIFIED_MATCH;
          existingGroup.resolution.resolutionMethod = IdentityResolutionMethod.MULTI_PROVIDER_CONSENSUS;
        }
      } else {
        dedupedGroups.push({
          primary: candidate,
          all: [candidate],
          canonicalKey,
          resolution,
        });
      }
    }

    return {
      deduped: dedupedGroups.map((g) => ({
        primary: g.primary,
        all: g.all,
        resolution: g.resolution,
      })),
      conflicts,
    };
  }
}

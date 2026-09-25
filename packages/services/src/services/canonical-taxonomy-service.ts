/**
 * =============================================================================
 * OTP Platform — Canonical Taxonomy & Classification Service
 * =============================================================================
 * Supreme Specification: docs/RECONSTRUCT-PRODUCT-CONSTITUTION-v1.0.md
 * Stage R2-13: Canonical Taxonomy & Classification Engine
 *
 * Core Responsibilities:
 * 1. Context-scoped natural language classification preserving raw buyer intent.
 * 2. 3 Canonical Buyer Contexts: INDIVIDUAL, RWA, MSME. (Enterprise strictly purged).
 * 3. 5 Procurement Types: PRODUCT, SERVICE, PROJECT, FUNCTION, RENTAL.
 * 4. Regional cluster discovery mapping for Erode, Bhavani, Tiruppur, Coimbatore, Hosur.
 * 5. Composite / Bundled multi-part requirement resolution.
 * 6. Node lifecycle governance (ACTIVE, DEPRECATED, MERGED, PENDING_REVIEW) with immutable history.
 * 7. Unclassified requirement capture & review triage queue.
 * 8. Integration payload generator for R2-07 SupplierNetworkEngine (zero quota bypass).
 * 9. Superadmin & Founder executive oversight telemetry.
 * 10. Robust defense against Red Team Attack Vectors RT-01 through RT-16.
 * =============================================================================
 */

import {
  ALL_CANONICAL_TAXONOMY_NODES,
  CANONICAL_REGIONAL_CLUSTERS,
  CanonicalBuyerContext,
  ClassificationConfidence,
  ClassificationSource,
  CURRENT_TAXONOMY_VERSION,
  ClusterProvenance,
  ProcurementType,
  RecurringFrequency,
  TaxonomyNodeStatus,
  buildDiscoveryPayload,
  classifyRawBuyerIntent,
  type CanonicalTaxonomyNode,
  type DiscoveryClassificationPayload,
  type RegionalClusterDef,
  type RequirementClassification,
  type TaxonomyHealthMetrics,
  type UnclassifiedRequirementRecord,
} from '@otp/domain';
import type { Repositories } from '../repositories/interfaces';
import type { AuditAppService } from './audit-service';
import type { ActorContext } from '../types/actor-context';
import { auditLog } from './service-helpers';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';

export class CanonicalTaxonomyService {
  private nodes: Map<string, CanonicalTaxonomyNode> = new Map();
  private unclassifiedQueue: Map<string, UnclassifiedRequirementRecord> = new Map();
  private queryCountByCluster: Map<string, number> = new Map();
  private queryCountByCategory: Map<string, number> = new Map();

  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditAppService,
    initialNodes: readonly CanonicalTaxonomyNode[] = ALL_CANONICAL_TAXONOMY_NODES,
  ) {
    for (const node of initialNodes) {
      this.nodes.set(node.code, { ...node });
    }
  }

  // ---------------------------------------------------------------------------
  // 1. BUYER INTENT CLASSIFICATION & DISCOVERY FEEDS
  // ---------------------------------------------------------------------------

  /**
   * Classifies raw buyer intent preserving verbatim input and confidence metrics.
   */
  async classifyBuyerIntent(
    actor: ActorContext,
    params: {
      rawIntent: string;
      buyerContext: CanonicalBuyerContext;
      city?: string | null;
      pincode?: string | null;
      organizationId?: string | null;
    },
  ): Promise<RequirementClassification> {
    if (!params.rawIntent || typeof params.rawIntent !== 'string') {
      throw new ValidationError('Buyer intent must be a non-empty string');
    }

    // Verify buyer context is canonical (INDIVIDUAL, RWA, MSME)
    if (!Object.values(CanonicalBuyerContext).includes(params.buyerContext)) {
      throw new ValidationError(`Invalid buyer context: ${String(params.buyerContext)}. Supported contexts: INDIVIDUAL, RWA, MSME.`);
    }

    // Context crossover guard: RWA/MSME requirements require valid org context if specified
    if (params.buyerContext !== CanonicalBuyerContext.INDIVIDUAL && params.organizationId) {
      if (actor.organizationId && actor.organizationId !== params.organizationId) {
        throw new ForbiddenError('Cannot classify organization requirement across tenant boundary');
      }
    }

    const classification = classifyRawBuyerIntent(
      params.rawIntent,
      params.buyerContext,
      {
        city: params.city,
        pincode: params.pincode,
        nodes: Array.from(this.nodes.values()),
      },
    );

    // Track telemetry
    if (classification.categoryCode) {
      const currentCount = this.queryCountByCategory.get(classification.categoryCode) ?? 0;
      this.queryCountByCategory.set(classification.categoryCode, currentCount + 1);
    }
    if (classification.regionalClusterCode) {
      const clusterCount = this.queryCountByCluster.get(classification.regionalClusterCode) ?? 0;
      this.queryCountByCluster.set(classification.regionalClusterCode, clusterCount + 1);
    }

    // If unclassified, capture in triage queue for asynchronous review without blocking buyer
    if (classification.confidence === ClassificationConfidence.UNCLASSIFIED) {
      await this.captureUnclassifiedRequirement({
        rawIntent: params.rawIntent,
        buyerContext: params.buyerContext,
        buyerProfileId: actor.profileId,
        organizationId: params.organizationId ?? actor.organizationId,
        city: params.city,
        pincode: params.pincode,
        suggestedKeywords: classification.matchedKeywords,
      });
    }

    return classification;
  }

  /**
   * Builds discovery payload for R2-07 SupplierNetworkEngine without bypassing quotas.
   */
  buildDiscoveryPayload(
    classification: RequirementClassification,
    location: { pincode?: string | null; city?: string | null; radiusKm?: number },
    targetAttributes: Record<string, unknown> = {},
  ): DiscoveryClassificationPayload {
    return buildDiscoveryPayload(classification, location, targetAttributes);
  }

  // ---------------------------------------------------------------------------
  // 2. TAXONOMY CATALOG & REGIONAL CLUSTERS
  // ---------------------------------------------------------------------------

  /**
   * Returns active taxonomy nodes filtered by buyer context and procurement type.
   */
  async getNodes(filters?: {
    context?: CanonicalBuyerContext;
    procurementType?: ProcurementType;
    status?: TaxonomyNodeStatus;
    clusterCode?: string;
  }): Promise<CanonicalTaxonomyNode[]> {
    let result = Array.from(this.nodes.values());

    const targetStatus = filters?.status ?? TaxonomyNodeStatus.ACTIVE;
    result = result.filter((n) => n.status === targetStatus);

    if (filters?.context) {
      result = result.filter((n) => n.buyerContexts.includes(filters.context!));
    }
    if (filters?.procurementType) {
      result = result.filter((n) => n.procurementType === filters.procurementType);
    }
    if (filters?.clusterCode) {
      result = result.filter((n) => n.regionalClusters?.includes(filters.clusterCode!));
    }

    return result.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  }

  /**
   * Retrieves a single taxonomy node by unique code.
   */
  async getNodeByCode(code: string): Promise<CanonicalTaxonomyNode> {
    const node = this.nodes.get(code);
    if (!node) {
      throw new NotFoundError(`Taxonomy node with code '${code}' not found`);
    }
    return { ...node };
  }

  /**
   * Returns regional industrial clusters with verified provenance.
   */
  async getRegionalClusters(state?: string): Promise<RegionalClusterDef[]> {
    let clusters = [...CANONICAL_REGIONAL_CLUSTERS];
    if (state) {
      clusters = clusters.filter((c) => c.state.toLowerCase() === state.toLowerCase());
    }
    return clusters;
  }

  // ---------------------------------------------------------------------------
  // 3. TAXONOMY GOVERNANCE & NODE LIFECYCLE (ADMIN ONLY)
  // ---------------------------------------------------------------------------

  /**
   * Creates a new canonical taxonomy node (Platform Admin role required).
   */
  async createNode(
    actor: ActorContext,
    params: Omit<CanonicalTaxonomyNode, 'id' | 'version' | 'status'>,
  ): Promise<CanonicalTaxonomyNode> {
    this.assertPlatformAdmin(actor, 'create taxonomy node');

    if (this.nodes.has(params.code)) {
      throw new ValidationError(`Taxonomy node with code '${params.code}' already exists`);
    }

    if (!params.buyerContexts || params.buyerContexts.length === 0) {
      throw new ValidationError('At least one canonical buyer context is required');
    }

    for (const ctx of params.buyerContexts) {
      if (!Object.values(CanonicalBuyerContext).includes(ctx)) {
        throw new ValidationError(`Invalid buyer context '${String(ctx)}'`);
      }
    }

    const newNode: CanonicalTaxonomyNode = {
      ...params,
      id: `node_custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: TaxonomyNodeStatus.ACTIVE,
      version: CURRENT_TAXONOMY_VERSION,
    };

    this.nodes.set(newNode.code, newNode);

    await auditLog(
      this.audit,
      actor,
      'taxonomy_node',
      newNode.code,
      'TAXONOMY_NODE_CREATED',
      null,
      null,
      {
        code: newNode.code,
        name: newNode.name,
        categoryCode: newNode.categoryCode,
        buyerContexts: newNode.buyerContexts,
      },
    );

    return { ...newNode };
  }

  /**
   * Updates an existing taxonomy node (Platform Admin role required).
   */
  async updateNode(
    actor: ActorContext,
    code: string,
    updates: Partial<Omit<CanonicalTaxonomyNode, 'id' | 'code' | 'version'>>,
  ): Promise<CanonicalTaxonomyNode> {
    this.assertPlatformAdmin(actor, 'update taxonomy node');

    const existing = await this.getNodeByCode(code);
    const updated: CanonicalTaxonomyNode = {
      ...existing,
      ...updates,
      code: existing.code, // Immutable code
      id: existing.id,     // Immutable ID
      version: CURRENT_TAXONOMY_VERSION,
    };

    this.nodes.set(code, updated);

    await auditLog(
      this.audit,
      actor,
      'taxonomy_node',
      code,
      'TAXONOMY_NODE_UPDATED',
      null,
      null,
      { updates },
    );

    return { ...updated };
  }

  /**
   * Deprecates a taxonomy node in favor of a newer node (Platform Admin required; zero historical rewrite).
   */
  async deprecateNode(
    actor: ActorContext,
    code: string,
    deprecatedInFavorOf?: string,
  ): Promise<CanonicalTaxonomyNode> {
    this.assertPlatformAdmin(actor, 'deprecate taxonomy node');

    const node = await this.getNodeByCode(code);
    if (deprecatedInFavorOf && !this.nodes.has(deprecatedInFavorOf)) {
      throw new ValidationError(`Target replacement node '${deprecatedInFavorOf}' does not exist`);
    }

    const updated: CanonicalTaxonomyNode = {
      ...node,
      status: TaxonomyNodeStatus.DEPRECATED,
      deprecatedInFavorOf: deprecatedInFavorOf ?? null,
    };

    this.nodes.set(code, updated);

    await auditLog(
      this.audit,
      actor,
      'taxonomy_node',
      code,
      'TAXONOMY_NODE_DEPRECATED',
      null,
      null,
      { deprecatedInFavorOf },
    );

    return { ...updated };
  }

  /**
   * Merges a source node into a target node (Platform Admin required; preserves historical records).
   */
  async mergeNodes(
    actor: ActorContext,
    sourceCode: string,
    targetCode: string,
  ): Promise<CanonicalTaxonomyNode> {
    this.assertPlatformAdmin(actor, 'merge taxonomy nodes');

    if (sourceCode === targetCode) {
      throw new ValidationError('Cannot merge a taxonomy node into itself');
    }

    const source = await this.getNodeByCode(sourceCode);
    const target = await this.getNodeByCode(targetCode);

    // Merge synonyms and match keywords into target
    const combinedKeywords = Array.from(new Set([...target.matchKeywords, ...source.matchKeywords]));
    const combinedSynonyms = Array.from(new Set([...target.synonyms, ...source.synonyms]));

    const updatedTarget: CanonicalTaxonomyNode = {
      ...target,
      matchKeywords: combinedKeywords,
      synonyms: combinedSynonyms,
    };

    const updatedSource: CanonicalTaxonomyNode = {
      ...source,
      status: TaxonomyNodeStatus.MERGED,
      mergedIntoNodeId: target.id,
      deprecatedInFavorOf: target.code,
    };

    this.nodes.set(targetCode, updatedTarget);
    this.nodes.set(sourceCode, updatedSource);

    await auditLog(
      this.audit,
      actor,
      'taxonomy_node',
      sourceCode,
      'TAXONOMY_NODES_MERGED',
      null,
      null,
      {
        sourceCode,
        targetCode,
        targetId: target.id,
      },
    );

    return { ...updatedTarget };
  }

  // ---------------------------------------------------------------------------
  // 4. UNCLASSIFIED REQUIREMENTS TRIAGE QUEUE
  // ---------------------------------------------------------------------------

  /**
   * Captures an unclassified requirement into the triage queue.
   */
  async captureUnclassifiedRequirement(
    record: Omit<UnclassifiedRequirementRecord, 'id' | 'capturedAt' | 'reviewStatus'>,
  ): Promise<UnclassifiedRequirementRecord> {
    const id = `unclass_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullRecord: UnclassifiedRequirementRecord = {
      ...record,
      id,
      capturedAt: new Date().toISOString(),
      reviewStatus: 'PENDING',
    };

    this.unclassifiedQueue.set(id, fullRecord);
    return { ...fullRecord };
  }

  /**
   * Retrieves unclassified requirements queue.
   */
  async getUnclassifiedQueue(
    reviewStatus?: 'PENDING' | 'TRIAGED' | 'NODE_CREATED' | 'DISMISSED',
  ): Promise<UnclassifiedRequirementRecord[]> {
    let list = Array.from(this.unclassifiedQueue.values());
    if (reviewStatus) {
      list = list.filter((r) => r.reviewStatus === reviewStatus);
    }
    return list.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }

  /**
   * Triages an unclassified requirement (Platform Admin required).
   */
  async triageUnclassifiedRequirement(
    actor: ActorContext,
    id: string,
    action: 'TRIAGED' | 'NODE_CREATED' | 'DISMISSED',
    options?: {
      targetSubcategoryCode?: string;
      reviewNotes?: string;
    },
  ): Promise<UnclassifiedRequirementRecord> {
    this.assertPlatformAdmin(actor, 'triage unclassified requirement');

    const record = this.unclassifiedQueue.get(id);
    if (!record) {
      throw new NotFoundError(`Unclassified requirement '${id}' not found`);
    }

    const updated: UnclassifiedRequirementRecord = {
      ...record,
      reviewStatus: action,
      reviewedBy: actor.profileId,
      targetSubcategoryCode: options?.targetSubcategoryCode ?? null,
      reviewNotes: options?.reviewNotes ?? null,
    };

    this.unclassifiedQueue.set(id, updated);

    await auditLog(
      this.audit,
      actor,
      'unclassified_requirement',
      id,
      'UNCLASSIFIED_REQUIREMENT_TRIAGED',
      null,
      null,
      { action, ...options },
    );

    return { ...updated };
  }

  // ---------------------------------------------------------------------------
  // 5. SUPERADMIN & FOUNDER VISIBILITY METRICS
  // ---------------------------------------------------------------------------

  /**
   * Returns master taxonomy health metrics for Superadmin and CEO/Founder dashboards.
   */
  async getTaxonomyHealthMetrics(): Promise<TaxonomyHealthMetrics> {
    const all = Array.from(this.nodes.values());
    const activeNodes = all.filter((n) => n.status === TaxonomyNodeStatus.ACTIVE).length;
    const deprecatedNodes = all.filter((n) => n.status === TaxonomyNodeStatus.DEPRECATED).length;
    const mergedNodes = all.filter((n) => n.status === TaxonomyNodeStatus.MERGED).length;
    const pendingReviewNodes = all.filter((n) => n.status === TaxonomyNodeStatus.PENDING_REVIEW).length;

    const nodesByContext: Record<CanonicalBuyerContext, number> = {
      INDIVIDUAL: all.filter((n) => n.buyerContexts.includes(CanonicalBuyerContext.INDIVIDUAL)).length,
      RWA: all.filter((n) => n.buyerContexts.includes(CanonicalBuyerContext.RWA)).length,
      MSME: all.filter((n) => n.buyerContexts.includes(CanonicalBuyerContext.MSME)).length,
    };

    const nodesByProcurementType: Record<ProcurementType, number> = {
      PRODUCT: all.filter((n) => n.procurementType === ProcurementType.PRODUCT).length,
      SERVICE: all.filter((n) => n.procurementType === ProcurementType.SERVICE).length,
      PROJECT: all.filter((n) => n.procurementType === ProcurementType.PROJECT).length,
      FUNCTION: all.filter((n) => n.procurementType === ProcurementType.FUNCTION).length,
      RENTAL: all.filter((n) => n.procurementType === ProcurementType.RENTAL).length,
    };

    const unclassifiedPending = Array.from(this.unclassifiedQueue.values()).filter(
      (r) => r.reviewStatus === 'PENDING',
    ).length;

    return {
      totalNodes: all.length,
      activeNodes,
      deprecatedNodes,
      mergedNodes,
      pendingReviewNodes,
      nodesByContext,
      nodesByProcurementType,
      regionalClusterCount: CANONICAL_REGIONAL_CLUSTERS.length,
      unclassifiedCount: unclassifiedPending,
      taxonomyVersion: CURRENT_TAXONOMY_VERSION,
    };
  }

  /**
   * Returns regional demand distribution for founder observability.
   */
  async getRegionalDemandHeatmap(): Promise<Array<{ clusterCode: string; clusterName: string; queryCount: number }>> {
    return CANONICAL_REGIONAL_CLUSTERS.map((c) => ({
      clusterCode: c.code,
      clusterName: c.name,
      queryCount: this.queryCountByCluster.get(c.code) ?? 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // PRIVATE GUARDS & HELPERS
  // ---------------------------------------------------------------------------

  private assertPlatformAdmin(actor: ActorContext, operation: string): void {
    if (!actor.isPlatformAdmin) {
      throw new ForbiddenError(`Platform Admin authorization required to ${operation}`);
    }
  }
}

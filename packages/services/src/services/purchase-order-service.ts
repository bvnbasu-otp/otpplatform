import {
  buildTaxSnapshot,
  calculateAuthorizedPoCommitment,
  calculateChangeOrderTotals,
  calculateOrderTaxBreakdown,
  calculatePlatformFee,
  calculatePoSettlementSummary,
  canTransitionChangeOrder,
  canTransitionPurchaseOrder,
  determinePlaceOfSupply,
  validateChangeOrderCommitment,
  type CalculatedLineItemTax,
  type ChangeOrderStatus,
  type ChangeOrderType,
  type PurchaseOrderStatus,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type {
  PlatformFeePolicyEntity,
  PoChangeOrderEntity,
  PoChangeOrderItemEntity,
  PoFeeSnapshotEntity,
  PurchaseOrder,
} from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import {
  auditLog,
  assertTransition,
  requireOrgAccess,
  requireSupplierAccess,
} from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export class PurchaseOrderService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  async createFromAward(
    actor: ActorContext,
    awardId: string,
  ): Promise<Result<PurchaseOrder, Error>> {
    const award = await this.repos.awards.findById(awardId);
    if (!award) return err(new ValidationError('Award not found'));

    if (award.status !== 'REVEALED') {
      return err(new ValidationError('Award must be REVEALED before PO creation'));
    }

    const rfq = await this.repos.rfqs.findById(award.rfqId);
    if (!rfq) return err(new ValidationError('RFQ not found'));

    const access = requireOrgAccess(actor, rfq.organizationId, [
      'OWNER',
      'MANAGER',
    ]);
    if (!access.ok) return access;

    const quote = await this.repos.quotes.findById(award.quoteId);
    if (!quote) return err(new ValidationError('Awarded quote not found'));

    const versions = await this.repos.quoteVersions.findByQuoteId(quote.id);
    const latest = versions.find((v) => v.version === quote.currentVersion);
    if (!latest) return err(new ValidationError('Quote version not found'));

    const now = timestamp();

    // 1. Determine Place of Supply using Statutory Tax Domain Engine
    const pos = determinePlaceOfSupply({
      supplierStateCode: '29', // Default Karnataka or derived from supplier
      recipientStateCode: '29', // Default Karnataka buyer org
      supplyType: 'PRODUCT_GOODS',
    });

    const base = Math.round((latest.snapshot.totalCost / 1.18) * 100) / 100;
    const item1Rate = Math.round(base * 0.50 * 100) / 100;
    const item2Rate = Math.round(base * 0.30 * 100) / 100;
    const item3Rate = Math.round((base - (item1Rate + item2Rate)) * 100) / 100;

    const rawLineItems = [
      {
        itemIndex: 1,
        description: `Primary Contract Scope / Core Deliverables (Ref: ${award.rfqId.slice(0, 8)})`,
        hsnSacCode: '995411',
        quantity: 1,
        unit: 'lot',
        unitPrice: item1Rate,
        gstRate: 18.0,
      },
      {
        itemIndex: 2,
        description: 'Execution, Labor, Testing & Site Staging',
        hsnSacCode: '995461',
        quantity: 1,
        unit: 'lot',
        unitPrice: item2Rate,
        gstRate: 18.0,
      },
      {
        itemIndex: 3,
        description: 'QA Inspection Sign-off & Warranty Activation',
        hsnSacCode: '998719',
        quantity: 1,
        unit: 'lot',
        unitPrice: item3Rate,
        gstRate: 18.0,
      },
    ];

    const taxBreakdown = calculateOrderTaxBreakdown(rawLineItems, pos);

    const taxSnapshot = buildTaxSnapshot({
      supplierStateCode: '29',
      buyerStateCode: '29',
      supplyType: 'PRODUCT_GOODS',
      pos,
      taxBreakdown,
      capturedAt: now,
    });

    const po: PurchaseOrder = {
      id: createId(),
      awardId,
      rfqId: award.rfqId,
      organizationId: rfq.organizationId,
      supplierId: quote.supplierId,
      poNumber: `PO-${now.slice(0, 10)}-${createId().slice(0, 8)}`,
      status: 'DRAFT',
      totalAmount: latest.snapshot.totalCost,
      currency: latest.snapshot.currency,
      placeOfSupplyStateCode: pos.placeOfSupplyStateCode,
      placeOfSupplyBasis: pos.placeOfSupplyBasis,
      taxableTotal: taxBreakdown.taxableTotal,
      cgstTotal: taxBreakdown.cgstTotal,
      sgstTotal: taxBreakdown.sgstTotal,
      utgstTotal: taxBreakdown.utgstTotal,
      igstTotal: taxBreakdown.igstTotal,
      taxSnapshot: taxSnapshot as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repos.purchaseOrders.save(po);

    // Auto-generate normalized line items with statutory GST splitting if repo is available
    if (this.repos.poLineItems) {
      await this.repos.poLineItems.saveMany(
        taxBreakdown.lineItems.map((li: CalculatedLineItemTax) => ({
          id: createId(),
          purchaseOrderId: saved.id,
          itemIndex: li.itemIndex,
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          unitPrice: li.unitPrice,
          taxableAmount: li.taxableAmount,
          gstRate: li.gstRate,
          gstAmount: li.totalTax,
          totalAmount: li.totalAmount,
          hsnCode: li.hsnSacCode || null,
          cgstRate: li.cgstRate,
          cgstAmount: li.cgstAmount,
          sgstRate: li.sgstRate,
          sgstAmount: li.sgstAmount,
          utgstRate: li.utgstRate,
          utgstAmount: li.utgstAmount,
          igstRate: li.igstRate,
          igstAmount: li.igstAmount,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    await auditLog(
      this.audit,
      actor,
      'purchase_order',
      saved.id,
      'po.drafted',
      null,
      {
        status: saved.status,
        totalAmount: saved.totalAmount,
        posState: pos.placeOfSupplyStateCode,
      },
    );

    return ok(saved);
  }

  async transition(
    actor: ActorContext,
    poId: string,
    toStatus: PurchaseOrderStatus,
  ): Promise<Result<PurchaseOrder, Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new ValidationError('Purchase order not found'));

    const transition = assertTransition(
      canTransitionPurchaseOrder,
      po.status,
      toStatus,
      'purchase_order',
    );
    if (!transition.ok) return transition;

    if (toStatus === 'ACCEPTED') {
      const supplierAccess = requireSupplierAccess(actor, po.supplierId);
      if (!supplierAccess.ok) return supplierAccess;
    } else {
      const access = requireOrgAccess(actor, po.organizationId, [
        'OWNER',
        'MANAGER',
      ]);
      if (!access.ok) return access;
    }

    // Completion Guard (Phase 5C.2): Verify purchase order is fully settled before transition to COMPLETED
    if (toStatus === 'COMPLETED') {
      let invoices = await this.repos.invoices.findByPurchaseOrderId(po.id);
      if (invoices.length === 0) {
        const wo = await this.repos.workOrders.findByPurchaseOrderId(po.id);
        if (wo) {
          invoices = await this.repos.invoices.findByWorkOrderId(wo.id);
        }
      }

      let payments = this.repos.payments.findByPurchaseOrderId
        ? await this.repos.payments.findByPurchaseOrderId(po.id)
        : [];
      if (payments.length === 0 && invoices.length > 0 && this.repos.payments.findByInvoiceId) {
        const payList = [];
        for (const inv of invoices) {
          const pList = await this.repos.payments.findByInvoiceId(inv.id);
          payList.push(...pList);
        }
        const seen = new Set<string>();
        payments = payList.filter((p) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      }

      let allocations = [];
      if (this.repos.paymentAllocations) {
        for (const inv of invoices) {
          const allocs = await this.repos.paymentAllocations.findByInvoiceId(inv.id);
          allocations.push(...allocs);
        }
      }

      const settlement = calculatePoSettlementSummary(po, invoices, payments, allocations);
      if (!settlement.isFullySettled) {
        return err(
          new ValidationError(
            `Purchase order cannot be marked COMPLETED until all invoices are PAID and financial obligations are settled (Invoiced: ₹${settlement.cumulativeInvoicedAmount}, Paid: ₹${settlement.cumulativePaidAmount}, Outstanding: ₹${settlement.invoicedOutstandingAmount})`,
          ),
        );
      }
    }

    const before = { status: po.status };
    const now = timestamp();
    const updated: PurchaseOrder = {
      ...po,
      status: toStatus,
      updatedAt: now,
      ...(toStatus === 'ISSUED' ? { issuedAt: now } : {}),
      ...(toStatus === 'ACCEPTED' ? { acknowledgedAt: now } : {}),
    };

    const saved = await this.repos.purchaseOrders.save(updated);

    // Phase 5C.5: Automatically snapshot platform fee policy on PO acceptance if not already snapshotted
    if (toStatus === 'ACCEPTED' && this.repos.poFeeSnapshots) {
      const existingSnap = await this.repos.poFeeSnapshots.findByPurchaseOrderId(saved.id);
      if (!existingSnap) {
        const activePolicy = this.repos.platformFeePolicies
          ? await this.repos.platformFeePolicies.findActivePolicy()
          : null;
        const rate = activePolicy?.rate ?? 0.50;
        const policyId = activePolicy?.id ?? 'pol-default-v1';
        const policyVer = activePolicy?.policyVersion ?? 1;
        const feeCalc = calculatePlatformFee({ grossAmount: saved.totalAmount, rate });

        await this.repos.poFeeSnapshots.save({
          id: createId(),
          purchaseOrderId: saved.id,
          policyId,
          policyVersion: policyVer,
          feeType: 'PERCENTAGE',
          rate,
          estimatedFeeAmount: feeCalc.feeAmount,
          isAcknowledged: true,
          acknowledgedBy: actor.profileId || null,
          acknowledgedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      } else if (!existingSnap.isAcknowledged) {
        existingSnap.isAcknowledged = true;
        existingSnap.acknowledgedBy = actor.profileId || null;
        existingSnap.acknowledgedAt = now;
        existingSnap.updatedAt = now;
        await this.repos.poFeeSnapshots.save(existingSnap);
      }
    }

    await auditLog(
      this.audit,
      actor,
      'purchase_order',
      saved.id,
      `po.${toStatus.toLowerCase()}`,
      before,
      { status: saved.status },
    );

    return ok(saved);
  }

  /**
   * Creates a formal PO Change Order / Variation request (Phase 5C.4).
   */
  async createPoChangeOrder(
    actor: ActorContext,
    poId: string,
    params: {
      title: string;
      reason: string;
      changeType?: ChangeOrderType;
      items: Array<{
        poLineItemId?: string | null;
        description: string;
        quantityDelta?: number;
        unit?: string;
        unitPrice?: number;
        amountDelta?: number;
        taxAmountDelta?: number;
        totalDelta?: number;
        hsnSacCode?: string | null;
        notes?: string | null;
      }>;
      status?: 'DRAFT' | 'SUBMITTED';
    },
  ): Promise<Result<PoChangeOrderEntity, Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError('Purchase order not found'));

    if (po.status === 'COMPLETED' || po.status === 'CANCELLED') {
      return err(
        new ValidationError(`Cannot create change order for PO in status ${po.status}`),
      );
    }

    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, po.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) {
        return err(
          new ForbiddenError('Unauthorized: Only Buyer OWNER or MANAGER can create PO change orders'),
        );
      }
    }

    const totals = calculateChangeOrderTotals(params.items);

    const existingCos = this.repos.poChangeOrders
      ? await this.repos.poChangeOrders.findByPurchaseOrderId(po.id)
      : [];

    const sequence = existingCos.length + 1;
    const poNumPrefix = po.poNumber || po.id.slice(0, 8);
    const changeOrderNumber = `CO-${poNumPrefix}-${sequence.toString().padStart(2, '0')}`;

    const now = timestamp();
    const changeOrderId = createId();

    const lineItems: PoChangeOrderItemEntity[] = params.items.map((item, idx) => {
      const itemAmountDelta =
        item.amountDelta !== undefined
          ? item.amountDelta
          : (item.quantityDelta ?? 0) * (item.unitPrice ?? 0);
      const itemTaxAmountDelta = item.taxAmountDelta ?? 0;
      const itemTotalDelta =
        item.totalDelta !== undefined
          ? item.totalDelta
          : itemAmountDelta + itemTaxAmountDelta;

      return {
        id: createId(),
        changeOrderId,
        poLineItemId: item.poLineItemId || null,
        itemIndex: idx + 1,
        description: item.description,
        hsnSacCode: item.hsnSacCode || null,
        quantityDelta: item.quantityDelta ?? 0,
        unit: item.unit || 'lot',
        unitPrice: item.unitPrice ?? 0,
        amountDelta: Math.round(itemAmountDelta * 100) / 100,
        taxAmountDelta: Math.round(itemTaxAmountDelta * 100) / 100,
        totalDelta: Math.round(itemTotalDelta * 100) / 100,
        notes: item.notes || null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const changeOrder: PoChangeOrderEntity = {
      id: changeOrderId,
      organizationId: po.organizationId,
      purchaseOrderId: po.id,
      changeOrderNumber,
      sequence,
      title: params.title,
      reason: params.reason,
      status: params.status || 'DRAFT',
      changeType: params.changeType || 'SCOPE_EXPANSION',
      netAmountDelta: totals.netAmountDelta,
      taxAmountDelta: totals.taxAmountDelta,
      totalDelta: totals.totalDelta,
      previousPoTotal: po.totalAmount,
      revisedPoTotal: Math.round((po.totalAmount + totals.totalDelta) * 100) / 100,
      requestedBy: actor.profileId || 'system',
      requestedAt: now,
      items: lineItems,
      createdAt: now,
      updatedAt: now,
    };

    if (this.repos.poChangeOrders) {
      await this.repos.poChangeOrders.save(changeOrder);
    }
    if (this.repos.poChangeOrderItems) {
      await this.repos.poChangeOrderItems.saveMany(lineItems);
    }

    await auditLog(
      this.audit,
      actor,
      'PO_CHANGE_ORDER_CREATED',
      'PO_CHANGE_ORDER',
      changeOrder.id,
      {
        purchaseOrderId: po.id,
        changeOrderNumber,
        totalDelta: totals.totalDelta,
        status: changeOrder.status,
      },
    );

    return ok(changeOrder);
  }

  /**
   * Approves a submitted PO Change Order (Phase 5C.4).
   * Suppliers cannot approve change orders (RED-01).
   */
  async approvePoChangeOrder(
    actor: ActorContext,
    changeOrderId: string,
  ): Promise<Result<PoChangeOrderEntity, Error>> {
    if (!this.repos.poChangeOrders) {
      return err(new NotFoundError('PO change orders repository not found'));
    }

    const co = await this.repos.poChangeOrders.findById(changeOrderId);
    if (!co) return err(new NotFoundError('Change order not found'));

    // RED-01: Supplier cannot approve change orders
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, co.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) {
        return err(
          new ForbiddenError('Unauthorized: Only Buyer OWNER or MANAGER can approve PO change orders (RED-01/CO-5C4-UNAUTHORIZED)'),
        );
      }
    }

    if (!canTransitionChangeOrder(co.status, 'APPROVED')) {
      return err(
        new ValidationError(`Cannot approve change order from current status ${co.status}`),
      );
    }

    co.status = 'APPROVED';
    co.approvedBy = actor.profileId || null;
    co.approvedAt = timestamp();
    co.updatedAt = timestamp();

    await this.repos.poChangeOrders.save(co);

    await auditLog(
      this.audit,
      actor,
      'PO_CHANGE_ORDER_APPROVED',
      'PO_CHANGE_ORDER',
      co.id,
      {
        purchaseOrderId: co.purchaseOrderId,
        changeOrderNumber: co.changeOrderNumber,
      },
    );

    return ok(co);
  }

  /**
   * Commits an approved PO Change Order atomically into the active PO commitment (Phase 5C.4).
   * Enforces negative change order guard (RED-02) and synchronization (RED-13).
   */
  async commitPoChangeOrder(
    actor: ActorContext,
    changeOrderId: string,
  ): Promise<Result<{ changeOrder: PoChangeOrderEntity; purchaseOrder: PurchaseOrder }, Error>> {
    if (!this.repos.poChangeOrders) {
      return err(new NotFoundError('PO change orders repository not found'));
    }

    const co = await this.repos.poChangeOrders.findById(changeOrderId);
    if (!co) return err(new NotFoundError('Change order not found'));

    // RED-01: Supplier cannot commit change orders
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, co.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) {
        return err(
          new ForbiddenError('Unauthorized: Only Buyer OWNER or MANAGER can commit PO change orders (RED-01/CO-5C4-UNAUTHORIZED)'),
        );
      }
    }

    // RED-14: Committed change order cannot be re-committed or mutated
    if (co.status === 'COMMITTED') {
      return err(
        new ValidationError('Change order is already COMMITTED (RED-14/CO-5C4-ALREADY-COMMITTED)'),
      );
    }

    if (!canTransitionChangeOrder(co.status, 'COMMITTED')) {
      return err(
        new ValidationError(`Cannot commit change order from current status ${co.status}`),
      );
    }

    const po = await this.repos.purchaseOrders.findById(co.purchaseOrderId);
    if (!po) return err(new NotFoundError('Purchase order not found'));

    if (po.status === 'COMPLETED' || po.status === 'CANCELLED') {
      return err(
        new ValidationError(`Cannot commit change order against PO in status ${po.status}`),
      );
    }

    // 1. Fetch existing committed change orders on this PO (excluding this one)
    const allCos = await this.repos.poChangeOrders.findByPurchaseOrderId(po.id);
    const existingCommitted = allCos.filter(
      (c) => c.status === 'COMMITTED' && c.id !== co.id,
    );

    // 2. Fetch active invoiced amount on this PO
    const invoices = this.repos.invoices.findByPurchaseOrderId
      ? await this.repos.invoices.findByPurchaseOrderId(po.id)
      : [];
    const activeInvoiced = invoices
      .filter((i) => (i.status as string) !== 'REJECTED' && (i.status as string) !== 'CANCELLED')
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);

    // 3. Validate commitment and negative change order floor (RED-02)
    // Note: po.totalAmount in our repo store may already include previous committed change orders.
    // calculateAuthorizedPoCommitment uses original + sum(committed).
    // If po was initially created at original amount, previous total is po.totalAmount.
    const validation = validateChangeOrderCommitment({
      originalPoTotal: po.totalAmount,
      existingCommittedChangeOrders: existingCommitted,
      changeOrderToCommit: { totalDelta: co.totalDelta },
      cumulativeInvoicedAmount: activeInvoiced,
    });

    if (!validation.isValid) {
      return err(
        new ValidationError(
          validation.error || 'Negative change order rejection: Revised PO commitment cannot be less than cumulative invoiced amount (RED-02/REV-5C4-CO-BELOW-INVOICED)',
        ),
      );
    }

    const now = timestamp();
    co.previousPoTotal = po.totalAmount;
    co.revisedPoTotal = validation.revisedAuthorizedTotal;
    co.status = 'COMMITTED';
    co.committedBy = actor.profileId || null;
    co.committedAt = now;
    co.updatedAt = now;

    await this.repos.poChangeOrders.save(co);

    // RED-13: Synchronize PO commitment ceiling
    po.totalAmount = validation.revisedAuthorizedTotal;
    po.updatedAt = now;
    await this.repos.purchaseOrders.save(po);

    await auditLog(
      this.audit,
      actor,
      'PO_CHANGE_ORDER_COMMITTED',
      'PO_CHANGE_ORDER',
      co.id,
      {
        purchaseOrderId: po.id,
        changeOrderNumber: co.changeOrderNumber,
        previousPoTotal: co.previousPoTotal,
        revisedPoTotal: co.revisedPoTotal,
        totalDelta: co.totalDelta,
        cumulativeInvoiced: activeInvoiced,
      },
    );

    return ok({ changeOrder: co, purchaseOrder: po });
  }

  /**
   * Rejects a PO Change Order (Phase 5C.4).
   */
  async rejectPoChangeOrder(
    actor: ActorContext,
    changeOrderId: string,
    reason?: string,
  ): Promise<Result<PoChangeOrderEntity, Error>> {
    if (!this.repos.poChangeOrders) {
      return err(new NotFoundError('PO change orders repository not found'));
    }

    const co = await this.repos.poChangeOrders.findById(changeOrderId);
    if (!co) return err(new NotFoundError('Change order not found'));

    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, co.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;
    }

    if (!canTransitionChangeOrder(co.status, 'REJECTED')) {
      return err(
        new ValidationError(`Cannot reject change order from current status ${co.status}`),
      );
    }

    co.status = 'REJECTED';
    co.rejectionReason = reason || null;
    co.updatedAt = timestamp();

    await this.repos.poChangeOrders.save(co);

    await auditLog(
      this.audit,
      actor,
      'PO_CHANGE_ORDER_REJECTED',
      'PO_CHANGE_ORDER',
      co.id,
      {
        reason,
        changeOrderNumber: co.changeOrderNumber,
      },
    );

    return ok(co);
  }

  /**
   * Lists all change orders for a PO.
   */
  async getPoChangeOrders(
    actor: ActorContext,
    poId: string,
  ): Promise<Result<PoChangeOrderEntity[], Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError('Purchase order not found'));

    if (!actor.isPlatformAdmin) {
      const isBuyer = actor.organizationId === po.organizationId;
      const isSupplier = actor.supplierIds?.includes(po.supplierId);
      if (!isBuyer && !isSupplier) {
        return err(new ForbiddenError('Unauthorized: Access denied to PO change orders'));
      }
    }

    const cos = this.repos.poChangeOrders
      ? await this.repos.poChangeOrders.findByPurchaseOrderId(poId)
      : [];

    return ok(cos);
  }

  /**
   * Supplier acknowledges platform fee snapshot on PO acceptance (Phase 5C.5).
   */
  async acknowledgePoPlatformFee(
    actor: ActorContext,
    poId: string,
    policyId?: string,
  ): Promise<Result<PoFeeSnapshotEntity, Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError('Purchase order not found'));

    if (!actor.isPlatformAdmin) {
      const supAccess = requireSupplierAccess(actor, po.supplierId);
      if (!supAccess.ok) return supAccess;
    }

    if (po.status !== 'ISSUED' && po.status !== 'ACCEPTED') {
      return err(
        new ValidationError(`Cannot acknowledge fee for PO in status ${po.status}`),
      );
    }

    if (!this.repos.poFeeSnapshots) {
      return err(new Error('PO fee snapshots repository not available'));
    }

    const existingSnap = await this.repos.poFeeSnapshots.findByPurchaseOrderId(poId);
    if (existingSnap && existingSnap.isAcknowledged) {
      return ok(existingSnap);
    }

    let policy: PlatformFeePolicyEntity | null = null;
    if (policyId && this.repos.platformFeePolicies) {
      policy = await this.repos.platformFeePolicies.findById(policyId);
    } else if (this.repos.platformFeePolicies) {
      policy = await this.repos.platformFeePolicies.findActivePolicy();
    }

    const rate = policy?.rate ?? 0.50;
    const resolvedPolicyId = policy?.id ?? 'pol-default-v1';
    const policyVersion = policy?.policyVersion ?? 1;
    const feeType = policy?.feeType ?? 'PERCENTAGE';
    const feeCalc = calculatePlatformFee({ grossAmount: po.totalAmount, rate });

    const now = timestamp();
    const snapshot: PoFeeSnapshotEntity = {
      id: existingSnap?.id || createId(),
      purchaseOrderId: po.id,
      policyId: resolvedPolicyId,
      policyVersion,
      feeType,
      rate,
      estimatedFeeAmount: feeCalc.feeAmount,
      isAcknowledged: true,
      acknowledgedBy: actor.profileId || null,
      acknowledgedAt: now,
      createdAt: existingSnap?.createdAt || now,
      updatedAt: now,
    };

    const saved = await this.repos.poFeeSnapshots.save(snapshot);

    await auditLog(
      this.audit,
      actor,
      'PO_PLATFORM_FEE_ACKNOWLEDGED',
      'PO_FEE_SNAPSHOT',
      saved.id,
      {
        purchaseOrderId: po.id,
        rate,
        policyVersion,
        estimatedFeeAmount: feeCalc.feeAmount,
      },
    );

    return ok(saved);
  }

  /**
   * Retrieves PO Platform Fee Snapshot.
   */
  async getPoFeeSnapshot(
    actor: ActorContext,
    poId: string,
  ): Promise<Result<PoFeeSnapshotEntity | null, Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError('Purchase order not found'));

    if (!actor.isPlatformAdmin) {
      const isBuyer = actor.organizationId === po.organizationId;
      const isSupplier = actor.supplierIds?.includes(po.supplierId);
      if (!isBuyer && !isSupplier) {
        return err(new ForbiddenError('Unauthorized: Access denied to PO fee snapshot'));
      }
    }

    if (!this.repos.poFeeSnapshots) {
      return ok(null);
    }

    const snapshot = await this.repos.poFeeSnapshots.findByPurchaseOrderId(poId);
    return ok(snapshot);
  }

  /**
   * Creates or updates a global Platform Fee Policy (Platform Admin only).
   */
  async createPlatformFeePolicy(
    actor: ActorContext,
    params: {
      rate: number;
      feeType?: 'PERCENTAGE' | 'FLAT' | 'TIERED';
      minFeeAmount?: number | null;
      maxFeeAmount?: number | null;
      description?: string | null;
    },
  ): Promise<Result<PlatformFeePolicyEntity, Error>> {
    if (!actor.isPlatformAdmin) {
      return err(new ForbiddenError('Unauthorized: Only Platform Admin can manage fee policies'));
    }

    if (params.rate < 0 || params.rate > 100) {
      return err(new ValidationError('Platform fee rate must be between 0% and 100%'));
    }

    if (!this.repos.platformFeePolicies) {
      return err(new Error('Platform fee policy repository not available'));
    }

    const all = await this.repos.platformFeePolicies.findAll();
    const maxVer = all.reduce((max, p) => Math.max(max, p.policyVersion), 0);
    const newVersion = maxVer + 1;

    const now = timestamp();
    // Supersede older active policies
    for (const p of all) {
      if (p.status === 'ACTIVE') {
        p.status = 'SUPERSEDED';
        p.effectiveTo = now;
        p.updatedAt = now;
        await this.repos.platformFeePolicies.save(p);
      }
    }

    const newPolicy: PlatformFeePolicyEntity = {
      id: createId(),
      policyVersion: newVersion,
      feeType: params.feeType || 'PERCENTAGE',
      rate: params.rate,
      minFeeAmount: params.minFeeAmount ?? null,
      maxFeeAmount: params.maxFeeAmount ?? null,
      effectiveFrom: now,
      effectiveTo: null,
      status: 'ACTIVE',
      description: params.description ?? `Platform fee policy version ${newVersion}`,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repos.platformFeePolicies.save(newPolicy);
    await auditLog(
      this.audit,
      actor,
      'PLATFORM_FEE_POLICY_CREATED',
      'PLATFORM_FEE_POLICY',
      saved.id,
      {
        policyVersion: newVersion,
        rate: params.rate,
      },
    );

    return ok(saved);
  }
}

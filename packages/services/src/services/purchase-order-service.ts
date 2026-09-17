import {
  buildTaxSnapshot,
  calculateOrderTaxBreakdown,
  calculatePoSettlementSummary,
  type CalculatedLineItemTax,
  canTransitionPurchaseOrder,
  determinePlaceOfSupply,
  type PurchaseOrderStatus,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { PurchaseOrder } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
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
}

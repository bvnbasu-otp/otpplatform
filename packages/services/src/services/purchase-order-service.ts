import {
  canTransitionPurchaseOrder,
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
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repos.purchaseOrders.save(po);

    // Auto-generate normalized line items if repo is available
    if (this.repos.poLineItems) {
      const base = Math.round((saved.totalAmount / 1.18) * 100) / 100;
      const item1 = Math.round(base * 0.50 * 100) / 100;
      const item2 = Math.round(base * 0.30 * 100) / 100;
      const item3 = Math.round((base - (item1 + item2)) * 100) / 100;

      await this.repos.poLineItems.saveMany([
        {
          id: createId(),
          purchaseOrderId: saved.id,
          itemIndex: 1,
          description: `Primary Contract Scope / Core Deliverables (${saved.poNumber})`,
          quantity: 1,
          unit: 'lot',
          unitPrice: item1,
          taxableAmount: item1,
          gstRate: 18.0,
          gstAmount: Math.round(item1 * 0.18 * 100) / 100,
          totalAmount: Math.round(item1 * 1.18 * 100) / 100,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: createId(),
          purchaseOrderId: saved.id,
          itemIndex: 2,
          description: 'Execution, Labor, Testing & Site Staging',
          quantity: 1,
          unit: 'lot',
          unitPrice: item2,
          taxableAmount: item2,
          gstRate: 18.0,
          gstAmount: Math.round(item2 * 0.18 * 100) / 100,
          totalAmount: Math.round(item2 * 1.18 * 100) / 100,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: createId(),
          purchaseOrderId: saved.id,
          itemIndex: 3,
          description: 'QA Inspection Sign-off & Warranty Activation',
          quantity: 1,
          unit: 'lot',
          unitPrice: item3,
          taxableAmount: item3,
          gstRate: 18.0,
          gstAmount: Math.round(item3 * 0.18 * 100) / 100,
          totalAmount: Math.round(item3 * 1.18 * 100) / 100,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }

    await auditLog(
      this.audit,
      actor,
      'purchase_order',
      saved.id,
      'po.drafted',
      null,
      { status: saved.status, totalAmount: saved.totalAmount },
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

import {
  buildTaxSnapshot,
  calculateOrderTaxBreakdown,
  calculateRemainingInvoiceableAmount,
  type CalculatedLineItemTax,
  determinePlaceOfSupply,
  validateInvoiceAmountAgainstPo,
  type InvoiceStatus,
  type InvoiceType,
  checkSupplierExecutionGate,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type {
  Invoice,
  InvoiceLineItemEntity,
} from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireBuyerResourceAccess, requireOrgAccess, requireSupplierAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface SubmitInvoiceLineItemInput {
  poLineItemId?: string | null;
  milestoneId?: string | null;
  lineIndex: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  hsnCode?: string | null;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  utgstRate?: number;
  utgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
}

export interface SubmitProgressiveInvoiceInput {
  workOrderId: string;
  milestoneId?: string | null;
  invoiceNumber: string;
  invoiceType?: InvoiceType;
  amount: number;
  currency?: string;
  lineItems?: SubmitInvoiceLineItemInput[];
}

export class InvoiceService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  /**
   * Submit an invoice with statutory GST tax splitting, progressive milestone checks, and frozen tax snapshot.
   */
  async submit(
    actor: ActorContext,
    workOrderId: string,
    invoiceNumber: string,
    amount: number,
    currency = 'INR',
    milestoneId?: string | null,
    invoiceType: InvoiceType = 'PROGRESSIVE',
    lineItems?: SubmitInvoiceLineItemInput[],
  ): Promise<Result<Invoice, Error>> {
    const wo = await this.repos.workOrders.findById(workOrderId);
    if (!wo) return err(new ValidationError('Work order not found'));

    const supplierAccess = requireSupplierAccess(actor, wo.supplierId);
    if (!supplierAccess.ok) return supplierAccess;

    const supplier = await this.repos.suppliers.findById(wo.supplierId);
    if (supplier) {
      const gate = checkSupplierExecutionGate({
        id: supplier.id,
        lifecycleState:
          (supplier.lifecycleState as SupplierLifecycleState) ||
          SupplierLifecycleState.VERIFIED,
        verificationStatus:
          (supplier.verificationStatus as TruthfulVerificationStatus) ||
          TruthfulVerificationStatus.VERIFIED,
      });
      if (!gate.allowed) {
        return err(
          new ValidationError(
            gate.error ||
              'Supplier must complete onboarding and verification before submitting invoices',
          ),
        );
      }
    }

    if (amount <= 0) return err(new ValidationError('Invoice amount must be positive'));

    const po = await this.repos.purchaseOrders.findById(wo.purchaseOrderId);
    if (!po) return err(new ValidationError('Purchase order not found'));

    // 1. Over-invoicing invariant check against PO total
    const existingInvoices = await this.repos.invoices.findByWorkOrderId(workOrderId);
    const poCheck = validateInvoiceAmountAgainstPo(po.totalAmount, existingInvoices, amount);
    if (!poCheck.valid) {
      return err(new ValidationError(poCheck.error || 'Invoice amount exceeds PO authorized limit'));
    }

    // 2. If milestone specified, validate milestone allocation limits
    if (milestoneId && this.repos.workOrderMilestones) {
      const milestone = await this.repos.workOrderMilestones.findById(milestoneId);
      if (!milestone) {
        return err(new ValidationError('Specified milestone not found'));
      }
      if (milestone.allocatedAmount > 0) {
        const milestoneInvoices = existingInvoices.filter(
          (inv) => inv.milestoneId === milestoneId && inv.status !== 'REJECTED',
        );
        const alreadyMilestoneInvoiced = milestoneInvoices.reduce(
          (sum, inv) => sum + Number(inv.amount || 0),
          0,
        );
        if (alreadyMilestoneInvoiced + amount > milestone.allocatedAmount + 0.05) {
          return err(
            new ValidationError(
              `Invoice amount ₹${amount} exceeds milestone allocated limit of ₹${milestone.allocatedAmount} (already invoiced ₹${alreadyMilestoneInvoiced})`,
            ),
          );
        }
      }
    }

    const now = timestamp();
    const invoiceId = createId();

    // 3. Determine Statutory Place of Supply & Tax Breakdown
    const pos = determinePlaceOfSupply({
      supplierStateCode: '29',
      recipientStateCode: po.placeOfSupplyStateCode || '29',
      supplyType: 'PRODUCT_GOODS',
    });

    const baseTaxable = Math.round((amount / 1.18) * 100) / 100;
    const rawItems = lineItems && lineItems.length > 0
      ? lineItems.map((li) => ({
          itemIndex: li.lineIndex,
          description: li.description,
          hsnSacCode: li.hsnCode || '995411',
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          gstRate: 18.0,
        }))
      : [
          {
            itemIndex: 1,
            description: `Progressive Milestone Deliverables (${invoiceType})`,
            hsnSacCode: '995411',
            quantity: 1,
            unitPrice: baseTaxable,
            gstRate: 18.0,
          },
        ];

    const taxBreakdown = calculateOrderTaxBreakdown(rawItems, pos);

    const taxSnapshot = buildTaxSnapshot({
      supplierStateCode: '29',
      buyerStateCode: po.placeOfSupplyStateCode || '29',
      supplyType: 'PRODUCT_GOODS',
      pos,
      taxBreakdown,
      capturedAt: now,
    });

    const invoice: Invoice = {
      id: invoiceId,
      purchaseOrderId: po.id,
      workOrderId,
      milestoneId: milestoneId || null,
      supplierId: wo.supplierId,
      invoiceNumber,
      invoiceType,
      amount,
      currency,
      status: 'SUBMITTED',
      submittedAt: now,
      placeOfSupplyStateCode: pos.placeOfSupplyStateCode,
      placeOfSupplyBasis: pos.placeOfSupplyBasis,
      taxableTotal: taxBreakdown.taxableTotal,
      cgstTotal: taxBreakdown.cgstTotal,
      sgstTotal: taxBreakdown.sgstTotal,
      utgstTotal: taxBreakdown.utgstTotal,
      igstTotal: taxBreakdown.igstTotal,
      taxSnapshot: taxSnapshot as unknown as Record<string, unknown>,
    };

    const saved = await this.repos.invoices.save(invoice);

    // 4. Save normalized line items with statutory GST splitting
    if (this.repos.invoiceLineItems) {
      const lineEntities: InvoiceLineItemEntity[] = taxBreakdown.lineItems.map((li: CalculatedLineItemTax) => ({
        id: createId(),
        invoiceId: saved.id,
        poLineItemId: null,
        milestoneId: milestoneId || null,
        lineIndex: li.itemIndex,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        taxableAmount: li.taxableAmount,
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
      }));
      await this.repos.invoiceLineItems.saveMany(lineEntities);
    }

    // 5. Update milestone status and invoicedAmount if linked
    if (milestoneId && this.repos.workOrderMilestones) {
      const milestone = await this.repos.workOrderMilestones.findById(milestoneId);
      if (milestone) {
        const newInvoiced = (milestone.invoicedAmount || 0) + amount;
        await this.repos.workOrderMilestones.save({
          ...milestone,
          invoicedAmount: newInvoiced,
          isInvoiced: newInvoiced >= Math.max(milestone.allocatedAmount, 1),
          updatedAt: now,
        });
      }
    }

    await auditLog(
      this.audit,
      actor,
      'invoice',
      saved.id,
      'invoice.submitted',
      null,
      {
        status: saved.status,
        amount: saved.amount,
        milestoneId: saved.milestoneId,
        invoiceType: saved.invoiceType,
        purchaseOrderId: saved.purchaseOrderId,
        posState: pos.placeOfSupplyStateCode,
      },
    );

    return ok(saved);
  }

  /**
   * Get progressive invoicing summary for a Purchase Order
   */
  async getPoInvoicingSummary(
    poId: string,
  ): Promise<Result<ReturnType<typeof calculateRemainingInvoiceableAmount>, Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new ValidationError('Purchase order not found'));

    const invoices = await this.repos.invoices.findByPurchaseOrderId(poId);
    const summary = calculateRemainingInvoiceableAmount(po.totalAmount, invoices);
    return ok(summary);
  }

  async approve(
    actor: ActorContext,
    invoiceId: string,
  ): Promise<Result<Invoice, Error>> {
    return this.transitionInvoice(actor, invoiceId, 'APPROVED');
  }

  async reject(
    actor: ActorContext,
    invoiceId: string,
  ): Promise<Result<Invoice, Error>> {
    return this.transitionInvoice(actor, invoiceId, 'REJECTED');
  }

  private async transitionInvoice(
    actor: ActorContext,
    invoiceId: string,
    toStatus: InvoiceStatus,
  ): Promise<Result<Invoice, Error>> {
    const invoice = await this.repos.invoices.findById(invoiceId);
    if (!invoice) return err(new ValidationError('Invoice not found'));

    const wo = await this.repos.workOrders.findById(invoice.workOrderId);
    if (!wo) return err(new ValidationError('Work order not found'));

    const po = await this.repos.purchaseOrders.findById(wo.purchaseOrderId);
    if (!po) return err(new ValidationError('Purchase order not found'));

    const access = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, [
      'OWNER',
      'MANAGER',
      'APPROVER',
      'BUYER',
    ]);
    if (!access.ok) return access;

    if (invoice.status !== 'SUBMITTED' && toStatus === 'APPROVED') {
      return err(new ValidationError('Only submitted invoices can be approved'));
    }
    if (invoice.status !== 'SUBMITTED' && toStatus === 'REJECTED') {
      return err(new ValidationError('Only submitted invoices can be rejected'));
    }

    const updated: Invoice = { ...invoice, status: toStatus };
    const saved = await this.repos.invoices.save(updated);

    await auditLog(
      this.audit,
      actor,
      'invoice',
      saved.id,
      `invoice.${toStatus.toLowerCase()}`,
      { status: invoice.status },
      { status: saved.status },
    );

    return ok(saved);
  }
}

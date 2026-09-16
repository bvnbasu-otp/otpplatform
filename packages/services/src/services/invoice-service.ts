import {
  calculateRemainingInvoiceableAmount,
  validateInvoiceAmountAgainstPo,
  type InvoiceStatus,
  type InvoiceType,
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
import { auditLog, requireOrgAccess, requireSupplierAccess } from './service-helpers';
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
   * Submit an invoice (supports progressive milestones, PO line item links, and over-invoicing checks).
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
    };

    const saved = await this.repos.invoices.save(invoice);

    // 3. Save line items if provided
    if (lineItems && lineItems.length > 0 && this.repos.invoiceLineItems) {
      const lineEntities: InvoiceLineItemEntity[] = lineItems.map((li) => ({
        id: createId(),
        invoiceId: saved.id,
        poLineItemId: li.poLineItemId || null,
        milestoneId: li.milestoneId || milestoneId || null,
        lineIndex: li.lineIndex,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        taxableAmount: li.taxableAmount,
        gstAmount: li.gstAmount,
        totalAmount: li.totalAmount,
        createdAt: now,
        updatedAt: now,
      }));
      await this.repos.invoiceLineItems.saveMany(lineEntities);
    }

    // 4. Update milestone status and invoicedAmount if linked
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

    const access = requireOrgAccess(actor, po.organizationId, [
      'OWNER',
      'MANAGER',
      'APPROVER',
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

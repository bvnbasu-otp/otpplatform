import type { InvoiceStatus } from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { Invoice } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireOrgAccess, requireSupplierAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export class InvoiceService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  async submit(
    actor: ActorContext,
    workOrderId: string,
    invoiceNumber: string,
    amount: number,
    currency = 'INR',
  ): Promise<Result<Invoice, Error>> {
    const wo = await this.repos.workOrders.findById(workOrderId);
    if (!wo) return err(new ValidationError('Work order not found'));

    const supplierAccess = requireSupplierAccess(actor, wo.supplierId);
    if (!supplierAccess.ok) return supplierAccess;

    if (amount <= 0) return err(new ValidationError('Invoice amount must be positive'));

    const now = timestamp();
    const invoice: Invoice = {
      id: createId(),
      workOrderId,
      supplierId: wo.supplierId,
      invoiceNumber,
      amount,
      currency,
      status: 'SUBMITTED',
      submittedAt: now,
    };

    const saved = await this.repos.invoices.save(invoice);
    await auditLog(
      this.audit,
      actor,
      'invoice',
      saved.id,
      'invoice.submitted',
      null,
      { status: saved.status, amount: saved.amount },
    );

    return ok(saved);
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

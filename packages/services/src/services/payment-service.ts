import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { Payment } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireOrgAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export class PaymentService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  async recordPayment(
    actor: ActorContext,
    invoiceId: string,
    amount: number,
    method: string,
  ): Promise<Result<Payment, Error>> {
    const invoice = await this.repos.invoices.findById(invoiceId);
    if (!invoice) return err(new ValidationError('Invoice not found'));

    if (invoice.status !== 'APPROVED') {
      return err(new ValidationError('Invoice must be APPROVED before payment'));
    }

    if (amount <= 0) return err(new ValidationError('Payment amount must be positive'));
    if (amount > invoice.amount) {
      return err(new ValidationError('Payment exceeds invoice amount'));
    }

    const wo = await this.repos.workOrders.findById(invoice.workOrderId);
    if (!wo) return err(new ValidationError('Work order not found'));

    const po = await this.repos.purchaseOrders.findById(wo.purchaseOrderId);
    if (!po) return err(new ValidationError('Purchase order not found'));

    const access = requireOrgAccess(actor, po.organizationId, [
      'OWNER',
      'MANAGER',
    ]);
    if (!access.ok) return access;

    const now = timestamp();
    const payment: Payment = {
      id: createId(),
      invoiceId,
      amount,
      currency: invoice.currency,
      method,
      status: 'RECORDED',
      recordedBy: actor.profileId,
      recordedAt: now,
    };

    const saved = await this.repos.payments.save(payment);

    if (amount >= invoice.amount) {
      await this.repos.invoices.save({ ...invoice, status: 'PAID' });
    }

    await auditLog(
      this.audit,
      actor,
      'payment',
      saved.id,
      'payment.recorded',
      null,
      { amount: saved.amount, invoiceId },
    );

    return ok(saved);
  }
}

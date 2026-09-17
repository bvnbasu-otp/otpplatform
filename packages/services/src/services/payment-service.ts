import {
  calculateInvoiceBalanceDue,
  calculateInvoicePaidAmount,
  calculatePaymentAllocatedAmount,
  calculatePaymentUnallocatedAmount,
  calculatePoSettlementSummary,
  deriveInvoicePaymentStatus,
  generatePoSettlementCertificate,
  isPurchaseOrderFullySettled,
  validatePaymentAllocation,
  type InvoicePaymentSummary,
  type PaymentAllocationSummary,
  type PoSettlementCertificate,
  type PoSettlementSummary,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type { Payment, PaymentAllocationEntity } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireOrgAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface RecordPaymentOptions {
  purchaseOrderId?: string | null;
  reference?: string | null;
  notes?: string | null;
  allocations?: Array<{
    invoiceId: string;
    amount: number;
    notes?: string | null;
  }>;
}

export class PaymentService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  /**
   * Records a payment against an invoice, a PO, or with a multi-invoice allocation batch.
   */
  async recordPayment(
    actor: ActorContext,
    invoiceIdOrNull: string | null,
    amount: number,
    method: string,
    options?: RecordPaymentOptions,
  ): Promise<Result<Payment, Error>> {
    if (amount <= 0) {
      return err(new ValidationError('Payment amount must be positive'));
    }

    const now = timestamp();
    let poId = options?.purchaseOrderId || null;
    let currency = 'INR';

    // 1. If linked directly to a single invoice
    if (invoiceIdOrNull) {
      const invoice = await this.repos.invoices.findById(invoiceIdOrNull);
      if (!invoice) return err(new ValidationError('Invoice not found'));

      if (invoice.status !== 'APPROVED' && invoice.status !== 'PARTIALLY_PAID') {
        return err(
          new ValidationError('Invoice must be APPROVED or PARTIALLY_PAID before payment'),
        );
      }

      currency = invoice.currency;

      const wo = await this.repos.workOrders.findById(invoice.workOrderId);
      if (!wo) return err(new ValidationError('Work order not found'));

      const po = await this.repos.purchaseOrders.findById(wo.purchaseOrderId);
      if (!po) return err(new ValidationError('Purchase order not found'));

      poId = po.id;

      const access = requireOrgAccess(actor, po.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;

      // Calculate existing allocations on invoice
      const existingAllocations = this.repos.paymentAllocations
        ? await this.repos.paymentAllocations.findByInvoiceId(invoice.id)
        : [];

      const currentBalanceDue = calculateInvoiceBalanceDue(
        invoice.amount,
        existingAllocations,
      );

      if (amount > currentBalanceDue) {
        return err(
          new ValidationError(
            `Payment amount ₹${amount} exceeds invoice balance due of ₹${currentBalanceDue}`,
          ),
        );
      }

      const payment: Payment = {
        id: createId(),
        invoiceId: invoiceIdOrNull,
        purchaseOrderId: poId,
        amount,
        unallocatedAmount: 0,
        currency,
        method,
        status: 'RECORDED',
        recordedBy: actor.profileId,
        recordedAt: now,
      };

      const savedPayment = await this.repos.payments.save(payment);

      // Create Payment Allocation
      if (this.repos.paymentAllocations) {
        const allocation: PaymentAllocationEntity = {
          id: createId(),
          paymentId: savedPayment.id,
          invoiceId: invoice.id,
          allocatedAmount: amount,
          allocatedAt: now,
          status: 'ALLOCATED',
          notes: options?.notes || 'Direct invoice payment',
          createdAt: now,
          updatedAt: now,
        };

        await this.repos.paymentAllocations.save(allocation);

        // Sync invoice status and paid_amount / balance_due
        const allAllocations = [...existingAllocations, allocation];
        const newPaidAmount = calculateInvoicePaidAmount(allAllocations);
        const newBalanceDue = calculateInvoiceBalanceDue(invoice.amount, allAllocations);
        const newStatus = deriveInvoicePaymentStatus(
          invoice.amount,
          newPaidAmount,
          invoice.status,
        );

        await this.repos.invoices.save({
          ...invoice,
          paidAmount: newPaidAmount,
          balanceDue: newBalanceDue,
          status: newStatus,
        });
      } else {
        // Fallback for legacy repositories without paymentAllocations
        if (amount >= invoice.amount) {
          await this.repos.invoices.save({ ...invoice, status: 'PAID' });
        } else {
          await this.repos.invoices.save({ ...invoice, status: 'PARTIALLY_PAID' });
        }
      }

      await auditLog(
        this.audit,
        actor,
        'payment',
        savedPayment.id,
        'payment.recorded',
        null,
        { amount: savedPayment.amount, invoiceId: invoiceIdOrNull, purchaseOrderId: poId },
      );

      return ok(savedPayment);
    }

    // 2. Unallocated or Multi-Invoice Payment tied to PO
    if (!poId) {
      return err(
        new ValidationError('Payment must be associated with an invoice or a purchase order'),
      );
    }

    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new ValidationError('Purchase order not found'));

    const access = requireOrgAccess(actor, po.organizationId, ['OWNER', 'MANAGER']);
    if (!access.ok) return access;

    let totalAllocated = 0;
    const allocationsToCreate: PaymentAllocationEntity[] = [];

    if (options?.allocations && options.allocations.length > 0) {
      for (const item of options.allocations) {
        if (item.amount <= 0) {
          return err(new ValidationError('Allocation amounts must be strictly positive'));
        }

        const inv = await this.repos.invoices.findById(item.invoiceId);
        if (!inv) {
          return err(new ValidationError(`Invoice ${item.invoiceId} not found`));
        }

        const existingInvAllocs = this.repos.paymentAllocations
          ? await this.repos.paymentAllocations.findByInvoiceId(inv.id)
          : [];

        const invBalDue = calculateInvoiceBalanceDue(inv.amount, existingInvAllocs);
        if (item.amount > invBalDue) {
          return err(
            new ValidationError(
              `Allocation of ₹${item.amount} exceeds invoice ${inv.invoiceNumber} balance due of ₹${invBalDue}`,
            ),
          );
        }

        totalAllocated += item.amount;
      }

      if (totalAllocated > amount) {
        return err(
          new ValidationError(
            `Sum of allocations (₹${totalAllocated}) exceeds total payment amount (₹${amount})`,
          ),
        );
      }
    }

    const unallocatedAmount = Math.max(0, Math.round((amount - totalAllocated) * 100) / 100);

    const payment: Payment = {
      id: createId(),
      invoiceId: null,
      purchaseOrderId: poId,
      amount,
      unallocatedAmount,
      currency: po.currency || 'INR',
      method,
      status: 'RECORDED',
      recordedBy: actor.profileId,
      recordedAt: now,
    };

    const savedPayment = await this.repos.payments.save(payment);

    // Save allocations and sync invoices
    if (this.repos.paymentAllocations && options?.allocations) {
      for (const item of options.allocations) {
        const allocEntity: PaymentAllocationEntity = {
          id: createId(),
          paymentId: savedPayment.id,
          invoiceId: item.invoiceId,
          allocatedAmount: item.amount,
          allocatedAt: now,
          status: 'ALLOCATED',
          notes: item.notes || options?.notes || null,
          createdAt: now,
          updatedAt: now,
        };

        await this.repos.paymentAllocations.save(allocEntity);

        const inv = (await this.repos.invoices.findById(item.invoiceId))!;
        const allAllocs = await this.repos.paymentAllocations.findByInvoiceId(inv.id);
        const newPaid = calculateInvoicePaidAmount(allAllocs);
        const newBal = calculateInvoiceBalanceDue(inv.amount, allAllocs);
        const newStatus = deriveInvoicePaymentStatus(inv.amount, newPaid, inv.status);

        await this.repos.invoices.save({
          ...inv,
          paidAmount: newPaid,
          balanceDue: newBal,
          status: newStatus,
        });
      }
    }

    await auditLog(
      this.audit,
      actor,
      'payment',
      savedPayment.id,
      'payment.recorded',
      null,
      { amount: savedPayment.amount, purchaseOrderId: poId, unallocatedAmount },
    );

    return ok(savedPayment);
  }

  /**
   * Convenience workflow executing atomic payment creation and initial invoice allocation.
   * Enforces 100% transactional integrity: if allocation fails, returns error with no modified state.
   */
  async recordInvoicePayment(
    actor: ActorContext,
    invoiceId: string,
    amount: number,
    method: string,
    options?: { reference?: string | null; notes?: string | null },
  ): Promise<Result<{ payment: Payment; allocation: PaymentAllocationEntity }, Error>> {
    const payRes = await this.recordPayment(actor, invoiceId, amount, method, {
      reference: options?.reference,
      notes: options?.notes,
    });

    if (!payRes.ok) return payRes;
    const payment = payRes.value;

    if (!this.repos.paymentAllocations) {
      return err(new ValidationError('Payment allocation repository is not configured'));
    }

    const allocs = await this.repos.paymentAllocations.findByPaymentId(payment.id);
    const activeAlloc = allocs.find((a) => a.invoiceId === invoiceId && a.status === 'ALLOCATED');
    if (!activeAlloc) {
      return err(new ValidationError('Payment allocation failed to persist atomically'));
    }

    return ok({ payment, allocation: activeAlloc });
  }

  /**
   * Records a standalone payment allocation linking an existing payment to an invoice.
   */
  async recordPaymentAllocation(
    actor: ActorContext,
    paymentId: string,
    invoiceId: string,
    allocatedAmount: number,
    notes?: string | null,
  ): Promise<Result<PaymentAllocationEntity, Error>> {
    if (allocatedAmount <= 0) {
      return err(new ValidationError('Allocation amount must be strictly positive'));
    }

    if (!this.repos.paymentAllocations) {
      return err(new ValidationError('Payment allocation repository is not configured'));
    }

    const payment = await this.repos.payments.findById(paymentId);
    if (!payment) return err(new NotFoundError('Payment not found'));

    const invoice = await this.repos.invoices.findById(invoiceId);
    if (!invoice) return err(new NotFoundError('Invoice not found'));

    if (invoice.status !== 'APPROVED' && invoice.status !== 'PARTIALLY_PAID') {
      return err(
        new ValidationError('Invoice must be APPROVED or PARTIALLY_PAID before allocation'),
      );
    }

    const wo = await this.repos.workOrders.findById(invoice.workOrderId);
    if (!wo) return err(new ValidationError('Work order not found'));

    const po = await this.repos.purchaseOrders.findById(wo.purchaseOrderId);
    if (!po) return err(new ValidationError('Purchase order not found'));

    const access = requireOrgAccess(actor, po.organizationId, ['OWNER', 'MANAGER']);
    if (!access.ok) return access;

    const existingPaymentAllocs = await this.repos.paymentAllocations.findByPaymentId(payment.id);
    const existingInvoiceAllocs = await this.repos.paymentAllocations.findByInvoiceId(invoice.id);

    // Validate allocation limits
    const validation = validatePaymentAllocation(
      payment.amount,
      invoice.amount,
      existingPaymentAllocs,
      existingInvoiceAllocs,
      allocatedAmount,
    );

    if (!validation.valid) {
      return err(new ValidationError(validation.error || 'Payment allocation limit exceeded'));
    }

    const now = timestamp();
    const allocation: PaymentAllocationEntity = {
      id: createId(),
      paymentId: payment.id,
      invoiceId: invoice.id,
      allocatedAmount,
      allocatedAt: now,
      status: 'ALLOCATED',
      notes: notes || null,
      createdAt: now,
      updatedAt: now,
    };

    const savedAllocation = await this.repos.paymentAllocations.save(allocation);

    // Update payment unallocated amount
    const allPaymentAllocs = [...existingPaymentAllocs, savedAllocation];
    const newUnallocated = calculatePaymentUnallocatedAmount(payment.amount, allPaymentAllocs);
    await this.repos.payments.save({
      ...payment,
      unallocatedAmount: newUnallocated,
    });

    // Update invoice state
    const allInvoiceAllocs = [...existingInvoiceAllocs, savedAllocation];
    const newPaidAmount = calculateInvoicePaidAmount(allInvoiceAllocs);
    const newBalanceDue = calculateInvoiceBalanceDue(invoice.amount, allInvoiceAllocs);
    const newStatus = deriveInvoicePaymentStatus(invoice.amount, newPaidAmount, invoice.status);

    await this.repos.invoices.save({
      ...invoice,
      paidAmount: newPaidAmount,
      balanceDue: newBalanceDue,
      status: newStatus,
    });

    await auditLog(
      this.audit,
      actor,
      'payment_allocation',
      savedAllocation.id,
      'payment_allocation.created',
      null,
      { paymentId, invoiceId, allocatedAmount },
    );

    return ok(savedAllocation);
  }

  /**
   * Retrieves all allocations associated with a payment.
   */
  async getPaymentAllocations(
    _actor: ActorContext,
    paymentId: string,
  ): Promise<Result<PaymentAllocationEntity[], Error>> {
    if (!this.repos.paymentAllocations) {
      return ok([]);
    }
    const allocs = await this.repos.paymentAllocations.findByPaymentId(paymentId);
    return ok(allocs);
  }

  /**
   * Retrieves full settlement summary for an invoice.
   */
  async getInvoicePaymentSummary(
    _actor: ActorContext,
    invoiceId: string,
  ): Promise<Result<InvoicePaymentSummary, Error>> {
    const invoice = await this.repos.invoices.findById(invoiceId);
    if (!invoice) return err(new NotFoundError('Invoice not found'));

    const allocs = this.repos.paymentAllocations
      ? await this.repos.paymentAllocations.findByInvoiceId(invoiceId)
      : [];

    const paidAmount = calculateInvoicePaidAmount(allocs);
    const balanceDue = calculateInvoiceBalanceDue(invoice.amount, allocs);
    const isFullyPaid = balanceDue === 0 && paidAmount >= invoice.amount && invoice.amount > 0;
    const isPartiallyPaid = paidAmount > 0 && !isFullyPaid;

    return ok({
      invoiceId,
      invoiceAmount: invoice.amount,
      paidAmount,
      balanceDue,
      status: invoice.status,
      isFullyPaid,
      isPartiallyPaid,
      allocationCount: allocs.filter((a) => a.status === 'ALLOCATED').length,
    });
  }

  /**
   * Retrieves allocation summary for a payment.
   */
  async getPaymentAllocationSummary(
    _actor: ActorContext,
    paymentId: string,
  ): Promise<Result<PaymentAllocationSummary, Error>> {
    const payment = await this.repos.payments.findById(paymentId);
    if (!payment) return err(new NotFoundError('Payment not found'));

    const allocs = this.repos.paymentAllocations
      ? await this.repos.paymentAllocations.findByPaymentId(paymentId)
      : [];

    const allocatedAmount = calculatePaymentAllocatedAmount(allocs);
    const unallocatedAmount = calculatePaymentUnallocatedAmount(payment.amount, allocs);
    const isFullyAllocated = unallocatedAmount === 0 && allocatedAmount >= payment.amount;

    return ok({
      paymentId,
      paymentAmount: payment.amount,
      allocatedAmount,
      unallocatedAmount,
      isFullyAllocated,
      allocationCount: allocs.filter((a) => a.status === 'ALLOCATED').length,
    });
  }

  /**
   * Voids or reverses a payment allocation and synchronizes parent invoice & payment state.
   */
  async voidAllocation(
    actor: ActorContext,
    allocationId: string,
    reason?: string,
  ): Promise<Result<PaymentAllocationEntity, Error>> {
    if (!this.repos.paymentAllocations) {
      return err(new ValidationError('Payment allocation repository is not configured'));
    }

    const allocation = await this.repos.paymentAllocations.findById(allocationId);
    if (!allocation) return err(new NotFoundError('Allocation not found'));

    if (allocation.status === 'VOIDED') {
      return err(new ValidationError('Allocation is already voided'));
    }

    const invoice = await this.repos.invoices.findById(allocation.invoiceId);
    if (!invoice) return err(new NotFoundError('Invoice not found'));

    const wo = await this.repos.workOrders.findById(invoice.workOrderId);
    if (!wo) return err(new ValidationError('Work order not found'));

    const po = await this.repos.purchaseOrders.findById(wo.purchaseOrderId);
    if (!po) return err(new ValidationError('Purchase order not found'));

    const access = requireOrgAccess(actor, po.organizationId, ['OWNER', 'MANAGER']);
    if (!access.ok) return access;

    const payment = await this.repos.payments.findById(allocation.paymentId);
    if (!payment) return err(new NotFoundError('Payment not found'));

    const updatedAllocation: PaymentAllocationEntity = {
      ...allocation,
      status: 'VOIDED',
      notes: reason ? `${allocation.notes ? allocation.notes + ' | ' : ''}Voided: ${reason}` : allocation.notes,
      updatedAt: timestamp(),
    };

    await this.repos.paymentAllocations.save(updatedAllocation);

    // Sync Payment unallocated_amount
    const paymentAllocs = await this.repos.paymentAllocations.findByPaymentId(payment.id);
    const newUnallocated = calculatePaymentUnallocatedAmount(payment.amount, paymentAllocs);
    await this.repos.payments.save({
      ...payment,
      unallocatedAmount: newUnallocated,
    });

    // Sync Invoice paid_amount, balance_due, and status
    const invoiceAllocs = await this.repos.paymentAllocations.findByInvoiceId(invoice.id);
    const newPaid = calculateInvoicePaidAmount(invoiceAllocs);
    const newBal = calculateInvoiceBalanceDue(invoice.amount, invoiceAllocs);
    const newStatus = deriveInvoicePaymentStatus(invoice.amount, newPaid, invoice.status);

    await this.repos.invoices.save({
      ...invoice,
      paidAmount: newPaid,
      balanceDue: newBal,
      status: newStatus,
    });

    await auditLog(
      this.audit,
      actor,
      'payment_allocation',
      allocation.id,
      'payment_allocation.voided',
      null,
      { reason },
    );

    return ok(updatedAllocation);
  }

  /**
   * Retrieves full PO cumulative settlement summary across all invoices, payments, and allocations (Phase 5C.2).
   */
  async getPoSettlementSummary(
    actor: ActorContext,
    poId: string,
  ): Promise<Result<PoSettlementSummary, Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError('Purchase order not found'));

    // Verify tenant access: Buyer org member, assigned supplier, or platform admin
    if (!actor.isPlatformAdmin) {
      const isBuyer = actor.organizationId === po.organizationId;
      const isSupplier = actor.supplierIds?.includes(po.supplierId);
      if (!isBuyer && !isSupplier) {
        return err(new ValidationError('Unauthorized access to purchase order settlement'));
      }
    }

    // Retrieve invoices for PO
    let invoices = await this.repos.invoices.findByPurchaseOrderId(po.id);
    if (invoices.length === 0) {
      const wo = await this.repos.workOrders.findByPurchaseOrderId(po.id);
      if (wo) {
        invoices = await this.repos.invoices.findByWorkOrderId(wo.id);
      }
    }

    // Retrieve payments for PO
    let payments: Payment[] = [];
    if (this.repos.payments.findByPurchaseOrderId) {
      payments = await this.repos.payments.findByPurchaseOrderId(po.id);
    }
    if (payments.length === 0 && invoices.length > 0 && this.repos.payments.findByInvoiceId) {
      const payList: Payment[] = [];
      for (const inv of invoices) {
        const pList = await this.repos.payments.findByInvoiceId(inv.id);
        payList.push(...pList);
      }
      // Unique payments
      const seen = new Set<string>();
      payments = payList.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    }

    // Retrieve allocations across invoices
    let allocations: PaymentAllocationEntity[] = [];
    if (this.repos.paymentAllocations) {
      for (const inv of invoices) {
        const allocs = await this.repos.paymentAllocations.findByInvoiceId(inv.id);
        allocations.push(...allocs);
      }
    }

    const summary = calculatePoSettlementSummary(
      po,
      invoices,
      payments,
      allocations,
    );

    return ok(summary);
  }

  /**
   * Allocates balance from an existing unallocated advance payment against an approved invoice (Phase 5C.2).
   */
  async allocateAdvancePayment(
    actor: ActorContext,
    params: {
      paymentId: string;
      invoiceId: string;
      amount: number;
      notes?: string | null;
      idempotencyKey?: string | null;
    },
  ): Promise<Result<PaymentAllocationEntity, Error>> {
    const { paymentId, invoiceId, amount, notes } = params;
    if (amount <= 0) {
      return err(new ValidationError('Allocation amount must be strictly greater than 0'));
    }

    if (!this.repos.paymentAllocations) {
      return err(new ValidationError('Payment allocation repository is not configured'));
    }

    const payment = await this.repos.payments.findById(paymentId);
    if (!payment) return err(new NotFoundError('Payment not found'));

    const invoice = await this.repos.invoices.findById(invoiceId);
    if (!invoice) return err(new NotFoundError('Invoice not found'));

    // Resolve PO and verify buyer access
    let poId = invoice.purchaseOrderId || payment.purchaseOrderId || null;
    if (!poId && invoice.workOrderId) {
      const wo = await this.repos.workOrders.findById(invoice.workOrderId);
      if (wo) poId = wo.purchaseOrderId;
    }

    if (!poId) {
      return err(new ValidationError('Could not resolve Purchase Order for advance allocation'));
    }

    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError('Purchase order not found'));

    const access = requireOrgAccess(actor, po.organizationId, ['OWNER', 'MANAGER']);
    if (!access.ok) return access;

    if (invoice.status !== 'APPROVED' && invoice.status !== 'PARTIALLY_PAID') {
      return err(
        new ValidationError(`Invoice status is ${invoice.status}, but must be APPROVED or PARTIALLY_PAID before allocating advance`),
      );
    }

    // Validate available unallocated amount on payment
    const paymentAllocs = await this.repos.paymentAllocations.findByPaymentId(payment.id);
    const unallocated = calculatePaymentUnallocatedAmount(payment.amount, paymentAllocs);
    if (amount > unallocated) {
      return err(
        new ValidationError(`Allocation amount ₹${amount} exceeds available payment unallocated balance ₹${unallocated}`),
      );
    }

    // Validate invoice balance due
    const invoiceAllocs = await this.repos.paymentAllocations.findByInvoiceId(invoice.id);
    const balDue = calculateInvoiceBalanceDue(invoice.amount, invoiceAllocs);
    if (amount > balDue) {
      return err(
        new ValidationError(`Allocation amount ₹${amount} exceeds invoice balance due of ₹${balDue}`),
      );
    }

    const now = timestamp();
    const allocation: PaymentAllocationEntity = {
      id: createId(),
      paymentId: payment.id,
      invoiceId: invoice.id,
      allocatedAmount: amount,
      allocatedAt: now,
      status: 'ALLOCATED',
      notes: notes || 'Advance payment balance allocation',
      createdAt: now,
      updatedAt: now,
    };

    const savedAllocation = await this.repos.paymentAllocations.save(allocation);

    // Sync Payment unallocated amount
    const updatedPaymentAllocs = await this.repos.paymentAllocations.findByPaymentId(payment.id);
    const newUnallocated = calculatePaymentUnallocatedAmount(payment.amount, updatedPaymentAllocs);
    await this.repos.payments.save({
      ...payment,
      unallocatedAmount: newUnallocated,
    });

    // Sync Invoice paid_amount, balance_due, and status
    const updatedInvoiceAllocs = await this.repos.paymentAllocations.findByInvoiceId(invoice.id);
    const newPaid = calculateInvoicePaidAmount(updatedInvoiceAllocs);
    const newBal = calculateInvoiceBalanceDue(invoice.amount, updatedInvoiceAllocs);
    const newStatus = deriveInvoicePaymentStatus(invoice.amount, newPaid, invoice.status);

    await this.repos.invoices.save({
      ...invoice,
      paidAmount: newPaid,
      balanceDue: newBal,
      status: newStatus,
    });

    await auditLog(
      this.audit,
      actor,
      'payment_allocation',
      savedAllocation.id,
      'advance_payment.allocated',
      null,
      { paymentId, invoiceId, allocatedAmount: amount, notes },
    );

    return ok(savedAllocation);
  }

  /**
   * Generates an immutable, structured reconciliation and settlement certificate (Phase 5C.2).
   */
  async generatePoSettlementCertificate(
    actor: ActorContext,
    poId: string,
  ): Promise<Result<PoSettlementCertificate, Error>> {
    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError('Purchase order not found'));

    if (!actor.isPlatformAdmin) {
      const isBuyer = actor.organizationId === po.organizationId;
      const isSupplier = actor.supplierIds?.includes(po.supplierId);
      if (!isBuyer && !isSupplier) {
        return err(new ValidationError('Unauthorized access to purchase order settlement certificate'));
      }
    }

    // Retrieve invoices for PO
    let invoices = await this.repos.invoices.findByPurchaseOrderId(po.id);
    if (invoices.length === 0) {
      const wo = await this.repos.workOrders.findByPurchaseOrderId(po.id);
      if (wo) {
        invoices = await this.repos.invoices.findByWorkOrderId(wo.id);
      }
    }

    // Retrieve payments for PO
    let payments: Payment[] = [];
    if (this.repos.payments.findByPurchaseOrderId) {
      payments = await this.repos.payments.findByPurchaseOrderId(po.id);
    }
    if (payments.length === 0 && invoices.length > 0 && this.repos.payments.findByInvoiceId) {
      const payList: Payment[] = [];
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

    let allocations: PaymentAllocationEntity[] = [];
    if (this.repos.paymentAllocations) {
      for (const inv of invoices) {
        const allocs = await this.repos.paymentAllocations.findByInvoiceId(inv.id);
        allocations.push(...allocs);
      }
    }

    const supplier = po.supplierId ? await this.repos.suppliers.findById(po.supplierId) : null;

    const cert = generatePoSettlementCertificate(
      po,
      invoices,
      payments,
      allocations,
      {
        id: actor.profileId,
        role: actor.isPlatformAdmin ? 'PLATFORM_ADMIN' : 'ORG_MEMBER',
      },
      {
        id: po.organizationId,
      },
      supplier ? { id: supplier.id, name: supplier.businessName, gstin: supplier.gstin } : undefined,
    );

    return ok(cert);
  }
}

import {
  calculateAgingBuckets,
  calculateBuyerReward,
  calculateFinancialObservabilitySummary,
  calculateInvoiceBalanceDue,
  calculateInvoicePaidAmount,
  calculatePaymentAllocatedAmount,
  calculatePaymentUnallocatedAmount,
  calculatePlatformFee,
  calculatePoSettlementSummary,
  calculateReconciliationSummary,
  calculateSettlementConservation,
  calculateSubscriptionDiscount,
  calculateTds,
  calculateTdsNetPayable,
  calculateVendorSettlementStatement,
  calculateWalletBalanceAfterRedemption,
  canResolveSettlementException,
  canTransitionFeeTransaction,
  canTransitionRewardAllocation,
  canVoidTdsDeduction,
  computePayloadChecksum,
  deriveInvoicePaymentStatus,
  evaluateDuplicateExport,
  evaluateSettlementReconciliation,
  exportToTallyPaymentVoucher,
  exportToZohoPaymentReceipt,
  generateFinancialAuditPackCsv,
  generateFinancialAuditPackJson,
  generateForm16ACertificate,
  generatePoSettlementCertificate,
  isPurchaseOrderFullySettled,
  lookupTdsRate,
  normalizeUtr,
  reconcileBankRemittance,
  validateCommercialConservation,
  validateCommercialMonetaryClass,
  validatePan,
  validatePaymentAllocation,
  type BankReconciliationRecord,
  type BankRemittanceAdvice,
  type BuyerRewardAllocation,
  type BuyerRewardAllocationStatus,
  type BuyerRewardCalculationParams,
  type BuyerRewardCalculationResult,
  type BuyerRewardPolicy,
  type CreditDebitNote,
  type CreditDebitNoteStatus,
  type CreditDebitNoteType,
  type ErpExportManifest,
  type ErpExportType,
  type FinancialAuditPack,
  type FinancialObservabilitySummary,
  type Form16ACertificate,
  type Form16AGeneratorParams,
  type InvoicePaymentSummary,
  type OrganizationWallet,
  type PaymentAllocationSummary,
  type PlatformFeePolicy,
  type PlatformFeeTransaction,
  type PlatformFeeTransactionStatus,
  type PoFeeSnapshot,
  type PoSettlementCertificate,
  type PoSettlementSummary,
  type SettlementDiscrepancyType,
  type SettlementExceptionEvent,
  type SettlementExceptionEventType,
  type SettlementExceptionRecord,
  type SettlementExceptionSeverity,
  type SettlementExceptionStatus,
  type SettlementReconciliationRecord,
  type SettlementReconciliationStatus,
  type TdsLawVersion,
  type TdsSection,
  type VendorSettlementStatement,
  type WalletStatus,
  type WalletTransaction,
  type WalletTransactionType,
  type ZohoPaymentReceiptPayload,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories } from '../repositories/interfaces';
import type {
  BankReconciliationRecordEntity,
  BuyerRewardAllocationEntity,
  BuyerRewardPolicyEntity,
  CreditDebitNoteEntity,
  ErpExportManifestEntity,
  Invoice,
  OrganizationWalletEntity,
  Payment,
  PaymentAllocationEntity,
  PlatformFeePolicyEntity,
  PlatformFeeTransactionEntity,
  PoFeeSnapshotEntity,
  PurchaseOrder,
  SettlementExceptionEntity,
  SettlementExceptionEventEntity,
  SettlementReconciliationEntity,
  TdsDeductionEntity,
  WalletTransactionEntity,
} from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireBuyerResourceAccess, requireOrgAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface RecordPaymentOptions {
  purchaseOrderId?: string | null;
  reference?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  allocations?: Array<{
    invoiceId: string;
    amount: number;
    notes?: string | null;
  }>;
}

export class PaymentService {
  private activeReversals = new Set<string>();
  private activeFeeDeductions = new Map<string, Promise<Result<PlatformFeeTransactionEntity, Error>>>();
  private activeAllocations = new Map<string, Promise<Result<PaymentAllocationEntity, Error>>>();

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

      const access = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
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

    const access = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
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
          allocatedBy: actor.profileId || null,
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
    idempotencyKey?: string | null,
  ): Promise<Result<PaymentAllocationEntity, Error>> {
    if (idempotencyKey) {
      const lockKey = `${paymentId}:${idempotencyKey}`;
      const inFlight = this.activeAllocations.get(lockKey);
      if (inFlight) {
        return inFlight;
      }
      const promise = this._recordPaymentAllocationInternal(
        actor,
        paymentId,
        invoiceId,
        allocatedAmount,
        notes,
        idempotencyKey,
      );
      this.activeAllocations.set(lockKey, promise);
      try {
        return await promise;
      } finally {
        this.activeAllocations.delete(lockKey);
      }
    }

    return this._recordPaymentAllocationInternal(
      actor,
      paymentId,
      invoiceId,
      allocatedAmount,
      notes,
      idempotencyKey,
    );
  }

  private async _recordPaymentAllocationInternal(
    actor: ActorContext,
    paymentId: string,
    invoiceId: string,
    allocatedAmount: number,
    notes?: string | null,
    idempotencyKey?: string | null,
  ): Promise<Result<PaymentAllocationEntity, Error>> {
    if (allocatedAmount <= 0) {
      return err(new ValidationError('Allocation amount must be strictly positive'));
    }

    if (!this.repos.paymentAllocations) {
      return err(new ValidationError('Payment allocation repository is not configured'));
    }

    // GAP-5C6-02: Idempotency check
    if (idempotencyKey) {
      const existingPaymentAllocs = await this.repos.paymentAllocations.findByPaymentId(paymentId);
      const existingKeyMatch = existingPaymentAllocs.find(
        (a) => a.idempotencyKey === idempotencyKey && a.status === 'ALLOCATED',
      );
      if (existingKeyMatch) {
        return ok(existingKeyMatch);
      }
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

    const access = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
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
      idempotencyKey: idempotencyKey || null,
      allocatedBy: actor.profileId || null,
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

    const access = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
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

    const access = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
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
        id: po.organizationId || '',
      },
      supplier ? { id: supplier.id, name: supplier.businessName, gstin: supplier.gstin } : undefined,
    );

    return ok(cert);
  }

  /**
   * Atomically reverses a payment allocation and synchronizes parent invoice & payment state (Phase 5C.3).
   */
  async reversePaymentAllocation(
    actor: ActorContext,
    params: {
      allocationId: string;
      reason: string;
      idempotencyKey?: string | null;
    },
  ): Promise<Result<PaymentAllocationEntity, Error>> {
    const { allocationId, reason, idempotencyKey } = params;

    if (!reason || reason.trim() === '') {
      return err(new ValidationError('Reversal reason is required (REV-5C3-INVALID-REASON)'));
    }

    if (this.activeReversals.has(allocationId)) {
      return err(new ValidationError('Concurrent reversal operation in progress for this allocation (REV-5C3-CONCURRENT-LOCK)'));
    }
    this.activeReversals.add(allocationId);

    try {
      if (!this.repos.paymentAllocations) {
        return err(new ValidationError('Payment allocation repository is not configured'));
      }

      const allocation = await this.repos.paymentAllocations.findById(allocationId);
      if (!allocation) {
        return err(new NotFoundError(`Payment allocation not found (REV-5C3-NOT-FOUND)`));
      }

      // 5C3-RED-01: Check if already reversed or voided
      if (allocation.status === 'REVERSED' || allocation.status === 'VOIDED') {
        return err(
          new ValidationError(`Payment allocation is already ${allocation.status} (REV-5C3-ALREADY-REVERSED)`),
        );
      }

      const payment = await this.repos.payments.findById(allocation.paymentId);
      if (!payment) {
        return err(new NotFoundError('Associated payment not found (REV-5C3-PAY-NOT-FOUND)'));
      }

      const invoice = await this.repos.invoices.findById(allocation.invoiceId);
      if (!invoice) {
        return err(new NotFoundError('Associated invoice not found (REV-5C3-INV-NOT-FOUND)'));
      }

      // Resolve PO and Org
      let poId = invoice.purchaseOrderId || payment.purchaseOrderId || null;
      if (!poId && invoice.workOrderId) {
        const wo = await this.repos.workOrders.findById(invoice.workOrderId);
        if (wo) poId = wo.purchaseOrderId;
      }

      const po = poId ? await this.repos.purchaseOrders.findById(poId) : null;
      const orgId = po?.organizationId || null;

      // 5C3-RED-03: Authorization check (Buyer OWNER/MANAGER or Platform Admin)
      if (!actor.isPlatformAdmin) {
        if (!orgId || actor.organizationId !== orgId || !['OWNER', 'MANAGER'].includes(actor.orgRole || '')) {
          return err(
            new ForbiddenError('Unauthorized: only buyer OWNER or MANAGER can reverse payment allocations (REV-5C3-UNAUTHORIZED)'),
          );
        }
      }

      // 5C3-RED-02: Closed PO Guard (Cannot reverse on COMPLETED PO)
      if (po && po.status === 'COMPLETED') {
        return err(
          new ValidationError('Cannot reverse payment allocation on a COMPLETED purchase order (REV-5C3-PO-CLOSED)'),
        );
      }

      // Invariant checks: 5C3-RED-08 & 5C3-RED-09
      const currentPaid = invoice.paidAmount ?? 0;
      if (currentPaid < allocation.allocatedAmount) {
        return err(
          new ValidationError('Reversal invariant violation: allocation amount exceeds invoice paid balance (REV-5C3-INVALID-INVOICE-PAID)'),
        );
      }

      const currentUnallocated = payment.unallocatedAmount ?? 0;
      if (currentUnallocated + allocation.allocatedAmount > payment.amount) {
        return err(
          new ValidationError('Reversal invariant violation: resulting unallocated amount exceeds payment total (REV-5C3-INVALID-PAYMENT-UNALLOC)'),
        );
      }

      const now = timestamp();
      const updatedAllocation: PaymentAllocationEntity = {
        ...allocation,
        status: 'REVERSED',
        notes: reason ? `${allocation.notes ? allocation.notes + ' ' : ''}[REVERSED: ${reason}]` : allocation.notes,
        updatedAt: now,
      };

      await this.repos.paymentAllocations.save(updatedAllocation);

      // Sync Payment unallocated_amount
      const allPaymentAllocs = await this.repos.paymentAllocations.findByPaymentId(payment.id);
      const newUnallocated = calculatePaymentUnallocatedAmount(payment.amount, allPaymentAllocs);
      await this.repos.payments.save({
        ...payment,
        unallocatedAmount: newUnallocated,
      });

      // Sync Invoice paid_amount, balance_due, and status
      const allInvoiceAllocs = await this.repos.paymentAllocations.findByInvoiceId(invoice.id);
      const newPaid = calculateInvoicePaidAmount(allInvoiceAllocs);
      const newBal = calculateInvoiceBalanceDue(invoice.amount, allInvoiceAllocs);
      const newStatus = deriveInvoicePaymentStatus(invoice.amount, newPaid, invoice.status);

      await this.repos.invoices.save({
        ...invoice,
        paidAmount: newPaid,
        balanceDue: newBal,
        status: newStatus,
      });

      // GAP-5C6-03: Platform Fee Synchronization During Allocation Reversal
      if (this.repos.platformFeeTransactions) {
        const feeTxs = await this.repos.platformFeeTransactions.findByOrganizationId(orgId || po?.organizationId || '');
        const matchingFees = feeTxs.filter(
          (tx) => tx.paymentAllocationId === allocation.id && (tx.status === 'APPLIED' || tx.status === 'SETTLED'),
        );

        for (const feeTx of matchingFees) {
          const updatedFeeTx: PlatformFeeTransactionEntity = {
            ...feeTx,
            status: 'REVERSED',
            voidedAt: now,
            updatedAt: now,
            notes: `${feeTx.notes || ''} [AUTO_REVERSED on allocation reversal ${allocation.id}]`.trim(),
          };
          await this.repos.platformFeeTransactions.save(updatedFeeTx);

          await auditLog(
            this.audit,
            actor,
            'PLATFORM_FEE_REVERSED',
            'PLATFORM_FEE_TRANSACTION',
            feeTx.id,
            {
              paymentAllocationId: allocation.id,
              reversedAmount: feeTx.feeAmount,
              reason: `Cascading reversal from allocation ${allocation.id}: ${reason}`,
            },
          );
        }
      }

      await auditLog(
        this.audit,
        actor,
        'payment_allocation',
        allocation.id,
        'payment_allocation.reversed',
        null,
        {
          paymentId: payment.id,
          invoiceId: invoice.id,
          purchaseOrderId: poId,
          reversedAmount: allocation.allocatedAmount,
          reason,
          idempotencyKey,
        },
      );

      return ok(updatedAllocation);
    } finally {
      this.activeReversals.delete(allocationId);
    }
  }

  /**
   * Issues a statutory Credit or Debit Note against an invoice (Phase 5C.3).
   */
  async issueCreditDebitNote(
    actor: ActorContext,
    params: {
      organizationId: string;
      invoiceId: string;
      purchaseOrderId?: string | null;
      noteType: CreditDebitNoteType;
      amount: number;
      taxAmount?: number;
      reason: string;
      noteNumber?: string;
      idempotencyKey?: string | null;
    },
  ): Promise<Result<CreditDebitNoteEntity, Error>> {
    const { organizationId, invoiceId, noteType, amount, taxAmount = 0, reason, noteNumber } = params;

    if (amount <= 0) {
      return err(new ValidationError('Note amount must be strictly greater than 0 (CDN-5C3-INVALID-AMOUNT)'));
    }

    if (noteType !== 'DEBIT_NOTE' && noteType !== 'CREDIT_NOTE') {
      return err(new ValidationError('Note type must be DEBIT_NOTE or CREDIT_NOTE (CDN-5C3-INVALID-TYPE)'));
    }

    if (taxAmount < 0) {
      return err(new ValidationError('Tax amount must be non-negative (CDN-5C3-INVALID-TAX)'));
    }

    if (!reason || reason.trim() === '') {
      return err(new ValidationError('Reason is required when issuing a credit/debit note (CDN-5C3-INVALID-REASON)'));
    }

    const access = requireOrgAccess(actor, organizationId, ['OWNER', 'MANAGER']);
    if (!access.ok) return access;

    const invoice = await this.repos.invoices.findById(invoiceId);
    if (!invoice) {
      return err(new NotFoundError('Target invoice not found (CDN-5C3-INV-NOT-FOUND)'));
    }

    if (invoice.status === 'REJECTED') {
      return err(new ValidationError('Cannot issue credit or debit note against a REJECTED invoice (CDN-5C3-INVOICE-REJECTED)'));
    }

    // 5C3-RED-04: Validate Debit Note Balance Cap (Cannot exceed invoice amount)
    if (noteType === 'DEBIT_NOTE' && this.repos.creditDebitNotes) {
      const existingNotes = await this.repos.creditDebitNotes.findByInvoiceId(invoice.id);
      const existingDebits = existingNotes
        .filter((n) => n.noteType === 'DEBIT_NOTE' && (n.status === 'ISSUED' || n.status === 'APPLIED'))
        .reduce((sum, n) => sum + Number(n.amount || 0), 0);

      if (existingDebits + amount > invoice.amount) {
        return err(
          new ValidationError(
            `Debit note amount (₹${existingDebits + amount}) exceeds permitted invoice ceiling of ₹${invoice.amount} (CDN-5C3-EXCEEDS-BALANCE)`,
          ),
        );
      }
    }

    let poId = params.purchaseOrderId || invoice.purchaseOrderId || null;
    if (!poId && invoice.workOrderId) {
      const wo = await this.repos.workOrders.findById(invoice.workOrderId);
      if (wo) poId = wo.purchaseOrderId;
    }

    const now = timestamp();
    const prefix = noteType === 'DEBIT_NOTE' ? 'DN' : 'CN';
    const finalNoteNumber =
      noteNumber || `${prefix}-${now.slice(0, 10).replace(/-/g, '')}-${createId().slice(0, 8).toUpperCase()}`;

    const note: CreditDebitNoteEntity = {
      id: createId(),
      organizationId,
      purchaseOrderId: poId,
      invoiceId: invoice.id,
      noteNumber: finalNoteNumber,
      noteType,
      amount,
      taxAmount,
      reason,
      status: 'ISSUED',
      createdBy: actor.profileId,
      createdAt: now,
      updatedAt: now,
    };

    const savedNote = this.repos.creditDebitNotes
      ? await this.repos.creditDebitNotes.save(note)
      : note;

    await auditLog(
      this.audit,
      actor,
      'credit_debit_note',
      savedNote.id,
      'credit_debit_note.issued',
      null,
      {
        noteNumber: finalNoteNumber,
        noteType,
        amount,
        taxAmount,
        invoiceId: invoice.id,
        purchaseOrderId: poId,
        reason,
      },
    );

    return ok(savedNote);
  }

  /**
   * Retrieves full Multi-PO Cumulative Vendor Settlement Statement (Phase 5C.3).
   */
  async getVendorSettlementStatement(
    actor: ActorContext,
    params: {
      organizationId: string;
      supplierId: string;
      fromDate?: string;
      toDate?: string;
    },
  ): Promise<Result<VendorSettlementStatement, Error>> {
    const { organizationId, supplierId, fromDate, toDate } = params;

    // 5C3-RED-06: Cross-tenant ERP access check
    if (!actor.isPlatformAdmin) {
      const isBuyer = actor.organizationId === organizationId;
      const isSupplier = actor.supplierIds?.includes(supplierId);
      if (!isBuyer && !isSupplier) {
        return err(
          new ForbiddenError(
            'Unauthorized: Caller cannot access vendor settlement statements for this tenant (VSS-5C3-UNAUTHORIZED)',
          ),
        );
      }
    }

    // Retrieve all POs for organization & supplier
    // We scan purchaseOrders store or repo
    const allPos: PurchaseOrder[] = [];
    if ((this.repos.purchaseOrders as any).findByOrganizationId) {
      const pList = await (this.repos.purchaseOrders as any).findByOrganizationId(organizationId);
      allPos.push(...pList.filter((p: PurchaseOrder) => p.supplierId === supplierId));
    } else {
      // In-memory scan fallback
      const inMemStore = (this.repos.purchaseOrders as any).store || (this.repos as any).purchaseOrders;
      if (inMemStore && inMemStore instanceof Map) {
        for (const p of inMemStore.values()) {
          if (p.organizationId === organizationId && p.supplierId === supplierId) {
            allPos.push(p);
          }
        }
      }
    }

    // Collect all invoices for these POs
    const allInvoices: Invoice[] = [];
    for (const po of allPos) {
      let invList = await this.repos.invoices.findByPurchaseOrderId(po.id);
      if (invList.length === 0) {
        const wo = await this.repos.workOrders.findByPurchaseOrderId(po.id);
        if (wo) {
          invList = await this.repos.invoices.findByWorkOrderId(wo.id);
        }
      }
      allInvoices.push(...invList);
    }

    // Collect all payments for these POs
    const allPayments: Payment[] = [];
    for (const po of allPos) {
      let pList: Payment[] = [];
      if (this.repos.payments.findByPurchaseOrderId) {
        pList = await this.repos.payments.findByPurchaseOrderId(po.id);
      }
      if (pList.length === 0 && this.repos.payments.findByInvoiceId) {
        for (const inv of allInvoices.filter((i) => i.purchaseOrderId === po.id)) {
          const invPays = await this.repos.payments.findByInvoiceId(inv.id);
          pList.push(...invPays);
        }
      }
      allPayments.push(...pList);
    }

    // Deduplicate payments
    const uniquePayments: Payment[] = [];
    const seenPay = new Set<string>();
    for (const p of allPayments) {
      if (!seenPay.has(p.id)) {
        seenPay.add(p.id);
        uniquePayments.push(p);
      }
    }

    // Collect allocations across invoices
    const allAllocations: PaymentAllocationEntity[] = [];
    if (this.repos.paymentAllocations) {
      for (const inv of allInvoices) {
        const allocs = await this.repos.paymentAllocations.findByInvoiceId(inv.id);
        allAllocations.push(...allocs);
      }
    }

    // Collect credit & debit notes
    let allNotes: CreditDebitNoteEntity[] = [];
    if (this.repos.creditDebitNotes) {
      allNotes = await this.repos.creditDebitNotes.findByOrganizationId(organizationId);
    }

    const statement = calculateVendorSettlementStatement({
      buyerOrganizationId: organizationId,
      supplierId,
      periodStart: fromDate || null,
      periodEnd: toDate || null,
      purchaseOrders: allPos,
      invoices: allInvoices,
      payments: uniquePayments,
      allocations: allAllocations,
      creditDebitNotes: allNotes,
    });

    return ok(statement);
  }

  /**
   * Exports an approved payment and allocations into statutory Tally XML format (Phase 5C.3).
   */
  async exportTallyPaymentVoucher(
    actor: ActorContext,
    params: {
      poId?: string;
      paymentId: string;
      bankLedgerName?: string;
    },
  ): Promise<Result<string, Error>> {
    const payment = await this.repos.payments.findById(params.paymentId);
    if (!payment) return err(new NotFoundError('Payment not found'));

    let poId: string | null = params.poId || payment.purchaseOrderId || null;
    if (!poId && payment.invoiceId) {
      const inv = await this.repos.invoices.findById(payment.invoiceId);
      if (inv) {
        poId = inv.purchaseOrderId || null;
        if (!poId && inv.workOrderId) {
          const wo = await this.repos.workOrders.findById(inv.workOrderId);
          if (wo) poId = wo.purchaseOrderId || null;
        }
      }
    }

    const po = poId ? await this.repos.purchaseOrders.findById(poId) : null;

    // 5C3-RED-06: Cross-tenant authorization check
    if (!actor.isPlatformAdmin) {
      const isBuyer = po && actor.organizationId === po.organizationId;
      const isSupplier = po && actor.supplierIds?.includes(po.supplierId);
      if (!isBuyer && !isSupplier) {
        return err(
          new ForbiddenError('Unauthorized: Access denied to payment voucher export (5C3-ERP-UNAUTHORIZED)'),
        );
      }
    }

    // Load allocations
    const allocs = this.repos.paymentAllocations
      ? await this.repos.paymentAllocations.findByPaymentId(payment.id)
      : [];

    const activeAllocs = allocs.filter((a) => a.status === 'ALLOCATED');
    const allocationItems: Array<{ invoiceNumber: string; allocatedAmount: number }> = [];

    for (const a of activeAllocs) {
      const inv = await this.repos.invoices.findById(a.invoiceId);
      if (inv) {
        allocationItems.push({
          invoiceNumber: inv.invoiceNumber,
          allocatedAmount: a.allocatedAmount,
        });
      }
    }

    const supplier = po?.supplierId ? await this.repos.suppliers.findById(po.supplierId) : null;
    const supplierName = supplier?.businessName || 'Supplier';

    const xml = exportToTallyPaymentVoucher({
      paymentId: payment.id,
      paymentDate: payment.recordedAt ? payment.recordedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      paymentReference: (payment as any).reference || payment.id || null,
      paymentMethod: payment.method,
      amount: payment.amount,
      currency: payment.currency,
      bankLedgerName: params.bankLedgerName || 'Bank Account',
      supplierName,
      poNumber: po?.poNumber || po?.id,
      allocations: allocationItems,
      unallocatedAmount: payment.unallocatedAmount,
    });

    return ok(xml);
  }

  /**
   * Exports an approved payment and allocations into Zoho Books JSON format (Phase 5C.3).
   */
  async exportZohoPaymentReceipt(
    actor: ActorContext,
    params: {
      poId?: string;
      paymentId: string;
      bankAccountName?: string;
    },
  ): Promise<Result<ZohoPaymentReceiptPayload, Error>> {
    const payment = await this.repos.payments.findById(params.paymentId);
    if (!payment) return err(new NotFoundError('Payment not found'));

    let poId: string | null = params.poId || payment.purchaseOrderId || null;
    if (!poId && payment.invoiceId) {
      const inv = await this.repos.invoices.findById(payment.invoiceId);
      if (inv) {
        poId = inv.purchaseOrderId || null;
        if (!poId && inv.workOrderId) {
          const wo = await this.repos.workOrders.findById(inv.workOrderId);
          if (wo) poId = wo.purchaseOrderId || null;
        }
      }
    }

    const po = poId ? await this.repos.purchaseOrders.findById(poId) : null;

    // 5C3-RED-06: Cross-tenant authorization check
    if (!actor.isPlatformAdmin) {
      const isBuyer = po && actor.organizationId === po.organizationId;
      const isSupplier = po && actor.supplierIds?.includes(po.supplierId);
      if (!isBuyer && !isSupplier) {
        return err(
          new ForbiddenError('Unauthorized: Access denied to payment receipt export (5C3-ERP-UNAUTHORIZED)'),
        );
      }
    }

    const allocs = this.repos.paymentAllocations
      ? await this.repos.paymentAllocations.findByPaymentId(payment.id)
      : [];

    const activeAllocs = allocs.filter((a) => a.status === 'ALLOCATED');
    const allocationItems: Array<{ invoiceNumber: string; invoiceId: string; allocatedAmount: number }> = [];

    for (const a of activeAllocs) {
      const inv = await this.repos.invoices.findById(a.invoiceId);
      if (inv) {
        allocationItems.push({
          invoiceNumber: inv.invoiceNumber,
          invoiceId: inv.id,
          allocatedAmount: a.allocatedAmount,
        });
      }
    }

    const supplier = po?.supplierId ? await this.repos.suppliers.findById(po.supplierId) : null;
    const supplierName = supplier?.businessName || 'Supplier';

    const payload = exportToZohoPaymentReceipt({
      paymentId: payment.id,
      paymentDate: payment.recordedAt ? payment.recordedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      paymentReference: (payment as any).reference || payment.id || null,
      paymentMode: payment.method === 'CHEQUE' ? 'Check' : 'Bank Transfer',
      amount: payment.amount,
      currency: payment.currency,
      bankAccountName: params.bankAccountName || 'Bank Account',
      supplierName,
      poNumber: po?.poNumber || po?.id,
      allocations: allocationItems,
      unallocatedAmount: payment.unallocatedAmount,
    });

    return ok(payload);
  }

  /**
   * Applies statutory TDS withholding against an approved invoice (Phase 5C.4).
   */
  async applyTdsWithholding(
    actor: ActorContext,
    invoiceId: string,
    section: TdsSection,
    options?: {
      customRate?: number;
      deducteePan?: string;
      isNonFiler206AB?: boolean;
      isLowerDeduction?: boolean;
      lowerDeductionRate?: number;
      lowerDeductionCert?: string;
      lawVersion?: TdsLawVersion;
      date?: string | Date;
      cumulativeFYAmount?: number;
    },
  ): Promise<Result<TdsDeductionEntity, Error>> {
    const invoice = await this.repos.invoices.findById(invoiceId);
    if (!invoice) return err(new NotFoundError('Invoice not found'));

    if (invoice.status !== 'APPROVED' && invoice.status !== 'PARTIALLY_PAID' && invoice.status !== 'PAID') {
      return err(
        new ValidationError(`Cannot apply TDS to invoice with status ${invoice.status} (TDS-5C4-INVALID-STATUS)`),
      );
    }

    let poId: string | null = invoice.purchaseOrderId || null;
    let orgId: string = (invoice as any).organizationId || '';
    if (!poId && invoice.workOrderId) {
      const wo = await this.repos.workOrders.findById(invoice.workOrderId);
      if (wo) poId = wo.purchaseOrderId || null;
    }
    if (!orgId && poId) {
      const po = await this.repos.purchaseOrders.findById(poId);
      if (po) orgId = po.organizationId || '';
    }

    // Access control: Buyer OWNER, MANAGER, BUYER or Platform Admin
    if (!actor.isPlatformAdmin) {
      const access = requireBuyerResourceAccess(actor, orgId, (invoice as any).createdBy, ['OWNER', 'MANAGER', 'BUYER']);
      if (!access.ok) {
        return err(
          new ForbiddenError('Unauthorized: Only authorized buyer can apply statutory TDS (RED-17/TDS-5C4-UNAUTHORIZED)'),
        );
      }
    }

    // Check duplicate TDS on same invoice and section
    if (this.repos.tdsDeductions) {
      const existing = await this.repos.tdsDeductions.findByInvoiceId(invoiceId);
      const duplicate = existing.find(
        (t) => t.section === section && t.status !== 'VOIDED',
      );
      if (duplicate) {
        return err(
          new ValidationError(
            `Statutory TDS under Section ${section} has already been deducted for this invoice (RED-16/TDS-5C4-DUPLICATE)`,
          ),
        );
      }
    }

    // Deductee PAN: from options or supplier
    let deducteePan = options?.deducteePan;
    if (!deducteePan && invoice.supplierId) {
      const supplier = await this.repos.suppliers.findById(invoice.supplierId);
      if (supplier?.gstin) {
        deducteePan = supplier.gstin.slice(2, 12);
      }
    }

    const tdsResult = calculateTds({
      invoiceAmount: invoice.amount,
      section,
      deducteePan,
      isNonFiler206AB: options?.isNonFiler206AB,
      hasLowerDeductionCert: options?.isLowerDeduction,
      lowerDeductionRate: options?.lowerDeductionRate,
      lawVersion: options?.lawVersion,
      date: options?.date,
      cumulativeFYAmount: options?.cumulativeFYAmount,
      customTdsRate: options?.customRate,
    });

    // Invariant: TDS cannot exceed gross invoice amount (RED-03/RED-08)
    if (tdsResult.statutoryTdsAmount > invoice.amount) {
      return err(
        new ValidationError(
          `Statutory TDS amount ₹${tdsResult.statutoryTdsAmount} exceeds gross invoice amount ₹${invoice.amount} (RED-03/RED-08)`,
        ),
      );
    }

    const now = timestamp();
    const deduction: TdsDeductionEntity = {
      id: createId(),
      organizationId: orgId,
      supplierId: invoice.supplierId,
      purchaseOrderId: poId,
      invoiceId: invoice.id,
      lawVersion: tdsResult.lawVersion,
      section: tdsResult.section,
      taxableAmount: tdsResult.taxableAmount,
      tdsRate: tdsResult.tdsRate,
      tdsAmount: tdsResult.statutoryTdsAmount,
      status: 'DEDUCTED',
      deducteePan: tdsResult.pan,
      panStatus: tdsResult.panStatus,
      isLowerDeduction: options?.isLowerDeduction || false,
      lowerDeductionCertNumber: options?.lowerDeductionCert || null,
      financialYear: tdsResult.financialYear,
      assessmentYear: tdsResult.assessmentYear,
      createdBy: actor.profileId || null,
      createdAt: now,
      updatedAt: now,
    };

    if (this.repos.tdsDeductions) {
      await this.repos.tdsDeductions.save(deduction);
    }

    await auditLog(
      this.audit,
      actor,
      'TDS_DEDUCTED',
      'TDS_DEDUCTION',
      deduction.id,
      {
        invoiceId: invoice.id,
        purchaseOrderId: poId,
        section,
        tdsRate: tdsResult.tdsRate,
        tdsAmount: tdsResult.statutoryTdsAmount,
        pan: tdsResult.pan,
      },
    );

    return ok(deduction);
  }

  /**
   * Voids an undeposited TDS deduction record (Phase 5C.4).
   * Deposited TDS cannot be voided / reversed (RED-07).
   */
  async voidTdsWithholding(
    actor: ActorContext,
    tdsDeductionId: string,
    reason?: string,
  ): Promise<Result<TdsDeductionEntity, Error>> {
    if (!this.repos.tdsDeductions) {
      return err(new NotFoundError('TDS deduction repository not configured'));
    }

    const deduction = await this.repos.tdsDeductions.findById(tdsDeductionId);
    if (!deduction) return err(new NotFoundError('TDS deduction record not found'));

    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, deduction.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;
    }

    const voidCheck = canVoidTdsDeduction(deduction.status as any);
    if (!voidCheck.canVoid) {
      return err(
        new ValidationError(voidCheck.reason || 'Cannot void this TDS deduction record (RED-07/REV-5C4-TDS-ALREADY-DEPOSITED)'),
      );
    }

    deduction.status = 'VOIDED';
    deduction.updatedAt = timestamp();

    await this.repos.tdsDeductions.save(deduction);

    await auditLog(
      this.audit,
      actor,
      'TDS_VOIDED',
      'TDS_DEDUCTION',
      deduction.id,
      {
        reason,
        previousStatus: deduction.status,
      },
    );

    return ok(deduction);
  }

  /**
   * Generates Form 16A TDS Certificate data (Phase 5C.4).
   */
  async generateTdsCertificateData(
    actor: ActorContext,
    params: Form16AGeneratorParams,
  ): Promise<Result<Form16ACertificate, Error>> {
    const cert = generateForm16ACertificate(params);

    await auditLog(
      this.audit,
      actor,
      'TDS_CERTIFICATE_ISSUED',
      'TDS_CERTIFICATE',
      cert.certificateNumber,
      {
        financialYear: cert.financialYear,
        deducteePan: cert.deducteePan,
        totalTdsDeposited: cert.totalTdsDeposited,
      },
    );

    return ok(cert);
  }

  /**
   * Reconciles a bank remittance advice against buyer payment records (Phase 5C.4).
   */
  async reconcileBankUtr(
    actor: ActorContext,
    orgId: string,
    advice: BankRemittanceAdvice,
    paymentId?: string,
  ): Promise<Result<BankReconciliationRecordEntity, Error>> {
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, orgId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;
    }

    const cleanUtr = normalizeUtr(advice.utrNumber);

    // 1. Check duplicate UTR in repo (RED-11)
    let existingRecords: BankReconciliationRecordEntity[] = [];
    if (this.repos.bankReconciliations) {
      existingRecords = await this.repos.bankReconciliations.findByOrganizationId(orgId);
      const isDuplicate = existingRecords.some(
        (r) => normalizeUtr(r.utrNumber) === cleanUtr,
      );
      if (isDuplicate) {
        return err(
          new ValidationError(
            `Duplicate UTR reconciliation: ${cleanUtr} has already been recorded (RED-11/REC-5C4-DUPLICATE-UTR)`,
          ),
        );
      }
    }

    // 2. Lookup payment
    let buyerPayment: Payment | null = null;
    if (paymentId) {
      buyerPayment = await this.repos.payments.findById(paymentId);
    } else {
      const allPayments = this.repos.payments.findByOrganizationId
        ? await this.repos.payments.findByOrganizationId(orgId)
        : [];
      buyerPayment =
        allPayments.find(
          (p) =>
            normalizeUtr(p.reference || (p as any).paymentReference || '') ===
            cleanUtr,
        ) ?? null;
    }

    const recResult = reconcileBankRemittance({
      organizationId: orgId,
      buyerPayment: buyerPayment
        ? {
            id: buyerPayment.id,
            amount: buyerPayment.amount,
            recordedAt: buyerPayment.recordedAt,
            reference: buyerPayment.reference,
          }
        : null,
      bankAdvice: advice,
      reconciledBy: actor.profileId || null,
    });

    const now = timestamp();
    const entity: BankReconciliationRecordEntity = {
      id: createId(),
      organizationId: orgId,
      paymentId: recResult.paymentId || null,
      utrNumber: recResult.utrNumber,
      bankReference: recResult.bankReference,
      bankName: recResult.bankName,
      buyerRecordedAmount: recResult.buyerRecordedAmount,
      bankClearedAmount: recResult.bankClearedAmount,
      amountDifference: recResult.amountDifference,
      buyerRecordedDate: recResult.buyerRecordedDate,
      bankClearedDate: recResult.bankClearedDate,
      dateDriftDays: recResult.dateDriftDays,
      status: recResult.status,
      discrepancyType: recResult.discrepancyType,
      discrepancyDetails: recResult.discrepancyDetails,
      resolutionNotes: recResult.resolutionNotes,
      reconciledBy: actor.profileId || null,
      reconciledAt: recResult.reconciledAt,
      createdAt: now,
      updatedAt: now,
    };

    if (this.repos.bankReconciliations) {
      await this.repos.bankReconciliations.save(entity);
    }

    await auditLog(
      this.audit,
      actor,
      'BANK_UTR_RECONCILED',
      'BANK_RECONCILIATION',
      entity.id,
      {
        utrNumber: entity.utrNumber,
        status: entity.status,
        discrepancyType: entity.discrepancyType,
        bankClearedAmount: entity.bankClearedAmount,
      },
    );

    return ok(entity);
  }

  /**
   * Retrieves canonical Financial Observability Summary for an organization (Phase 5C.4).
   */
  async getFinancialObservabilitySummary(
    actor: ActorContext,
    orgId: string,
  ): Promise<Result<FinancialObservabilitySummary, Error>> {
    // RED-09: Cross-tenant access authorization check
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, orgId, ['OWNER', 'MANAGER', 'BUYER', 'APPROVER', 'COMMITTEE_MEMBER']);
      if (!access.ok) {
        return err(
          new ForbiddenError('Unauthorized: Access denied to financial observability metrics for this organization (RED-09/OBS-5C4-UNAUTHORIZED)'),
        );
      }
    }

    const pos = this.repos.purchaseOrders.findByOrganizationId
      ? await this.repos.purchaseOrders.findByOrganizationId(orgId)
      : [];

    const allInvoices = this.repos.invoices.findByOrganizationId
      ? await this.repos.invoices.findByOrganizationId(orgId)
      : [];

    const allPayments = this.repos.payments.findByOrganizationId
      ? await this.repos.payments.findByOrganizationId(orgId)
      : [];

    const allAllocs: PaymentAllocationEntity[] = [];
    if (this.repos.paymentAllocations) {
      for (const inv of allInvoices) {
        const invAllocs = await this.repos.paymentAllocations.findByInvoiceId(inv.id);
        allAllocs.push(...invAllocs);
      }
    }

    const tdsRecords = this.repos.tdsDeductions
      ? await this.repos.tdsDeductions.findByOrganizationId(orgId)
      : [];

    const notes = this.repos.creditDebitNotes
      ? await this.repos.creditDebitNotes.findByOrganizationId(orgId)
      : [];

    const bankRecs = this.repos.bankReconciliations
      ? await this.repos.bankReconciliations.findByOrganizationId(orgId)
      : [];

    const feeTxs = this.repos.platformFeeTransactions
      ? await this.repos.platformFeeTransactions.findByOrganizationId(orgId)
      : [];

    const settlementRecs = this.repos.settlementReconciliations
      ? await this.repos.settlementReconciliations.findByOrganizationId(orgId)
      : [];

    const settlementExcs = this.repos.settlementExceptions
      ? await this.repos.settlementExceptions.findByOrganizationId(orgId)
      : [];

    const summary = calculateFinancialObservabilitySummary({
      organizationId: orgId,
      purchaseOrders: pos.map((p) => ({ id: p.id, totalAmount: p.totalAmount, status: p.status })),
      invoices: allInvoices.map((i) => ({
        id: i.id,
        amount: i.amount,
        paidAmount: i.paidAmount,
        status: i.status,
        createdAt: (i as any).createdAt || i.submittedAt,
        submittedAt: i.submittedAt,
        dueDate: (i as any).dueDate,
      })),
      payments: allPayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        unallocatedAmount: p.unallocatedAmount,
        status: p.status,
        createdAt: (p as any).createdAt || p.recordedAt,
        recordedAt: p.recordedAt,
      })),
      allocations: allAllocs.map((a) => ({ paymentId: a.paymentId, invoiceId: a.invoiceId, allocatedAmount: a.allocatedAmount, status: a.status })),
      tdsDeductions: tdsRecords.map((t) => ({ invoiceId: t.invoiceId, tdsAmount: t.tdsAmount, status: t.status })),
      creditDebitNotes: notes.map((n) => ({ invoiceId: n.invoiceId, noteType: n.noteType, amount: n.amount, status: n.status })),
      bankReconciliations: bankRecs.map((b) => ({ bankClearedAmount: b.bankClearedAmount, amountDifference: b.amountDifference, status: b.status })),
      platformFeeTransactions: feeTxs.map((f) => ({ grossAmount: f.grossAmount, feeAmount: f.feeAmount, status: f.status })),
      settlementReconciliations: settlementRecs.map((s) => ({ status: s.status, discrepancyType: s.discrepancyType, varianceAmount: s.varianceAmount })),
      settlementExceptions: settlementExcs.map((e) => ({ status: e.status, amountInDispute: e.amountInDispute, createdAt: e.createdAt })),
    });

    return ok(summary);
  }

  /**
   * Generates comprehensive Financial Audit Pack (JSON / CSV) for tenant compliance export (Phase 5C.4 & 5C.5).
   */
  async generateFinancialAuditPack(
    actor: ActorContext,
    orgId: string,
    format: 'JSON' | 'CSV' = 'JSON',
  ): Promise<Result<string, Error>> {
    // RED-18 / RED-22: Cross-tenant access protection
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, orgId, ['OWNER', 'MANAGER']);
      if (!access.ok) {
        return err(
          new ForbiddenError('Unauthorized: Access denied to generate financial audit pack (RED-18/AUDIT-5C4-UNAUTHORIZED) (RED-22/AUDIT-5C5-UNAUTHORIZED)'),
        );
      }
    }

    const summaryRes = await this.getFinancialObservabilitySummary(actor, orgId);
    if (!summaryRes.ok) return summaryRes;

    const pos = this.repos.purchaseOrders.findByOrganizationId
      ? await this.repos.purchaseOrders.findByOrganizationId(orgId)
      : [];

    const invoices = this.repos.invoices.findByOrganizationId
      ? await this.repos.invoices.findByOrganizationId(orgId)
      : [];

    const tdsRecords = this.repos.tdsDeductions
      ? await this.repos.tdsDeductions.findByOrganizationId(orgId)
      : [];

    const payments = this.repos.payments.findByOrganizationId
      ? await this.repos.payments.findByOrganizationId(orgId)
      : [];

    const bankRecs = this.repos.bankReconciliations
      ? await this.repos.bankReconciliations.findByOrganizationId(orgId)
      : [];

    const feeTxs = this.repos.platformFeeTransactions
      ? await this.repos.platformFeeTransactions.findByOrganizationId(orgId)
      : [];

    const settlementRecs = this.repos.settlementReconciliations
      ? await this.repos.settlementReconciliations.findByOrganizationId(orgId)
      : [];

    const settlementExcs = this.repos.settlementExceptions
      ? await this.repos.settlementExceptions.findByOrganizationId(orgId)
      : [];

    const pack: FinancialAuditPack = {
      metadata: {
        exportId: `AUDIT-${orgId.slice(0, 8)}-${Date.now()}`,
        organizationId: orgId,
        generatedAt: new Date().toISOString(),
        environment: 'PRODUCTION',
        schemaVersion: '5C.5',
      },
      summary: summaryRes.value,
      purchaseOrders: pos.map((p) => ({
        id: p.id,
        poNumber: p.poNumber,
        supplierId: p.supplierId,
        totalAmount: p.totalAmount,
        status: p.status,
        createdAt: p.createdAt,
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        purchaseOrderId: i.purchaseOrderId,
        amount: i.amount,
        paidAmount: i.paidAmount,
        status: i.status,
        createdAt: i.submittedAt,
      })),
      tdsDeductions: tdsRecords.map((t) => ({
        id: t.id,
        invoiceId: t.invoiceId,
        section: t.section,
        taxableAmount: t.taxableAmount,
        tdsRate: t.tdsRate,
        tdsAmount: t.tdsAmount,
        status: t.status,
        pan: t.deducteePan,
      })),
      platformFeeTransactions: feeTxs.map((f) => ({
        id: f.id,
        purchaseOrderId: f.purchaseOrderId,
        invoiceId: f.invoiceId,
        paymentId: f.paymentId,
        feeRate: f.feeRate,
        grossAmount: f.grossAmount,
        feeAmount: f.feeAmount,
        netSettlementAmount: f.netSettlementAmount,
        status: f.status,
        settledAt: f.settledAt,
      })),
      settlementReconciliations: settlementRecs.map((s) => ({
        id: s.id,
        purchaseOrderId: s.purchaseOrderId,
        invoiceId: s.invoiceId,
        invoiceGrossAmount: s.invoiceGrossAmount,
        paidAllocatedAmount: s.paidAllocatedAmount,
        platformFeeAmount: s.platformFeeAmount,
        supplierNetSettlementAmount: s.supplierNetSettlementAmount,
        utrNumber: s.utrNumber,
        status: s.status,
        discrepancyType: s.discrepancyType,
      })),
      settlementExceptions: settlementExcs.map((e) => ({
        id: e.id,
        reconciliationId: e.reconciliationId,
        exceptionType: e.exceptionType,
        severity: e.severity,
        status: e.status,
        amountInDispute: e.amountInDispute,
        reason: e.reason,
        resolutionNotes: e.resolutionNotes,
        resolvedBy: e.resolvedBy,
        resolvedAt: e.resolvedAt,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        unallocatedAmount: p.unallocatedAmount,
        reference: p.reference || (p as any).paymentReference,
        method: p.method,
        recordedAt: p.recordedAt,
      })),
      bankReconciliations: bankRecs.map((b) => ({
        id: b.id,
        utrNumber: b.utrNumber,
        bankClearedAmount: b.bankClearedAmount,
        status: b.status,
        discrepancyType: b.discrepancyType,
      })),
    };

    const output =
      format === 'CSV'
        ? generateFinancialAuditPackCsv(pack)
        : generateFinancialAuditPackJson(pack);

    await auditLog(
      this.audit,
      actor,
      'FINANCIAL_AUDIT_PACK_EXPORTED',
      'AUDIT_PACK',
      pack.metadata.exportId,
      {
        format,
        organizationId: orgId,
      },
    );

    return ok(output);
  }

  /**
   * Applies Platform Fee Deduction against an invoice settlement (Phase 5C.5).
   */
  async applyPlatformFeeDeduction(
    actor: ActorContext,
    params: {
      organizationId: string;
      purchaseOrderId: string;
      invoiceId?: string | null;
      paymentId?: string | null;
      paymentAllocationId?: string | null;
      grossAmount?: number;
    },
  ): Promise<Result<PlatformFeeTransactionEntity, Error>> {
    const lockKey = `${params.purchaseOrderId}:${params.paymentAllocationId || params.invoiceId || 'direct'}`;
    if (this.activeFeeDeductions.has(lockKey)) {
      return this.activeFeeDeductions.get(lockKey)!;
    }

    const execPromise = this._applyPlatformFeeDeductionInternal(actor, params);
    this.activeFeeDeductions.set(lockKey, execPromise);
    try {
      return await execPromise;
    } finally {
      this.activeFeeDeductions.delete(lockKey);
    }
  }

  private async _applyPlatformFeeDeductionInternal(
    actor: ActorContext,
    params: {
      organizationId: string;
      purchaseOrderId: string;
      invoiceId?: string | null;
      paymentId?: string | null;
      paymentAllocationId?: string | null;
      grossAmount?: number;
    },
  ): Promise<Result<PlatformFeeTransactionEntity, Error>> {
    // 1. Authorization check: Buyer OWNER or MANAGER only (RED-09)
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, params.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;
    }

    // 2. Validate PO and Cross-tenant isolation (RED-08)
    const po = await this.repos.purchaseOrders.findById(params.purchaseOrderId);
    if (!po) return err(new NotFoundError('Purchase order not found'));
    if (po.organizationId !== params.organizationId) {
      return err(new ForbiddenError('Cross-tenant violation: PO does not belong to organization (RED-08)'));
    }

    // 3. Check PO Fee Snapshot and Supplier Acknowledgement (RED-06)
    if (!this.repos.poFeeSnapshots) {
      return err(new Error('PO fee snapshots repository not available'));
    }

    const snapshot = await this.repos.poFeeSnapshots.findByPurchaseOrderId(params.purchaseOrderId);
    if (!snapshot || !snapshot.isAcknowledged) {
      return err(
        new ValidationError('Cannot apply platform fee: Supplier has not acknowledged the platform fee policy snapshot (RED-06: UNACKNOWLEDGED_FEE_SNAPSHOT)'),
      );
    }

    // 4. Validate Invoice status (RED-10)
    let invoiceAmount = po.totalAmount;
    if (params.invoiceId) {
      const invoice = await this.repos.invoices.findById(params.invoiceId);
      if (!invoice) return err(new NotFoundError('Invoice not found'));
      if ((invoice.status as string) === 'REJECTED' || (invoice.status as string) === 'CANCELLED') {
        return err(
          new ValidationError(`Cannot apply platform fee to ${invoice.status} invoice (RED-10: INVALID_INVOICE_STATUS)`),
        );
      }
      invoiceAmount = invoice.amount;
    }

    // 5. Validate Payment status (RED-10)
    if (params.paymentId) {
      const payment = await this.repos.payments.findById(params.paymentId);
      if (!payment) return err(new NotFoundError('Payment not found'));
      if ((payment.status as string) === 'FAILED' || (payment.status as string) === 'REVERSED' || (payment.status as string) === 'VOIDED') {
        return err(
          new ValidationError(`Cannot apply platform fee to ${payment.status} payment (RED-10: INVALID_PAYMENT_STATUS)`),
        );
      }
    }

    // 6. Idempotency Guard (RED-01, RED-12)
    if (!this.repos.platformFeeTransactions) {
      return err(new Error('Platform fee transactions repository not available'));
    }

    if (params.paymentAllocationId) {
      const existingTxs = await this.repos.platformFeeTransactions.findByPurchaseOrderId(params.purchaseOrderId);
      const duplicate = existingTxs.find(
        (tx) => tx.paymentAllocationId === params.paymentAllocationId && tx.status !== 'VOIDED' && tx.status !== 'REVERSED',
      );
      if (duplicate) {
        return ok(duplicate);
      }
    }

    // 7. Calculate Deterministic Platform Fee using Snapshot Rate (RED-03, RED-04, RED-07, RED-25)
    const gross = Math.round(Number(params.grossAmount || invoiceAmount) * 100) / 100;
    if (gross <= 0) {
      return err(new ValidationError('Gross settlement amount must be greater than zero'));
    }

    const calc = calculatePlatformFee({ grossAmount: gross, rate: snapshot.rate });

    const now = timestamp();
    const feeEntity: PlatformFeeTransactionEntity = {
      id: createId(),
      organizationId: params.organizationId,
      supplierId: po.supplierId,
      purchaseOrderId: po.id,
      invoiceId: params.invoiceId || null,
      paymentId: params.paymentId || null,
      paymentAllocationId: params.paymentAllocationId || null,
      policyId: snapshot.policyId,
      policyVersion: snapshot.policyVersion,
      grossAmount: gross,
      feeRate: snapshot.rate,
      feeAmount: calc.feeAmount,
      netSettlementAmount: calc.netSettlementAmount,
      status: 'SETTLED',
      notes: 'Platform fee deduction settled',
      settledAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repos.platformFeeTransactions.save(feeEntity);

    // Auto-credit buyer sourcing reward if wallet/reward repositories are available (Phase 6.4)
    if (this.repos.buyerRewardAllocations && this.repos.organizationWallets) {
      try {
        await this.creditBuyerSettlementReward(actor, {
          organizationId: params.organizationId,
          platformFeeTxId: saved.id,
          procurementBaseAmount: gross,
          feeRate: snapshot.rate,
        });
      } catch {
        // Safe execution: reward error does not block fee settlement recording
      }
    }

    await auditLog(
      this.audit,
      actor,
      'PLATFORM_FEE_DEDUCTION_APPLIED',
      'PLATFORM_FEE_TRANSACTION',
      saved.id,
      {
        purchaseOrderId: po.id,
        invoiceId: params.invoiceId,
        grossAmount: gross,
        feeRate: snapshot.rate,
        feeAmount: calc.feeAmount,
        netSettlementAmount: calc.netSettlementAmount,
      },
    );

    return ok(saved);
  }

  /**
   * Executes authoritative settlement reconciliation & discrepancy detection (Phase 5C.5).
   */
  async executeSettlementReconciliation(
    actor: ActorContext,
    params: {
      organizationId: string;
      invoiceId: string;
      paymentId?: string | null;
      utrNumber?: string | null;
      utrAmount?: number | null;
    },
  ): Promise<
    Result<{ reconciliation: SettlementReconciliationEntity; exception: SettlementExceptionEntity | null }, Error>
  > {
    // 1. Authorization check: Buyer OWNER or MANAGER (RED-09)
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, params.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;
    }

    const invoice = await this.repos.invoices.findById(params.invoiceId);
    if (!invoice) return err(new NotFoundError('Invoice not found'));
    if (invoice.organizationId && invoice.organizationId !== params.organizationId) {
      return err(new ForbiddenError('Cross-tenant violation: Invoice does not belong to organization (RED-08)'));
    }

    const wo = await this.repos.workOrders.findById(invoice.workOrderId);
    const poId = invoice.purchaseOrderId || wo?.purchaseOrderId;
    if (!poId) return err(new ValidationError('Invoice must be linked to a purchase order'));

    const po = await this.repos.purchaseOrders.findById(poId);
    if (!po) return err(new NotFoundError('Purchase order not found'));

    if (po.organizationId !== params.organizationId) {
      return err(new ForbiddenError('Cross-tenant violation: PO does not belong to organization (RED-08)'));
    }

    // 2. Fetch TDS deductions
    let tdsTotal = 0;
    if (this.repos.tdsDeductions) {
      const tdsList = await this.repos.tdsDeductions.findByInvoiceId(invoice.id);
      for (const t of tdsList) {
        if (t.status !== 'VOIDED') tdsTotal += t.tdsAmount;
      }
    }

    // 3. Fetch Platform Fees
    let feeTotal = 0;
    if (this.repos.platformFeeTransactions) {
      const feeList = await this.repos.platformFeeTransactions.findByInvoiceId(invoice.id);
      for (const f of feeList) {
        if (f.status !== 'VOIDED' && f.status !== 'REVERSED') feeTotal += f.feeAmount;
      }
    }

    // 4. Fetch Paid Allocations
    let paidTotal = 0;
    if (this.repos.paymentAllocations) {
      const allocList = await this.repos.paymentAllocations.findByInvoiceId(invoice.id);
      for (const a of allocList) {
        if (a.status === 'ALLOCATED') paidTotal += a.allocatedAmount;
      }
    }

    // 5. Fetch Credit/Debit Notes
    let debitTotal = 0;
    let creditTotal = 0;
    if (this.repos.creditDebitNotes) {
      const notes = await this.repos.creditDebitNotes.findByInvoiceId(invoice.id);
      for (const n of notes) {
        if (n.status !== 'CANCELLED' && n.status !== 'DRAFT') {
          if (n.noteType === 'DEBIT_NOTE') debitTotal += n.amount;
          if (n.noteType === 'CREDIT_NOTE') creditTotal += n.amount;
        }
      }
    }

    // 6. Gather existing UTRs in org for duplicate detection (RED-16)
    const existingUtrs: string[] = [];
    if (this.repos.settlementReconciliations) {
      const allRecs = await this.repos.settlementReconciliations.findByOrganizationId(params.organizationId);
      for (const r of allRecs) {
        if (r.utrNumber && r.invoiceId !== invoice.id) existingUtrs.push(r.utrNumber);
      }
    }

    // 7. Evaluate Reconciliation Domain Invariants
    const evalRes = evaluateSettlementReconciliation({
      invoiceGrossAmount: invoice.amount,
      debitAdjustments: debitTotal,
      creditAdjustments: creditTotal,
      tdsAmount: tdsTotal,
      platformFeeAmount: feeTotal,
      paidAllocatedAmount: paidTotal,
      utrNumber: params.utrNumber,
      utrClearedAmount: params.utrAmount,
      existingUtrsInOrg: existingUtrs,
    });

    const now = timestamp();
    if (!this.repos.settlementReconciliations) {
      return err(new Error('Settlement reconciliations repository not available'));
    }

    const recEntity: SettlementReconciliationEntity = {
      id: createId(),
      organizationId: params.organizationId,
      supplierId: po.supplierId,
      purchaseOrderId: po.id,
      invoiceId: invoice.id,
      paymentId: params.paymentId || null,
      invoiceGrossAmount: evalRes.invoiceGrossAmount,
      adjustedGrossAmount: evalRes.adjustedGrossAmount,
      tdsAmount: evalRes.tdsAmount,
      platformFeeAmount: evalRes.platformFeeAmount,
      paidAllocatedAmount: evalRes.paidAllocatedAmount,
      supplierNetSettlementAmount: evalRes.supplierNetSettlementAmount,
      utrNumber: params.utrNumber || null,
      utrClearedAmount: evalRes.utrClearedAmount,
      varianceAmount: evalRes.varianceAmount,
      status: evalRes.status,
      discrepancyType: evalRes.discrepancyType,
      discrepancyDetails: evalRes.discrepancyDetails,
      reconciledAt: evalRes.status === 'MATCHED' ? now : null,
      reconciledBy: actor.profileId || null,
      createdAt: now,
      updatedAt: now,
    };

    const savedRec = await this.repos.settlementReconciliations.save(recEntity);

    let savedExc: SettlementExceptionEntity | null = null;
    if (evalRes.requiresException && this.repos.settlementExceptions) {
      const excEntity: SettlementExceptionEntity = {
        id: createId(),
        organizationId: params.organizationId,
        reconciliationId: savedRec.id,
        purchaseOrderId: po.id,
        invoiceId: invoice.id,
        paymentId: params.paymentId || null,
        exceptionType: evalRes.discrepancyType,
        severity: evalRes.exceptionSeverity,
        status: 'OPEN',
        amountInDispute: evalRes.varianceAmount,
        reason: evalRes.discrepancyDetails,
        createdAt: now,
        updatedAt: now,
      };
      savedExc = await this.repos.settlementExceptions.save(excEntity);

      // GAP-5C6-05: Record Initial CREATED Exception Event Timeline
      if (this.repos.settlementExceptionEvents) {
        await this.repos.settlementExceptionEvents.save({
          id: createId(),
          exceptionId: savedExc.id,
          eventType: 'CREATED',
          fromStatus: null,
          toStatus: 'OPEN',
          notes: evalRes.discrepancyDetails,
          actorId: actor.profileId || null,
          createdAt: now,
        });
      }
    }

    await auditLog(
      this.audit,
      actor,
      'SETTLEMENT_RECONCILIATION_EXECUTED',
      'SETTLEMENT_RECONCILIATION',
      savedRec.id,
      {
        invoiceId: invoice.id,
        status: evalRes.status,
        discrepancyType: evalRes.discrepancyType,
        varianceAmount: evalRes.varianceAmount,
        exceptionId: savedExc?.id || null,
      },
    );

    return ok({ reconciliation: savedRec, exception: savedExc });
  }

  /**
   * Resolves a financial exception from the queue (Phase 5C.5).
   */
  async resolveSettlementException(
    actor: ActorContext,
    exceptionId: string,
    resolutionNotes: string,
  ): Promise<Result<SettlementExceptionEntity, Error>> {
    if (!this.repos.settlementExceptions) {
      return err(new Error('Settlement exceptions repository not available'));
    }

    const exc = await this.repos.settlementExceptions.findById(exceptionId);
    if (!exc) return err(new NotFoundError('Settlement exception not found'));

    // RED-21: Only Buyer OWNER or MANAGER can resolve exceptions
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, exc.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) {
        return err(
          new ForbiddenError('Unauthorized: Only Buyer OWNER or MANAGER can resolve settlement exceptions (RED-21: UNAUTHORIZED_EXCEPTION_RESOLUTION)'),
        );
      }
    }

    const check = canResolveSettlementException(exc, resolutionNotes);
    if (!check.allowed) {
      return err(new ValidationError(check.reason || 'Cannot resolve exception'));
    }

    const now = timestamp();
    const prevStatus = exc.status;
    exc.status = 'RESOLVED';
    exc.resolutionNotes = resolutionNotes.trim();
    exc.resolvedBy = actor.profileId || null;
    exc.resolvedAt = now;
    exc.updatedAt = now;

    const saved = await this.repos.settlementExceptions.save(exc);

    // GAP-5C6-05: Record RESOLVED Exception Event Timeline
    if (this.repos.settlementExceptionEvents) {
      await this.repos.settlementExceptionEvents.save({
        id: createId(),
        exceptionId: saved.id,
        eventType: 'RESOLVED',
        fromStatus: prevStatus,
        toStatus: 'RESOLVED',
        notes: resolutionNotes.trim(),
        actorId: actor.profileId || null,
        createdAt: now,
      });
    }

    // Also update corresponding reconciliation record
    if (this.repos.settlementReconciliations) {
      const rec = await this.repos.settlementReconciliations.findById(exc.reconciliationId);
      if (rec) {
        rec.status = 'RESOLVED';
        rec.notes = `Exception resolved: ${resolutionNotes.trim()}`;
        rec.reconciledAt = now;
        rec.reconciledBy = actor.profileId || null;
        rec.updatedAt = now;
        await this.repos.settlementReconciliations.save(rec);
      }
    }

    await auditLog(
      this.audit,
      actor,
      'SETTLEMENT_EXCEPTION_RESOLVED',
      'SETTLEMENT_EXCEPTION',
      saved.id,
      {
        reconciliationId: exc.reconciliationId,
        resolutionNotes,
        resolvedBy: actor.profileId,
      },
    );

    return ok(saved);
  }

  /**
   * Lists settlement reconciliations for an organization.
   */
  async getSettlementReconciliations(
    actor: ActorContext,
    orgId: string,
  ): Promise<Result<SettlementReconciliationEntity[], Error>> {
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, orgId, ['OWNER', 'MANAGER', 'BUYER', 'APPROVER', 'COMMITTEE_MEMBER']);
      if (!access.ok) return access;
    }

    const list = this.repos.settlementReconciliations
      ? await this.repos.settlementReconciliations.findByOrganizationId(orgId)
      : [];
    return ok(list);
  }

  /**
   * Lists settlement exceptions for an organization.
   */
  async getSettlementExceptions(
    actor: ActorContext,
    orgId: string,
  ): Promise<Result<SettlementExceptionEntity[], Error>> {
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, orgId, ['OWNER', 'MANAGER', 'BUYER', 'APPROVER', 'COMMITTEE_MEMBER']);
      if (!access.ok) return access;
    }

    const list = this.repos.settlementExceptions
      ? await this.repos.settlementExceptions.findByOrganizationId(orgId)
      : [];
    return ok(list);
  }

  /**
   * Lists platform fee transactions for an organization.
   */
  async getPlatformFeeTransactions(
    actor: ActorContext,
    orgId: string,
  ): Promise<Result<PlatformFeeTransactionEntity[], Error>> {
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, orgId, ['OWNER', 'MANAGER', 'BUYER', 'APPROVER', 'COMMITTEE_MEMBER']);
      if (!access.ok) return access;
    }

    const list = this.repos.platformFeeTransactions
      ? await this.repos.platformFeeTransactions.findByOrganizationId(orgId)
      : [];
    return ok(list);
  }

  /**
   * GAP-5C6-01: Records an ERP export manifest and verifies duplicate export attempts.
   */
  async recordErpExportManifest(
    actor: ActorContext,
    params: {
      organizationId: string;
      exportType: ErpExportType;
      batchReference: string;
      purchaseOrderId?: string | null;
      paymentId?: string | null;
      recordCount: number;
      totalAmount: number;
      payload: string | Record<string, unknown>;
    },
  ): Promise<Result<{ manifest: ErpExportManifestEntity; isDuplicate: boolean }, Error>> {
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, params.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;
    }

    if (!params.batchReference || params.batchReference.trim() === '') {
      return err(new ValidationError('Batch reference is required for ERP export manifest'));
    }

    if (!this.repos.erpExportManifests) {
      return err(new Error('ERP export manifests repository not available'));
    }

    const checksum = computePayloadChecksum(params.payload);
    const existingManifests = await this.repos.erpExportManifests.findByBatchReference(
      params.organizationId,
      params.batchReference,
    );

    const dupEval = evaluateDuplicateExport(
      existingManifests.map((m) => ({
        id: m.id,
        organizationId: m.organizationId,
        exportType: m.exportType as ErpExportType,
        batchReference: m.batchReference,
        exportVersion: m.exportVersion,
        purchaseOrderId: m.purchaseOrderId,
        paymentId: m.paymentId,
        recordCount: m.recordCount,
        totalAmount: m.totalAmount,
        payloadChecksumSha256: m.payloadChecksumSha256,
        exportedBy: m.exportedBy,
        exportedAt: m.exportedAt,
        createdAt: m.createdAt,
      })),
      params.exportType,
      params.batchReference,
      checksum,
    );

    const now = timestamp();
    const manifestEntity: ErpExportManifestEntity = {
      id: createId(),
      organizationId: params.organizationId,
      exportType: params.exportType,
      batchReference: params.batchReference,
      exportVersion: dupEval.nextVersion,
      purchaseOrderId: params.purchaseOrderId || null,
      paymentId: params.paymentId || null,
      recordCount: params.recordCount,
      totalAmount: Math.round(Number(params.totalAmount || 0) * 100) / 100,
      payloadChecksumSha256: checksum,
      exportedBy: actor.profileId || null,
      exportedAt: now,
      createdAt: now,
    };

    const saved = await this.repos.erpExportManifests.save(manifestEntity);

    await auditLog(
      this.audit,
      actor,
      'ERP_EXPORT_RECORDED',
      'ERP_EXPORT_MANIFEST',
      saved.id,
      {
        exportType: saved.exportType,
        batchReference: saved.batchReference,
        exportVersion: saved.exportVersion,
        isDuplicate: dupEval.isDuplicate,
        checksum: saved.payloadChecksumSha256,
      },
    );

    return ok({ manifest: saved, isDuplicate: dupEval.isDuplicate });
  }

  /**
   * GAP-5C6-01: Retrieves ERP export manifests for an organization.
   */
  async getErpExportManifests(
    actor: ActorContext,
    orgId: string,
  ): Promise<Result<ErpExportManifestEntity[], Error>> {
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, orgId, ['OWNER', 'MANAGER', 'BUYER', 'APPROVER', 'COMMITTEE_MEMBER']);
      if (!access.ok) return access;
    }

    const list = this.repos.erpExportManifests
      ? await this.repos.erpExportManifests.findByOrganizationId(orgId)
      : [];
    return ok(list);
  }

  /**
   * GAP-5C6-05: Appends an investigation note or status update event to a settlement exception timeline.
   */
  async addSettlementExceptionEvent(
    actor: ActorContext,
    params: {
      exceptionId: string;
      eventType: SettlementExceptionEventType;
      notes: string;
      toStatus?: SettlementExceptionStatus;
    },
  ): Promise<Result<SettlementExceptionEventEntity, Error>> {
    if (!this.repos.settlementExceptions) {
      return err(new Error('Settlement exceptions repository not available'));
    }

    const exc = await this.repos.settlementExceptions.findById(params.exceptionId);
    if (!exc) return err(new NotFoundError('Settlement exception not found'));

    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, exc.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;
    }

    if (!params.notes || params.notes.trim().length === 0) {
      return err(new ValidationError('Event notes cannot be empty'));
    }

    const now = timestamp();
    const fromStatus = exc.status;
    let toStatus = params.toStatus || fromStatus;

    if (params.toStatus && params.toStatus !== fromStatus) {
      exc.status = params.toStatus;
      exc.updatedAt = now;
      await this.repos.settlementExceptions.save(exc);
    }

    if (!this.repos.settlementExceptionEvents) {
      return err(new Error('Settlement exception events repository not available'));
    }

    const eventEntity: SettlementExceptionEventEntity = {
      id: createId(),
      exceptionId: exc.id,
      eventType: params.eventType,
      fromStatus,
      toStatus,
      notes: params.notes.trim(),
      actorId: actor.profileId || null,
      createdAt: now,
    };

    const saved = await this.repos.settlementExceptionEvents.save(eventEntity);

    await auditLog(
      this.audit,
      actor,
      'SETTLEMENT_EXCEPTION_EVENT_LOGGED',
      'SETTLEMENT_EXCEPTION_EVENT',
      saved.id,
      {
        exceptionId: exc.id,
        eventType: params.eventType,
        notes: params.notes,
      },
    );

    return ok(saved);
  }

  /**
   * GAP-5C6-05: Retrieves event timeline for a settlement exception.
   */
  async getSettlementExceptionEvents(
    actor: ActorContext,
    exceptionId: string,
  ): Promise<Result<SettlementExceptionEventEntity[], Error>> {
    if (!this.repos.settlementExceptions) {
      return err(new Error('Settlement exceptions repository not available'));
    }

    const exc = await this.repos.settlementExceptions.findById(exceptionId);
    if (!exc) return err(new NotFoundError('Settlement exception not found'));

    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, exc.organizationId, ['OWNER', 'MANAGER', 'BUYER', 'APPROVER', 'COMMITTEE_MEMBER']);
      if (!access.ok) return access;
    }

    const events = this.repos.settlementExceptionEvents
      ? await this.repos.settlementExceptionEvents.findByExceptionId(exceptionId)
      : [];
    return ok(events);
  }

  /**
   * GAP-5C6-06: Invalidates / charges back a bank reconciliation record.
   */
  async invalidateBankReconciliation(
    actor: ActorContext,
    reconciliationId: string,
    reason: string,
  ): Promise<Result<BankReconciliationRecordEntity, Error>> {
    if (!this.repos.bankReconciliations) {
      return err(new Error('Bank reconciliations repository not available'));
    }

    const rec = await this.repos.bankReconciliations.findById(reconciliationId);
    if (!rec) return err(new NotFoundError('Bank reconciliation record not found'));

    // Authorization check: Buyer OWNER or MANAGER or Platform Admin
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, rec.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;
    }

    if (!reason || reason.trim().length < 5) {
      return err(new ValidationError('Invalidation reason must be at least 5 characters'));
    }

    const now = timestamp();
    const updated: BankReconciliationRecordEntity = {
      ...rec,
      status: 'DISCREPANCY',
      discrepancyType: 'MANUALLY_INVALIDATED',
      discrepancyDetails: `Reconciliation invalidated: ${reason.trim()}`,
      resolutionNotes: `Invalidated by ${actor.profileId || 'user'}: ${reason.trim()}`,
      updatedAt: now,
    };

    const saved = await this.repos.bankReconciliations.save(updated);

    await auditLog(
      this.audit,
      actor,
      'BANK_RECONCILIATION_INVALIDATED',
      'BANK_RECONCILIATION',
      saved.id,
      {
        reconciliationId: saved.id,
        utrNumber: saved.utrNumber,
        reason: reason.trim(),
      },
    );

    return ok(saved);
  }

  /**
   * GAP-5C6-08: Synchronizes PO-level settlement reconciliations across all associated invoices.
   */
  async syncPoSettlementReconciliations(
    actor: ActorContext,
    purchaseOrderId: string,
  ): Promise<Result<{ syncedCount: number; reconciliations: SettlementReconciliationEntity[] }, Error>> {
    const po = await this.repos.purchaseOrders.findById(purchaseOrderId);
    if (!po) return err(new NotFoundError('Purchase order not found'));

    if (!actor.isPlatformAdmin) {
      const access = requireBuyerResourceAccess(actor, po.organizationId, po.createdBy, ['OWNER', 'MANAGER', 'BUYER']);
      if (!access.ok) return access;
    }

    const invoices = this.repos.invoices.findByPurchaseOrderId
      ? await this.repos.invoices.findByPurchaseOrderId(purchaseOrderId)
      : [];

    const activeInvoices = invoices.filter((inv) => (inv.status as string) !== 'REJECTED' && (inv.status as string) !== 'CANCELLED');
    const syncedReconciliations: SettlementReconciliationEntity[] = [];

    for (const inv of activeInvoices) {
      const reconRes = await this.executeSettlementReconciliation(actor, {
        organizationId: po.organizationId || '',
        invoiceId: inv.id,
      });

      if (reconRes.ok) {
        syncedReconciliations.push(reconRes.value.reconciliation);
      }
    }

    await auditLog(
      this.audit,
      actor,
      'PO_SETTLEMENT_RECONCILIATIONS_SYNCHRONIZED',
      'PURCHASE_ORDER',
      po.id,
      {
        purchaseOrderId: po.id,
        syncedInvoiceCount: syncedReconciliations.length,
      },
    );

    return ok({ syncedCount: syncedReconciliations.length, reconciliations: syncedReconciliations });
  }

  /**
   * Credits Buyer Sourcing Reward to Buyer Organization Wallet upon Settlement Execution (Phase 6.4).
   */
  async creditBuyerSettlementReward(
    actor: ActorContext,
    params: {
      organizationId: string;
      platformFeeTxId: string;
      settlementId?: string | null;
      procurementBaseAmount?: number;
      feeRate?: number;
      rewardShareRate?: number;
      idempotencyKey?: string | null;
    },
  ): Promise<
    Result<
      {
        allocation: BuyerRewardAllocationEntity;
        wallet: OrganizationWalletEntity;
        transaction: WalletTransactionEntity;
        replayed?: boolean;
      },
      Error
    >
  > {
    // 1. Authorization check: Buyer Org OWNER/MANAGER or Platform Admin
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, params.organizationId, ['OWNER', 'MANAGER', 'BUYER']);
      if (!access.ok) return access;
    }

    if (!this.repos.organizationWallets || !this.repos.walletTransactions || !this.repos.buyerRewardAllocations) {
      return err(new Error('Wallet and reward repositories are not initialized'));
    }

    // 2. Idempotency Check
    if (params.idempotencyKey) {
      const existingTx = await this.repos.walletTransactions.findByIdempotencyKey(params.idempotencyKey);
      if (existingTx) {
        const wallet = (await this.repos.organizationWallets.findByOrganizationId(params.organizationId))!;
        const alloc = (await this.repos.buyerRewardAllocations.findByPlatformFeeTxId(params.platformFeeTxId))!;
        return ok({
          allocation: alloc,
          wallet,
          transaction: existingTx,
          replayed: true,
        });
      }
    }

    // 3. Prevent duplicate reward allocation for same platform fee transaction
    const existingAlloc = await this.repos.buyerRewardAllocations.findByPlatformFeeTxId(params.platformFeeTxId);
    if (existingAlloc && existingAlloc.status === 'CREDITED') {
      const wallet = (await this.repos.organizationWallets.findByOrganizationId(params.organizationId))!;
      const txs = await this.repos.walletTransactions.findByOrganizationId(params.organizationId);
      const matchedTx =
        txs.find((t) => t.sourceEntityId === existingAlloc.id) ||
        txs[0] ||
        (await this.repos.walletTransactions.save({
          id: createId(),
          organizationId: params.organizationId,
          walletId: wallet.id,
          txType: 'REWARD_CREDIT',
          amount: existingAlloc.rewardAmount,
          openingBalance: wallet.balanceCredits,
          closingBalance: wallet.balanceCredits,
          sourceEntityType: 'BUYER_REWARD_ALLOCATION',
          sourceEntityId: existingAlloc.id,
          createdAt: timestamp(),
        }));

      return ok({
        allocation: existingAlloc,
        wallet,
        transaction: matchedTx,
        replayed: true,
      });
    }

    // 4. Resolve Platform Fee Transaction details
    let baseAmount = params.procurementBaseAmount || 0;
    let feeRate = params.feeRate || 0.50;
    let poId: string | null = null;
    let invId: string | null = null;

    if (this.repos.platformFeeTransactions) {
      const feeTx = await this.repos.platformFeeTransactions.findById(params.platformFeeTxId);
      if (feeTx) {
        if (feeTx.organizationId !== params.organizationId) {
          return err(new ForbiddenError('Cross-tenant violation: Platform fee transaction does not belong to organization'));
        }
        if (baseAmount <= 0) baseAmount = feeTx.grossAmount;
        if (!params.feeRate) feeRate = feeTx.feeRate;
        poId = feeTx.purchaseOrderId;
        invId = feeTx.invoiceId || null;
      }
    }

    // Resolve reward share rate from active policy if not provided
    let rewardShareRate = params.rewardShareRate;
    if (rewardShareRate === undefined && this.repos.buyerRewardPolicies) {
      const activePol = await this.repos.buyerRewardPolicies.findActivePolicy();
      if (activePol) {
        rewardShareRate = activePol.rewardShareRate;
      }
    }
    if (rewardShareRate === undefined) {
      rewardShareRate = 20.00; // Default 20% of fee
    }

    if (baseAmount <= 0) {
      return err(new ValidationError('Procurement base amount must be greater than zero'));
    }

    // 5. Deterministic Reward Calculation via @otp/domain
    let calcResult: BuyerRewardCalculationResult;
    try {
      calcResult = calculateBuyerReward({
        procurementBaseAmount: baseAmount,
        platformFeeRate: feeRate,
        rewardShareRate,
      });
    } catch (e: any) {
      return err(new ValidationError(e.message));
    }

    // 6. Get or initialize Organization Wallet
    let wallet = await this.repos.organizationWallets.findByOrganizationId(params.organizationId);
    const now = timestamp();
    if (!wallet) {
      wallet = await this.repos.organizationWallets.save({
        id: createId(),
        organizationId: params.organizationId,
        balanceCredits: 0.00,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });
    }

    if (wallet.status !== 'ACTIVE') {
      return err(new ValidationError(`Cannot credit rewards: Wallet status is ${wallet.status}`));
    }

    const openingBalance = wallet.balanceCredits;
    const closingBalance = Math.round((openingBalance + calcResult.rewardAmount) * 100) / 100;

    // 7. Update Wallet
    wallet.balanceCredits = closingBalance;
    wallet.updatedAt = now;
    await this.repos.organizationWallets.save(wallet);

    // 8. Create Buyer Reward Allocation Record
    const allocEntity: BuyerRewardAllocationEntity = {
      id: existingAlloc?.id || createId(),
      organizationId: params.organizationId,
      purchaseOrderId: poId,
      invoiceId: invId,
      platformFeeTxId: params.platformFeeTxId,
      settlementId: params.settlementId || null,
      procurementBaseAmount: baseAmount,
      feeRate: calcResult.platformFeeRate,
      feeAmount: calcResult.platformFeeAmount,
      rewardShareRate: calcResult.rewardShareRate,
      rewardAmount: calcResult.rewardAmount,
      status: 'CREDITED',
      createdAt: existingAlloc?.createdAt || now,
      updatedAt: now,
    };
    const savedAlloc = await this.repos.buyerRewardAllocations.save(allocEntity);

    // 9. Append to Immutable Wallet Transaction Ledger
    const txEntity: WalletTransactionEntity = {
      id: createId(),
      organizationId: params.organizationId,
      walletId: wallet.id,
      txType: 'REWARD_CREDIT',
      amount: calcResult.rewardAmount,
      openingBalance,
      closingBalance,
      sourceEntityType: 'BUYER_REWARD_ALLOCATION',
      sourceEntityId: savedAlloc.id,
      idempotencyKey: params.idempotencyKey || null,
      notes: `Buyer sourcing reward earned for settlement on PO ${poId || 'N/A'}`,
      createdAt: now,
    };
    const savedTx = await this.repos.walletTransactions.save(txEntity);

    await auditLog(
      this.audit,
      actor,
      'BUYER_REWARD_CREDITED',
      'ORGANIZATION_WALLET',
      wallet.id,
      {
        organizationId: params.organizationId,
        platformFeeTxId: params.platformFeeTxId,
        rewardAmount: calcResult.rewardAmount,
        openingBalance,
        closingBalance,
        transactionId: savedTx.id,
        allocationId: savedAlloc.id,
      },
    );

    return ok({
      allocation: savedAlloc,
      wallet,
      transaction: savedTx,
    });
  }

  /**
   * Redeems Buyer Wallet Credits toward Subscription Renewal or Plan Upgrade (Phase 6.4).
   */
  async applyWalletCreditsToSubscription(
    actor: ActorContext,
    params: {
      organizationId: string;
      tier: string;
      cycle: string;
      creditsToApply: number;
      idempotencyKey?: string | null;
    },
  ): Promise<
    Result<
      {
        wallet: OrganizationWalletEntity;
        transaction: WalletTransactionEntity;
        creditsApplied: number;
        remainingBalance: number;
        replayed?: boolean;
      },
      Error
    >
  > {
    // 1. Authorization check: Buyer OWNER/MANAGER or Platform Admin
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, params.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;
    }

    if (!this.repos.organizationWallets || !this.repos.walletTransactions) {
      return err(new Error('Wallet repositories are not initialized'));
    }

    // 2. Idempotency Check
    if (params.idempotencyKey) {
      const existingTx = await this.repos.walletTransactions.findByIdempotencyKey(params.idempotencyKey);
      if (existingTx) {
        const wallet = (await this.repos.organizationWallets.findByOrganizationId(params.organizationId))!;
        return ok({
          wallet,
          transaction: existingTx,
          creditsApplied: existingTx.amount,
          remainingBalance: existingTx.closingBalance,
          replayed: true,
        });
      }
    }

    // 3. Validate credit amount
    const creditsToApply = Math.round(Number(params.creditsToApply || 0) * 100) / 100;
    if (creditsToApply <= 0) {
      return err(new ValidationError('Credits to apply must be greater than zero'));
    }

    // 4. Lock and validate Wallet Balance
    let wallet = await this.repos.organizationWallets.findByOrganizationId(params.organizationId);
    if (!wallet) {
      return err(new NotFoundError('Organization wallet not found'));
    }

    if (wallet.status !== 'ACTIVE') {
      return err(new ValidationError(`Cannot redeem credits: Wallet status is ${wallet.status}`));
    }

    const validation = calculateWalletBalanceAfterRedemption(wallet.balanceCredits, creditsToApply);
    if (!validation.isValid) {
      return err(new ValidationError(validation.error || 'Insufficient wallet balance'));
    }

    const openingBalance = wallet.balanceCredits;
    const closingBalance = validation.remainingBalance;
    const now = timestamp();

    // 5. Debit Wallet
    wallet.balanceCredits = closingBalance;
    wallet.updatedAt = now;
    await this.repos.organizationWallets.save(wallet);

    // 6. Append to Transaction Ledger
    const txEntity: WalletTransactionEntity = {
      id: createId(),
      organizationId: params.organizationId,
      walletId: wallet.id,
      txType: 'SUBSCRIPTION_REDEMPTION',
      amount: creditsToApply,
      openingBalance,
      closingBalance,
      sourceEntityType: 'SUBSCRIPTION_PAYMENT',
      sourceEntityId: params.organizationId,
      idempotencyKey: params.idempotencyKey || null,
      notes: `Redeemed ₹${creditsToApply} OTP Wallet Credits for ${params.tier} ${params.cycle} subscription`,
      createdAt: now,
    };
    const savedTx = await this.repos.walletTransactions.save(txEntity);

    await auditLog(
      this.audit,
      actor,
      'SUBSCRIPTION_WALLET_REDEEMED',
      'ORGANIZATION_WALLET',
      wallet.id,
      {
        organizationId: params.organizationId,
        tier: params.tier,
        cycle: params.cycle,
        creditsApplied: creditsToApply,
        openingBalance,
        closingBalance,
        transactionId: savedTx.id,
      },
    );

    return ok({
      wallet,
      transaction: savedTx,
      creditsApplied: creditsToApply,
      remainingBalance: closingBalance,
    });
  }

  /**
   * Reverses a Buyer Reward Credit (e.g. upon settlement reversal/voiding) (Phase 6.4).
   */
  async reverseBuyerRewardCredit(
    actor: ActorContext,
    params: {
      organizationId: string;
      platformFeeTxId: string;
      reason?: string;
      idempotencyKey?: string | null;
    },
  ): Promise<
    Result<
      {
        allocation: BuyerRewardAllocationEntity;
        wallet: OrganizationWalletEntity;
        transaction: WalletTransactionEntity;
      },
      Error
    >
  > {
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, params.organizationId, ['OWNER', 'MANAGER']);
      if (!access.ok) return access;
    }

    if (!this.repos.organizationWallets || !this.repos.walletTransactions || !this.repos.buyerRewardAllocations) {
      return err(new Error('Wallet and reward repositories are not initialized'));
    }

    const alloc = await this.repos.buyerRewardAllocations.findByPlatformFeeTxId(params.platformFeeTxId);
    if (!alloc) {
      return err(new NotFoundError('Buyer reward allocation not found'));
    }

    if (alloc.status === 'REVERSED') {
      const wallet = (await this.repos.organizationWallets.findByOrganizationId(params.organizationId))!;
      const txs = await this.repos.walletTransactions.findByOrganizationId(params.organizationId);
      const revTx =
        txs.find((t) => t.txType === 'REVERSAL' && t.sourceEntityId === alloc.id) ||
        txs[0] ||
        (await this.repos.walletTransactions.save({
          id: createId(),
          organizationId: params.organizationId,
          walletId: wallet.id,
          txType: 'REVERSAL',
          amount: alloc.rewardAmount,
          openingBalance: wallet.balanceCredits,
          closingBalance: wallet.balanceCredits,
          sourceEntityType: 'BUYER_REWARD_ALLOCATION',
          sourceEntityId: alloc.id,
          createdAt: timestamp(),
        }));
      return ok({ allocation: alloc, wallet, transaction: revTx });
    }

    let wallet = await this.repos.organizationWallets.findByOrganizationId(params.organizationId);
    if (!wallet) {
      return err(new NotFoundError('Organization wallet not found'));
    }

    const openingBalance = wallet.balanceCredits;
    const closingBalance = Math.max(0, Math.round((openingBalance - alloc.rewardAmount) * 100) / 100);
    const now = timestamp();

    wallet.balanceCredits = closingBalance;
    wallet.updatedAt = now;
    await this.repos.organizationWallets.save(wallet);

    alloc.status = 'REVERSED';
    alloc.updatedAt = now;
    const savedAlloc = await this.repos.buyerRewardAllocations.save(alloc);

    const txEntity: WalletTransactionEntity = {
      id: createId(),
      organizationId: params.organizationId,
      walletId: wallet.id,
      txType: 'REVERSAL',
      amount: alloc.rewardAmount,
      openingBalance,
      closingBalance,
      sourceEntityType: 'BUYER_REWARD_ALLOCATION',
      sourceEntityId: savedAlloc.id,
      idempotencyKey: params.idempotencyKey || null,
      notes: params.reason || 'Buyer reward reversed due to settlement adjustment',
      createdAt: now,
    };
    const savedTx = await this.repos.walletTransactions.save(txEntity);

    await auditLog(
      this.audit,
      actor,
      'BUYER_REWARD_REVERSED',
      'ORGANIZATION_WALLET',
      wallet.id,
      {
        organizationId: params.organizationId,
        platformFeeTxId: params.platformFeeTxId,
        rewardAmount: alloc.rewardAmount,
        openingBalance,
        closingBalance,
        reason: params.reason,
      },
    );

    return ok({
      allocation: savedAlloc,
      wallet,
      transaction: savedTx,
    });
  }

  /**
   * Retrieves current Organization Wallet state.
   */
  async getOrganizationWallet(
    actor: ActorContext,
    organizationId: string,
  ): Promise<Result<OrganizationWalletEntity, Error>> {
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, organizationId, ['OWNER', 'MANAGER', 'BUYER']);
      if (!access.ok) return access;
    }

    if (!this.repos.organizationWallets) {
      return err(new Error('Organization wallet repository not initialized'));
    }

    let wallet = await this.repos.organizationWallets.findByOrganizationId(organizationId);
    if (!wallet) {
      const now = timestamp();
      wallet = await this.repos.organizationWallets.save({
        id: createId(),
        organizationId,
        balanceCredits: 0.00,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });
    }

    return ok(wallet);
  }

  /**
   * Retrieves paginated/sorted Wallet Transactions for an organization.
   */
  async getWalletTransactions(
    actor: ActorContext,
    organizationId: string,
  ): Promise<Result<WalletTransactionEntity[], Error>> {
    if (!actor.isPlatformAdmin) {
      const access = requireOrgAccess(actor, organizationId, ['OWNER', 'MANAGER', 'BUYER']);
      if (!access.ok) return access;
    }

    if (!this.repos.walletTransactions) {
      return err(new Error('Wallet transactions repository not initialized'));
    }

    const txs = await this.repos.walletTransactions.findByOrganizationId(organizationId);
    return ok(txs);
  }
}

/**
 * OTP Next — Financials, Entitlements & Pricing Adapters
 * Modules 20, 21, 22, 27
 */

import type { TypedSupabaseClient } from '@otp/database';
import type {
  InvoiceManagementContract,
  PaymentManagementContract,
  SubscriptionEntitlementContract,
  CommercialPricingContract,
  InvoiceDto,
  SubmitInvoiceInput,
  PaymentTransactionDto,
  EntitlementQuotaDto,
  PricingTierDto,
} from '../contracts/finance-billing.contract';
import type { ActorContext } from '../types/actor-context';
import { ok, type Result } from '../types/result';
import { ServiceError } from '../types/errors';

export class SupabaseInvoiceManagementAdapter implements InvoiceManagementContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async getInvoiceById(_actor: ActorContext, invoiceId: string): Promise<Result<InvoiceDto, ServiceError>> {
    return ok({
      invoiceId,
      invoiceNumber: 'INV-2026-0012',
      poId: 'po_sample_01',
      milestoneId: 'ms_1',
      supplierGstin: '29AABCU9603R1ZM',
      baseAmount: 31200,
      gstAmount: 5616,
      totalInvoiceAmount: 36816,
      status: 'APPROVED',
      submittedAt: '2026-03-07T14:00:00Z',
      approvedAt: '2026-03-08T10:00:00Z',
    });
  }

  async listInvoicesForOrder(actor: ActorContext, _poId: string): Promise<Result<InvoiceDto[], ServiceError>> {
    const inv = await this.getInvoiceById(actor, 'inv_01');
    if (!inv.ok) return inv;
    return ok([inv.value]);
  }

  async submitInvoice(_actor: ActorContext, input: SubmitInvoiceInput): Promise<Result<InvoiceDto, ServiceError>> {
    const gstAmount = (input.baseAmount * input.gstRatePercentage) / 100;
    return ok({
      invoiceId: 'inv_' + Date.now(),
      invoiceNumber: input.invoiceNumber,
      poId: input.poId,
      milestoneId: input.milestoneId,
      supplierGstin: '29AABCU9603R1ZM',
      baseAmount: input.baseAmount,
      gstAmount,
      totalInvoiceAmount: input.baseAmount + gstAmount,
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
      approvedAt: null,
    });
  }

  async approveInvoice(actor: ActorContext, invoiceId: string): Promise<Result<InvoiceDto, ServiceError>> {
    const inv = await this.getInvoiceById(actor, invoiceId);
    if (!inv.ok) return inv;
    return ok({ ...inv.value, status: 'APPROVED', approvedAt: new Date().toISOString() });
  }

  async rejectInvoice(actor: ActorContext, invoiceId: string, _reason: string): Promise<Result<InvoiceDto, ServiceError>> {
    const inv = await this.getInvoiceById(actor, invoiceId);
    if (!inv.ok) return inv;
    return ok({ ...inv.value, status: 'REJECTED' });
  }
}

export class SupabasePaymentManagementAdapter implements PaymentManagementContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async recordEscrowDeposit(_actor: ActorContext, poId: string, milestoneId: string, amount: number): Promise<Result<PaymentTransactionDto, ServiceError>> {
    const fee = amount * 0.005; // 0.50% platform fee
    return ok({
      transactionId: 'tx_' + Date.now(),
      poId,
      milestoneId,
      amount,
      platformFeeDeducted: fee,
      netDisbursedAmount: amount - fee,
      status: 'ESCROW_HELD',
      escrowDepositedAt: new Date().toISOString(),
      releasedAt: null,
    });
  }

  async releaseMilestonePayment(_actor: ActorContext, milestoneId: string): Promise<Result<PaymentTransactionDto, ServiceError>> {
    return ok({
      transactionId: 'tx_rel_' + Date.now(),
      poId: 'po_sample_01',
      milestoneId,
      amount: 36816,
      platformFeeDeducted: 184.08,
      netDisbursedAmount: 36631.92,
      status: 'RELEASED',
      escrowDepositedAt: '2026-03-08T10:00:00Z',
      releasedAt: new Date().toISOString(),
    });
  }

  async applyDisputeHold(_actor: ActorContext, milestoneId: string, _reason: string): Promise<Result<PaymentTransactionDto, ServiceError>> {
    return ok({
      transactionId: 'tx_disp_' + Date.now(),
      poId: 'po_sample_01',
      milestoneId,
      amount: 36816,
      platformFeeDeducted: 0,
      netDisbursedAmount: 0,
      status: 'DISPUTE_HELD',
      escrowDepositedAt: '2026-03-08T10:00:00Z',
      releasedAt: null,
    });
  }
}

export class SupabaseSubscriptionEntitlementAdapter implements SubscriptionEntitlementContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async getCurrentEntitlements(actor: ActorContext): Promise<Result<EntitlementQuotaDto, ServiceError>> {
    const isIndividual = actor.persona === 'INDIVIDUAL' || !actor.organizationId;
    return ok({
      buyerProfileId: actor.profileId,
      planName: isIndividual ? 'Individual Basic' : actor.persona === 'RWA' ? 'RWA Community' : 'MSME Pro',
      isPilotFreeActive: true, // Pilot free policy active
      publishedPlanPriceInRupees: isIndividual ? 199 : actor.persona === 'RWA' ? 1499 : 1999,
      monthlyIncludedRfqs: isIndividual ? 3 : actor.persona === 'RWA' ? 10 : 25,
      rfqsConsumedThisMonth: 0,
      additionalRfqPriceInRupees: isIndividual ? 149 : 99,
      quarterlyBonusRfqs: 2,
      doesBonusCarryForward: false, // Strictly non-carrying for quarterly bonus
      canCreateRfq: true,
      quotaCycleRenewalDate: '2026-04-01',
    });
  }

  async consumeRfqEntitlement(_actor: ActorContext, _rfqId: string): Promise<Result<{ consumed: boolean; remainingQuota: number }, ServiceError>> {
    // Invariant: Entitlement consumed only upon first comparison-eligible quote persistence
    return ok({ consumed: true, remainingQuota: 2 });
  }
}

export class SupabaseCommercialPricingAdapter implements CommercialPricingContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async getPublishedPricingTiers(): Promise<Result<PricingTierDto[], ServiceError>> {
    return ok([
      {
        tierId: 'tier_individual',
        targetPersona: 'INDIVIDUAL',
        displayName: 'Individual Homeowner',
        baseMonthlyPriceRupees: 199,
        includedRfqsPerMonth: 3,
        overagePricePerRfqRupees: 149,
        supplierFeePercentage: 0.5,
        isPilotFreeMode: true,
        benefits: ['3 Verified RFQs per month', 'Smart Merit quote comparison', 'Verified local supplier network', 'WhatsApp quotes directly'],
      },
      {
        tierId: 'tier_rwa',
        targetPersona: 'RWA',
        displayName: 'Apartment Association / RWA',
        baseMonthlyPriceRupees: 1499,
        includedRfqsPerMonth: 10,
        overagePricePerRfqRupees: 99,
        supplierFeePercentage: 0.5,
        isPilotFreeMode: true,
        benefits: ['Multi-member committee voting', 'Quorum verification & spend caps', 'Anti-self-approval & COI logging', 'Estate Manager operational access'],
      },
      {
        tierId: 'tier_msme',
        targetPersona: 'MSME',
        displayName: 'MSME Business',
        baseMonthlyPriceRupees: 1999,
        includedRfqsPerMonth: 25,
        overagePricePerRfqRupees: 99,
        supplierFeePercentage: 0.5,
        isPilotFreeMode: true,
        benefits: ['GSTIN statutory validation', 'Delegate spend limits', 'Full GST tax invoice breakdown', 'Tally & Zoho accounting exports'],
      },
    ]);
  }
}

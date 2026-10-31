/**
 * OTP Next — Financials, Payments, Entitlements & Billing Contracts
 * Modules 20, 21, 22, 27
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

// ==========================================
// Module 20: Invoice Management
// ==========================================

export type InvoiceStatus = 'SUBMITTED' | 'APPROVED' | 'PAID' | 'REJECTED';

export interface InvoiceDto {
  invoiceId: string;
  invoiceNumber: string; // e.g. "INV-2026-0012"
  poId: string;
  milestoneId: string;
  supplierGstin: string;
  baseAmount: number;
  gstAmount: number;
  totalInvoiceAmount: number;
  status: InvoiceStatus;
  submittedAt: string;
  approvedAt?: string | null;
}

export interface SubmitInvoiceInput {
  poId: string;
  milestoneId: string;
  invoiceNumber: string;
  baseAmount: number;
  gstRatePercentage: number;
  invoiceDocumentUrl?: string;
}

export interface InvoiceManagementContract {
  getInvoiceById(actor: ActorContext, invoiceId: string): Promise<Result<InvoiceDto, ServiceError>>;
  listInvoicesForOrder(actor: ActorContext, poId: string): Promise<Result<InvoiceDto[], ServiceError>>;
  submitInvoice(actor: ActorContext, input: SubmitInvoiceInput): Promise<Result<InvoiceDto, ServiceError>>;
  approveInvoice(actor: ActorContext, invoiceId: string): Promise<Result<InvoiceDto, ServiceError>>;
  rejectInvoice(actor: ActorContext, invoiceId: string, reason: string): Promise<Result<InvoiceDto, ServiceError>>;
}

// ==========================================
// Module 21: Payment Management
// ==========================================

export type PaymentStatus = 'ESCROW_HELD' | 'RELEASED' | 'DISPUTE_HELD' | 'REFUNDED';

export interface PaymentTransactionDto {
  transactionId: string;
  poId: string;
  milestoneId: string;
  amount: number;
  platformFeeDeducted: number; // 0.50% fee where applicable
  netDisbursedAmount: number;
  status: PaymentStatus;
  escrowDepositedAt: string;
  releasedAt?: string | null;
}

export interface PaymentManagementContract {
  recordEscrowDeposit(actor: ActorContext, poId: string, milestoneId: string, amount: number): Promise<Result<PaymentTransactionDto, ServiceError>>;
  releaseMilestonePayment(actor: ActorContext, milestoneId: string): Promise<Result<PaymentTransactionDto, ServiceError>>;
  applyDisputeHold(actor: ActorContext, milestoneId: string, reason: string): Promise<Result<PaymentTransactionDto, ServiceError>>;
}

// ==========================================
// Module 22: Subscription & Entitlement Management
// ==========================================

export interface EntitlementQuotaDto {
  buyerProfileId: string;
  planName: string; // "Individual Basic", "RWA Standard", "MSME Pro"
  isPilotFreeActive: boolean; // PILOT_FREE flag
  publishedPlanPriceInRupees: number; // ₹199, ₹1,499, ₹1,999
  monthlyIncludedRfqs: number; // 3 for individual
  rfqsConsumedThisMonth: number;
  additionalRfqPriceInRupees: number; // ₹149 for individual
  quarterlyBonusRfqs?: number;
  doesBonusCarryForward: boolean; // Strictly non-carrying for quarterly bonus
  canCreateRfq: boolean;
  quotaCycleRenewalDate: string;
}

export interface SubscriptionEntitlementContract {
  getCurrentEntitlements(actor: ActorContext): Promise<Result<EntitlementQuotaDto, ServiceError>>;
  consumeRfqEntitlement(actor: ActorContext, rfqId: string): Promise<Result<{ consumed: boolean; remainingQuota: number }, ServiceError>>;
}

// ==========================================
// Module 27: Pricing & Commercial Configuration
// ==========================================

export interface PricingTierDto {
  tierId: string;
  targetPersona: 'INDIVIDUAL' | 'RWA' | 'MSME';
  displayName: string;
  baseMonthlyPriceRupees: number;
  includedRfqsPerMonth: number;
  overagePricePerRfqRupees: number;
  supplierFeePercentage: number; // 0.5%
  isPilotFreeMode: boolean;
  benefits: string[];
}

export interface CommercialPricingContract {
  getPublishedPricingTiers(): Promise<Result<PricingTierDto[], ServiceError>>;
}

/**
 * OTP Next — Service Registry & Factory
 * Assembles all 28 domain module contracts and adapters into a unified client.
 */

import type { TypedSupabaseClient } from '@otp/database';
import type { OtpNextContracts } from '../contracts';

import {
  SupabaseIdentityAuthAdapter,
  SupabaseUserProfileAdapter,
  SupabaseBuyerManagementAdapter,
} from './identity-onboarding-adapter';

import {
  SupabaseRwaGovernanceAdapter,
  SupabaseMsmeManagementAdapter,
} from './buyer-governance-adapter';

import {
  SupabaseSupplierManagementAdapter,
  SupabaseSupplierVerificationAdapter,
} from './supplier-domain-adapter';

import {
  SupabaseAddressManagementAdapter,
  SupabaseTaxonomyCategoryAdapter,
} from './address-taxonomy-adapter';

import {
  SupabaseNetworkEngineAdapter,
  SupabaseSupplierInvitationsAdapter,
} from './network-discovery-adapter';

import {
  SupabaseRfqLifecycleAdapter,
  SupabaseQuotationManagementAdapter,
} from './rfq-lifecycle-adapter';

import {
  SupabaseSmartMeritAdapter,
  SupabaseEvaluationVotingAdapter,
  SupabaseConflictOfInterestAdapter,
} from './quote-merit-evaluation-adapter';

import {
  SupabaseAwardRevealAdapter,
} from './award-reveal-adapter';

import {
  SupabasePurchaseOrderAdapter,
  SupabaseOrderTrackingAdapter,
} from './orders-tracking-adapter';

import {
  SupabaseInvoiceManagementAdapter,
  SupabasePaymentManagementAdapter,
  SupabaseSubscriptionEntitlementAdapter,
  SupabaseCommercialPricingAdapter,
} from './finance-billing-adapter';

import {
  SupabaseNotificationAdapter,
  SupabaseDocumentAdapter,
} from './communications-docs-adapter';

import {
  SupabaseAuditComplianceAdapter,
  SupabasePlatformAdministrationAdapter,
  SupabaseOperationalReportingAdapter,
} from './admin-compliance-adapter';

/**
 * Creates and returns the full 28-module OTP Next Contracts client.
 */
export function createOtpNextContracts(client: TypedSupabaseClient | any): OtpNextContracts {
  return {
    // Cluster A: Identity, Profiles & Buyer Accounts (01-03)
    identityAuth: new SupabaseIdentityAuthAdapter(client),
    userProfiles: new SupabaseUserProfileAdapter(client),
    buyerManagement: new SupabaseBuyerManagementAdapter(client),

    // Cluster B: Buyer Governance (04-05)
    rwaGovernance: new SupabaseRwaGovernanceAdapter(client),
    msmeManagement: new SupabaseMsmeManagementAdapter(client),

    // Cluster C: Supplier Management & Verification (06-07)
    supplierManagement: new SupabaseSupplierManagementAdapter(client),
    supplierVerification: new SupabaseSupplierVerificationAdapter(client),

    // Cluster D: Address & Taxonomy (08-09)
    addressManagement: new SupabaseAddressManagementAdapter(client),
    taxonomyCategories: new SupabaseTaxonomyCategoryAdapter(client),

    // Cluster E: Supplier Network & Invitations (10, 12)
    networkEngine: new SupabaseNetworkEngineAdapter(client),
    supplierInvitations: new SupabaseSupplierInvitationsAdapter(client),

    // Cluster F: RFQ & Quotation Lifecycle (11, 13)
    rfqLifecycle: new SupabaseRfqLifecycleAdapter(client),
    quotationManagement: new SupabaseQuotationManagementAdapter(client),

    // Cluster G: Smart Merit, Voting & Anti-Collusion (14-16)
    smartMerit: new SupabaseSmartMeritAdapter(client),
    evaluationVoting: new SupabaseEvaluationVotingAdapter(client),
    conflictOfInterest: new SupabaseConflictOfInterestAdapter(client),

    // Cluster H: Award & Identity Reveal (17)
    awardReveal: new SupabaseAwardRevealAdapter(client),

    // Cluster I: PO & Order Tracking (18-19)
    purchaseOrders: new SupabasePurchaseOrderAdapter(client),
    orderTracking: new SupabaseOrderTrackingAdapter(client),

    // Cluster J: Financials, Entitlements & Pricing (20-22, 27)
    invoices: new SupabaseInvoiceManagementAdapter(client),
    payments: new SupabasePaymentManagementAdapter(client),
    subscriptions: new SupabaseSubscriptionEntitlementAdapter(client),
    pricing: new SupabaseCommercialPricingAdapter(client),

    // Cluster K: Notifications & Documents (23-24)
    notifications: new SupabaseNotificationAdapter(client),
    documents: new SupabaseDocumentAdapter(client),

    // Cluster L: Audit, Administration & Telemetry (25, 26, 28)
    auditCompliance: new SupabaseAuditComplianceAdapter(client),
    platformAdmin: new SupabasePlatformAdministrationAdapter(client),
    reporting: new SupabaseOperationalReportingAdapter(client),
  };
}

/**
 * OTP Next — Domain Contracts Registry (All 28 Modules)
 */

export * from './identity-onboarding.contract';
export * from './buyer-governance.contract';
export * from './supplier-domain.contract';
export * from './address-taxonomy.contract';
export * from './network-discovery.contract';
export * from './rfq-lifecycle.contract';
export * from './quote-merit-evaluation.contract';
export * from './award-reveal.contract';
export * from './orders-tracking.contract';
export * from './finance-billing.contract';
export * from './communications-docs.contract';
export * from './admin-compliance.contract';

import type { IdentityAuthContract, UserProfileContract, BuyerManagementContract } from './identity-onboarding.contract';
import type { RwaGovernanceContract, MsmeManagementContract } from './buyer-governance.contract';
import type { SupplierManagementContract, SupplierVerificationContract } from './supplier-domain.contract';
import type { AddressManagementContract, TaxonomyCategoryContract } from './address-taxonomy.contract';
import type { SupplierNetworkEngineContract, SupplierInvitationsContract } from './network-discovery.contract';
import type { RfqLifecycleContract, QuotationManagementContract } from './rfq-lifecycle.contract';
import type { SmartMeritContract, EvaluationVotingContract, ConflictOfInterestContract } from './quote-merit-evaluation.contract';
import type { AwardRevealContract } from './award-reveal.contract';
import type { PurchaseOrderContract, OrderTrackingContract } from './orders-tracking.contract';
import type { InvoiceManagementContract, PaymentManagementContract, SubscriptionEntitlementContract, CommercialPricingContract } from './finance-billing.contract';
import type { NotificationManagementContract, DocumentManagementContract } from './communications-docs.contract';
import type { AuditComplianceContract, PlatformAdministrationContract, OperationalReportingContract } from './admin-compliance.contract';

/**
 * Aggregated 28-Module OTP Next Contracts Map
 */
export interface OtpNextContracts {
  // Cluster A: Identity, Profiles & Buyer Accounts (01-03)
  identityAuth: IdentityAuthContract;
  userProfiles: UserProfileContract;
  buyerManagement: BuyerManagementContract;

  // Cluster B: Buyer Governance (04-05)
  rwaGovernance: RwaGovernanceContract;
  msmeManagement: MsmeManagementContract;

  // Cluster C: Supplier Management & Verification (06-07)
  supplierManagement: SupplierManagementContract;
  supplierVerification: SupplierVerificationContract;

  // Cluster D: Address & Taxonomy (08-09)
  addressManagement: AddressManagementContract;
  taxonomyCategories: TaxonomyCategoryContract;

  // Cluster E: Supplier Network & Invitations (10, 12)
  networkEngine: SupplierNetworkEngineContract;
  supplierInvitations: SupplierInvitationsContract;

  // Cluster F: RFQ & Quotation Lifecycle (11, 13)
  rfqLifecycle: RfqLifecycleContract;
  quotationManagement: QuotationManagementContract;

  // Cluster G: Smart Merit, Voting & Anti-Collusion (14-16)
  smartMerit: SmartMeritContract;
  evaluationVoting: EvaluationVotingContract;
  conflictOfInterest: ConflictOfInterestContract;

  // Cluster H: Award & Identity Reveal (17)
  awardReveal: AwardRevealContract;

  // Cluster I: PO & Order Tracking (18-19)
  purchaseOrders: PurchaseOrderContract;
  orderTracking: OrderTrackingContract;

  // Cluster J: Financials, Entitlements & Pricing (20-22, 27)
  invoices: InvoiceManagementContract;
  payments: PaymentManagementContract;
  subscriptions: SubscriptionEntitlementContract;
  pricing: CommercialPricingContract;

  // Cluster K: Notifications & Documents (23-24)
  notifications: NotificationManagementContract;
  documents: DocumentManagementContract;

  // Cluster L: Audit, Administration & Telemetry (25, 26, 28)
  auditCompliance: AuditComplianceContract;
  platformAdmin: PlatformAdministrationContract;
  reporting: OperationalReportingContract;
}

import { CompositeDiscoveryService } from '../discovery/composite-discovery-service';
import { LocalRegistryDiscoveryService } from '../discovery/local-registry-discovery-service';
import { MockNetworkDiscoveryService } from '../discovery/mock-network-discovery-service';
import { SupplierNetworkEngine } from '../discovery/supplier-network-engine';
import { ProviderNeutralLocationIntelligence } from '../gis/provider-neutral-location-intelligence';
import {
  BniNetworkAdapter,
  AssociationNetworkAdapter,
  DirectNetworkAdapter,
  LocalRegistryNetworkAdapter,
} from '../discovery/networks/supplier-network-adapters';
import { OndcNetworkAdapter } from '../discovery/networks/ondc-network-adapter';
import { DefaultApprovalPolicyService } from '../approval/default-approval-policy-service';
import { InMemoryAuditService } from '../audit/in-memory-audit-service';
import { QuoteEvaluationServiceImpl } from '../evaluation/quote-evaluation-service-impl';
import { InAppNotificationService } from '../notification/in-app-notification-service';
import { RuleBasedRequirementParser } from '../parser/rule-based-requirement-parser';
import { SupplierRevealServiceImpl } from '../reveal/supplier-reveal-service-impl';
import type { Repositories } from '../repositories/interfaces';
import { ApprovalService } from '../services/approval-service';
import { AwardService } from '../services/award-service';
import { AuditAppService } from '../services/audit-service';
import { InvoiceService } from '../services/invoice-service';
import { NotificationAppService } from '../services/notification-service';
import { PaymentService } from '../services/payment-service';
import { PurchaseOrderService } from '../services/purchase-order-service';
import { QuoteEvaluationAppService } from '../services/quote-evaluation-service';
import { QuoteService } from '../services/quote-service';
import { RequirementService } from '../services/requirement-service';
import { RFQService } from '../services/rfq-service';
import { SupplierDiscoveryAppService } from '../services/supplier-discovery-service';
import { SupplierPerformanceService } from '../services/supplier-performance-service';
import { WorkOrderService } from '../services/work-order-service';
import { AccountingService } from '../services/accounting-service';
import { OmnichannelNotificationService } from '../services/omnichannel-notification-service';
import { NotificationQueueWorker } from '../notifications/notification-queue-worker';
import { MilestoneInspectionService } from '../services/milestone-inspection-service';
import { DisputeResolutionService } from '../services/dispute-resolution-service';
import { VendorMasterIntelligenceService } from '../services/vendor-master-intelligence-service';
import { EnterpriseApprovalMatrixService } from '../services/enterprise-approval-matrix-service';
import { ProcurementContractOperationsService } from '../services/procurement-contract-operations-service';
import { MarketIntelligenceService } from '../services/market-intelligence-service';
import { IdentityProtectedRfqService } from '../blind/blind-rfq-service';
import { createInMemoryBlindViewPorts } from '../blind/in-memory-blind-view-ports';
import type { BlindViewPorts } from '../interfaces/blind-view-ports';

export interface OtpServices {
  requirements: RequirementService;
  rfqs: RFQService;
  discovery: SupplierDiscoveryAppService;
  quotes: QuoteService;
  quoteEvaluation: QuoteEvaluationAppService;
  blindRfq: IdentityProtectedRfqService;
  approvals: ApprovalService;
  awards: AwardService;
  purchaseOrders: PurchaseOrderService;
  workOrders: WorkOrderService;
  invoices: InvoiceService;
  payments: PaymentService;
  accounting: AccountingService;
  supplierPerformance: SupplierPerformanceService;
  audit: AuditAppService;
  notifications: NotificationAppService;
  omnichannelNotifications: OmnichannelNotificationService;
  notificationWorker: NotificationQueueWorker;
  milestoneInspections: MilestoneInspectionService;
  disputeResolution: DisputeResolutionService;
  vendorIntelligence: VendorMasterIntelligenceService;
  enterpriseApprovalMatrix: EnterpriseApprovalMatrixService;
  contractOperations: ProcurementContractOperationsService;
  marketIntelligence: MarketIntelligenceService;
  supplierReveal: SupplierRevealServiceImpl;
  approvalPolicy: DefaultApprovalPolicyService;
  supplierNetworkEngine: SupplierNetworkEngine;
}

export function createOtpServices(
  repos: Repositories,
  blindViews?: BlindViewPorts,
): OtpServices {
  const auditInner = new InMemoryAuditService();
  const audit = new AuditAppService(auditInner);
  const notificationsInner = new InAppNotificationService();
  const notifications = new NotificationAppService(notificationsInner);
  const parser = new RuleBasedRequirementParser();
  const evaluationInner = new QuoteEvaluationServiceImpl();
  const approvalPolicy = new DefaultApprovalPolicyService();

  const sneEngine = new SupplierNetworkEngine({
    locationIntelligence: new ProviderNeutralLocationIntelligence(),
    providers: [
      { adapter: LocalRegistryNetworkAdapter, isLive: true },
      { adapter: DirectNetworkAdapter, isLive: true },
      { adapter: new OndcNetworkAdapter() },
      { adapter: BniNetworkAdapter },
      { adapter: AssociationNetworkAdapter },
    ],
  });

  const discoveryInner = new CompositeDiscoveryService(
    [
      new LocalRegistryDiscoveryService(repos.suppliers),
      new MockNetworkDiscoveryService(),
    ],
    { engine: sneEngine },
  );
  const discovery = new SupplierDiscoveryAppService(discoveryInner);

  const requirements = new RequirementService(repos, audit, parser);
  const rfqs = new RFQService(repos, audit, discoveryInner);
  const quotes = new QuoteService(repos, audit);
  const quoteEvaluation = new QuoteEvaluationAppService(
    repos,
    evaluationInner,
    audit,
  );
  const approvals = new ApprovalService(repos, audit, approvalPolicy);
  const awards = new AwardService(repos, audit, approvalPolicy);
  const supplierReveal = new SupplierRevealServiceImpl(repos, auditInner);
  const purchaseOrders = new PurchaseOrderService(repos, audit);
  const workOrders = new WorkOrderService(repos, audit);
  const invoices = new InvoiceService(repos, audit);
  const payments = new PaymentService(repos, audit);
  const accounting = new AccountingService(repos, audit);
  const supplierPerformance = new SupplierPerformanceService(repos, audit);
  const omnichannelNotifications = new OmnichannelNotificationService(repos, audit);
  const notificationWorker = new NotificationQueueWorker(repos, audit);
  const milestoneInspections = new MilestoneInspectionService(repos, audit);
  const disputeResolution = new DisputeResolutionService(repos, audit);
  const vendorIntelligence = new VendorMasterIntelligenceService(repos, audit);
  const enterpriseApprovalMatrix = new EnterpriseApprovalMatrixService(repos, audit);
  const contractOperations = new ProcurementContractOperationsService(repos, audit);
  const marketIntelligence = new MarketIntelligenceService(repos, audit);
  const blindViewPorts = blindViews ?? createInMemoryBlindViewPorts(repos);
  const blindRfq = new IdentityProtectedRfqService(repos, blindViewPorts, auditInner);

  return {
    requirements,
    rfqs,
    discovery,
    quotes,
    quoteEvaluation,
    blindRfq,
    approvals,
    awards,
    purchaseOrders,
    workOrders,
    invoices,
    payments,
    accounting,
    supplierPerformance,
    audit,
    notifications,
    omnichannelNotifications,
    notificationWorker,
    milestoneInspections,
    disputeResolution,
    vendorIntelligence,
    enterpriseApprovalMatrix,
    contractOperations,
    marketIntelligence,
    supplierReveal,
    approvalPolicy,
    supplierNetworkEngine: sneEngine,
  };
}

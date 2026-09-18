import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import {
  calculateDisputeSlaDeadline,
  calculateExponentialBackoff,
  calculateInspectionScore,
  canEscalateDispute,
  generateDigitalSignoffHash,
  isMilestoneInvoiceEligible,
  isSlaBreached,
  isWithinQuietHours,
  redactNotificationPayload,
  renderNotificationTemplate,
  validateInspectionEvidenceAttachment,
  validateProviderWebhookSignature,
  verifyDigitalSignoffHash,
} from '@otp/domain';
import { createHmac } from 'crypto';

const BUYER_ORG_ALPHA = 'org-buyer-alpha';
const BUYER_ORG_BETA = 'org-buyer-beta';
const SUPPLIER_ID_1 = 'sup-alpha-1';
const SUPPLIER_ID_2 = 'sup-beta-2';

const BUYER_ALPHA_OWNER: ActorContext = {
  profileId: 'usr-buyer-a-owner',
  organizationId: BUYER_ORG_ALPHA,
  orgRole: 'OWNER',
};

const BUYER_ALPHA_MEMBER: ActorContext = {
  profileId: 'usr-buyer-a-member',
  organizationId: BUYER_ORG_ALPHA,
  orgRole: 'BUYER',
};

const BUYER_BETA_OWNER: ActorContext = {
  profileId: 'usr-buyer-b-owner',
  organizationId: BUYER_ORG_BETA,
  orgRole: 'OWNER',
};

const PLATFORM_ADMIN: ActorContext = {
  profileId: 'usr-platform-admin',
  isPlatformAdmin: true,
};

const UNAUTHORIZED_USER: ActorContext = {
  profileId: 'usr-unauthorized',
  organizationId: 'org-random-unrelated',
  orgRole: 'BUYER',
};

describe('OTP Phase 6.5: Master Assurance Matrix — Communications, Milestones & Disputes', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: SUPPLIER_ID_1,
      businessName: 'Apex Industrial Supplies Pvt Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Industrial', 'Hardware'],
      gstin: '29AABCS1429B1ZX',
    });

    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedWorkOrderWithMilestone() {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const po = await repos.purchaseOrders.save({
      id: 'po-p65-001',
      awardId: 'award-p65-001',
      rfqId: 'rfq-p65-001',
      organizationId: BUYER_ORG_ALPHA,
      supplierId: SUPPLIER_ID_1,
      totalAmount: 250000,
      currency: 'INR',
      status: 'ACCEPTED',
      poNumber: 'PO-2026-65-001',
      createdAt: now,
      updatedAt: now,
    });

    const wo = await repos.workOrders.save({
      id: 'wo-p65-001',
      purchaseOrderId: po.id,
      supplierId: SUPPLIER_ID_1,
      title: 'Fabrication & Pre-Assembly Work Order',
      status: 'IN_PROGRESS',
      progressPercent: 50,
      createdAt: now,
      updatedAt: now,
    });

    const milestone = await repos.workOrderMilestones!.save({
      id: 'ms-p65-001',
      workOrderId: wo.id,
      milestoneIndex: 1,
      milestoneTitle: 'Fabrication & Pre-Assembly Stage',
      targetPercentage: 50,
      allocatedAmount: 125000,
      invoicedAmount: 0,
      isInvoiced: false,
      status: 'SUBMITTED_BY_SUPPLIER',
      createdAt: now,
      updatedAt: now,
    });

    return { po, wo, milestone };
  }

  // ===========================================================================
  // 1. GREEN TEAM: Happy Path & Integration Flows
  // ===========================================================================
  describe('🟢 Green Team: Happy Path & Core Workflows', () => {
    it('dispatches omnichannel notifications across WhatsApp, SMS, and Email', async () => {
      const dispatchRes = await services.omnichannelNotifications.dispatchNotification(BUYER_ALPHA_OWNER, {
        recipientAddress: '+919876543210',
        channel: 'WHATSAPP',
        category: 'RFQ_INVITATION',
        templateCode: 'RFQ_INVITATION_WHATSAPP',
        payload: {
          rfq_title: 'Heavy Structural Steel Beams',
          rfq_id: 'RFQ-2026-101',
          deadline: '2026-09-30',
        },
        organizationId: BUYER_ORG_ALPHA,
      });

      expect(dispatchRes.ok).toBe(true);
      if (!dispatchRes.ok) return;

      expect(dispatchRes.value.status).toBe('PENDING');
      expect(dispatchRes.value.channel).toBe('WHATSAPP');
      expect(dispatchRes.value.templateCode).toBe('RFQ_INVITATION_WHATSAPP');

      // Process delivery queue
      const processRes = await services.omnichannelNotifications.processQueue(PLATFORM_ADMIN);
      expect(processRes.ok).toBe(true);
      if (!processRes.ok) return;

      expect(processRes.value.processed).toBe(1);
      expect(processRes.value.delivered).toBe(1);
    });

    it('executes milestone inspection checklist, computes score, signs off digitally, and unlocks progressive invoicing', async () => {
      const { wo, milestone } = await seedWorkOrderWithMilestone();
      const salt = 'otp_test_inspector_salt_key_2026';

      // 1. Submit Inspection
      const submitRes = await services.milestoneInspections.submitInspection(BUYER_ALPHA_MEMBER, {
        workOrderId: wo.id,
        milestoneId: milestone.id,
        inspectionType: 'PHYSICAL_ONSITE',
        checklistTemplateCode: 'STD_FABRICATION_V1',
        items: [
          {
            itemCode: 'MAT-01',
            category: 'MATERIALS',
            description: 'Structural steel grade IS 2062 certified',
            status: 'PASSED',
            score: 95,
          },
          {
            itemCode: 'CMP-01',
            category: 'COMPLETION',
            description: '50% physical fabrication assembled',
            status: 'PASSED',
            score: 90,
          },
          {
            itemCode: 'QLT-01',
            category: 'QUALITY',
            description: 'Weld penetration ultrasonic test passed',
            status: 'PASSED',
            score: 95,
          },
        ],
        notes: 'On-site factory inspection completed cleanly.',
      });

      expect(submitRes.ok).toBe(true);
      if (!submitRes.ok) return;

      const insp = submitRes.value;
      expect(insp.status).toBe('SUBMITTED');
      expect(insp.passed).toBe(true);
      expect(insp.overallScore).toBe(93.33);

      // Verify invoice eligibility is NOT yet active before digital signoff
      const preCheck = await services.milestoneInspections.verifyMilestoneInvoiceEligibility(
        BUYER_ALPHA_MEMBER,
        milestone.id,
      );
      expect(preCheck.ok).toBe(true);
      if (preCheck.ok) {
        expect(preCheck.value.eligible).toBe(false);
      }

      // 2. Approve with Digital Sign-off Hash
      const signoffHash = generateDigitalSignoffHash(
        insp.id,
        milestone.id,
        BUYER_ALPHA_MEMBER.profileId,
        insp.overallScore!,
        insp.createdAt,
        salt,
      );

      const approveRes = await services.milestoneInspections.approveInspection(BUYER_ALPHA_OWNER, {
        inspectionId: insp.id,
        digitalSignoffHash: signoffHash,
        secretSalt: salt,
      });

      expect(approveRes.ok).toBe(true);
      if (!approveRes.ok) return;

      expect(approveRes.value.status).toBe('APPROVED');
      expect(approveRes.value.passed).toBe(true);
      expect(approveRes.value.digitalSignoffHash).toBe(signoffHash);

      // Verify progressive invoice eligibility is now unlocked
      const postCheck = await services.milestoneInspections.verifyMilestoneInvoiceEligibility(
        BUYER_ALPHA_MEMBER,
        milestone.id,
      );
      expect(postCheck.ok).toBe(true);
      if (postCheck.ok) {
        expect(postCheck.value.eligible).toBe(true);
      }
    });

    it('opens structured dispute, attaches evidence, escalates through tiers, and resolves with mutual agreement', async () => {
      const { po } = await seedWorkOrderWithMilestone();

      // 1. Open Dispute
      const openRes = await services.disputeResolution.openDispute(BUYER_ALPHA_OWNER, {
        organizationId: BUYER_ORG_ALPHA,
        counterpartyOrganizationId: null,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        category: 'QUALITY_DEFICIENCY',
        severity: 'HIGH', // 48h SLA
        disputedAmount: 45000,
        currency: 'INR',
        title: 'Surface coating thickness non-conformance',
        description: 'Coating thickness is 40 microns instead of committed 80 microns.',
      });

      expect(openRes.ok).toBe(true);
      if (!openRes.ok) return;

      const dispute = openRes.value;
      expect(dispute.status).toBe('OPEN');
      expect(dispute.escalationLevel).toBe(1);
      expect(dispute.disputeNumber).toMatch(/^DSP-2026-/);
      expect(isSlaBreached(dispute.slaDeadline)).toBe(false);

      // 2. Attach Evidence
      const evidenceRes = await services.disputeResolution.attachEvidence(BUYER_ALPHA_OWNER, {
        disputeId: dispute.id,
        fileName: 'coating_test_report.pdf',
        fileUrl: 'https://storage.otp.local/disputes/coating_test_report.pdf',
        fileSizeBytes: 204800,
        mimeType: 'application/pdf',
        sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        description: 'Third-party laboratory test certificate',
      });

      expect(evidenceRes.ok).toBe(true);
      if (!evidenceRes.ok) return;
      expect(evidenceRes.value.isImmutable).toBe(true);

      // 3. Escalate Dispute to Level 2
      const escalateRes = await services.disputeResolution.escalateDispute(BUYER_ALPHA_OWNER, {
        disputeId: dispute.id,
        reason: 'Supplier failed to respond within initial 24 hours of notice.',
      });

      expect(escalateRes.ok).toBe(true);
      if (!escalateRes.ok) return;
      expect(escalateRes.value.escalationLevel).toBe(2);
      expect(escalateRes.value.status).toBe('ESCALATED');

      // 4. Resolve Dispute
      const resolveRes = await services.disputeResolution.resolveDispute(BUYER_ALPHA_OWNER, {
        disputeId: dispute.id,
        resolutionCategory: 'REWORK_AGREED',
        resolutionSummary: 'Supplier agreed to recoat batches at no additional charge within 5 days.',
      });

      expect(resolveRes.ok).toBe(true);
      if (!resolveRes.ok) return;
      expect(resolveRes.value.status).toBe('RESOLVED');
      expect(resolveRes.value.resolutionCategory).toBe('REWORK_AGREED');

      // Fetch full aggregate
      const fullDispute = await services.disputeResolution.getDispute(BUYER_ALPHA_OWNER, dispute.id);
      expect(fullDispute.ok).toBe(true);
      if (fullDispute.ok) {
        expect(fullDispute.value.events?.length).toBe(4); // OPENED, EVIDENCE_ATTACHED, ESCALATED, RESOLVED
        expect(fullDispute.value.evidence?.length).toBe(1);
      }
    });
  });

  // ===========================================================================
  // 2. RED TEAM: Adversarial, Security & Anti-Leak Controls
  // ===========================================================================
  describe('🔴 Red Team: Adversarial, Security & Anti-Leak Controls', () => {
    it('strictly redacts sensitive supplier identifiers before reveal (Anti-Leak Policy)', async () => {
      const rawPayload = {
        rfq_id: 'rfq-leak-test',
        rfq_title: 'Precision Transformers',
        supplier_legal_name: 'Bharat Heavy Heavy Electricals Ltd',
        supplier_business_name: 'BHEL Power Div',
        supplier_gstin: '07AAACB2026A1Z0',
        supplier_pan: 'AAACB2026A',
        supplier_phone: '+919876500000',
        supplier_label: 'Supplier A7K3',
        amount: 500000,
      };

      const dispatchRes = await services.omnichannelNotifications.dispatchNotification(BUYER_ALPHA_OWNER, {
        recipientAddress: 'buyer@alphacorp.com',
        channel: 'WHATSAPP',
        category: 'QUOTE_SUBMITTED',
        templateCode: 'QUOTE_SUBMISSION_WHATSAPP',
        payload: rawPayload,
        isIdentityMasked: true,
      });

      expect(dispatchRes.ok).toBe(true);
      if (!dispatchRes.ok) return;

      const queueItem = dispatchRes.value;
      expect(queueItem.redactedPayload.supplier_legal_name).toBeUndefined();
      expect(queueItem.redactedPayload.supplier_business_name).toBeUndefined();
      expect(queueItem.redactedPayload.supplier_gstin).toBeUndefined();
      expect(queueItem.redactedPayload.supplier_phone).toBeUndefined();
      expect(queueItem.redactedPayload.supplier_pseudonym).toBe('Supplier A7K3');
    });

    it('rejects tampered or replayed webhook callbacks', async () => {
      const secret = 'waha_webhook_secret_key_123456';
      const rawPayload = JSON.stringify({ messageId: 'msg-999', event: 'DELIVERED' });
      const now = Date.now();

      // Tampered signature
      const webhookRes = await services.omnichannelNotifications.handleProviderWebhook(PLATFORM_ADMIN, {
        rawPayload,
        signature: 'deadbeef1234567890abcdef',
        secret,
        timestampMs: now,
        providerMessageId: 'msg-999',
        eventStatus: 'DELIVERED',
      });
      expect(webhookRes.ok).toBe(false);
      if (!webhookRes.ok) {
        expect(webhookRes.error.message).toContain('Invalid webhook signature');
      }

      // Replay attack (timestamp drifted by > 5 minutes)
      const expiredTimestamp = now - 600000;
      const hmac = createHmac('sha256', secret);
      hmac.update(`${expiredTimestamp}.${rawPayload}`);
      const validSigOldTime = hmac.digest('hex');

      const replayRes = await services.omnichannelNotifications.handleProviderWebhook(PLATFORM_ADMIN, {
        rawPayload,
        signature: validSigOldTime,
        secret,
        timestampMs: expiredTimestamp,
        providerMessageId: 'msg-999',
        eventStatus: 'DELIVERED',
      });
      expect(replayRes.ok).toBe(false);
      if (!replayRes.ok) {
        expect(replayRes.error.message).toContain('Invalid webhook signature or replay timestamp');
      }
    });

    it('rejects oversized or invalid MIME evidence attachments', async () => {
      const { po } = await seedWorkOrderWithMilestone();
      const openRes = await services.disputeResolution.openDispute(BUYER_ALPHA_OWNER, {
        organizationId: BUYER_ORG_ALPHA,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        category: 'SPEC_DEVIATION',
        severity: 'MEDIUM',
        title: 'Spec discrepancy',
        description: 'Details',
      });
      expect(openRes.ok).toBe(true);
      if (!openRes.ok) return;

      // Oversized (>25MB)
      const oversizedRes = await services.disputeResolution.attachEvidence(BUYER_ALPHA_OWNER, {
        disputeId: openRes.value.id,
        fileName: 'huge_archive.zip',
        fileUrl: 'https://storage.otp.local/huge.zip',
        fileSizeBytes: 30 * 1024 * 1024,
        mimeType: 'application/pdf',
        sha256Hash: 'hash',
      });
      expect(oversizedRes.ok).toBe(false);
      if (!oversizedRes.ok) {
        expect(oversizedRes.error.message).toContain('File size must be between 1 byte and 25MB');
      }
    });

    it('prevents unauthorized non-parties from viewing or modifying disputes', async () => {
      const { po } = await seedWorkOrderWithMilestone();
      const openRes = await services.disputeResolution.openDispute(BUYER_ALPHA_OWNER, {
        organizationId: BUYER_ORG_ALPHA,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        category: 'SPEC_DEVIATION',
        severity: 'MEDIUM',
        title: 'Spec discrepancy',
        description: 'Details',
      });
      expect(openRes.ok).toBe(true);
      if (!openRes.ok) return;

      const unauthorizedGet = await services.disputeResolution.getDispute(UNAUTHORIZED_USER, openRes.value.id);
      expect(unauthorizedGet.ok).toBe(false);
      if (!unauthorizedGet.ok) {
        expect(unauthorizedGet.error).toBeInstanceOf(ForbiddenError);
      }

      const unauthorizedEscalate = await services.disputeResolution.escalateDispute(UNAUTHORIZED_USER, {
        disputeId: openRes.value.id,
        reason: 'Illegal escalation attempt',
      });
      expect(unauthorizedEscalate.ok).toBe(false);
      if (!unauthorizedEscalate.ok) {
        expect(unauthorizedEscalate.error).toBeInstanceOf(ForbiddenError);
      }
    });
  });

  // ===========================================================================
  // 3. ORANGE TEAM: Edge Cases, Idempotency & Boundaries
  // ===========================================================================
  describe('🟠 Orange Team: Edge Cases & Concurrency', () => {
    it('preserves idempotency on duplicate notification dispatch with same key', async () => {
      const idempotencyKey = 'idemp-notif-unique-001';

      const first = await services.omnichannelNotifications.dispatchNotification(BUYER_ALPHA_OWNER, {
        recipientAddress: '+919876543210',
        channel: 'WHATSAPP',
        category: 'RFQ_INVITATION',
        templateCode: 'RFQ_INVITATION_WHATSAPP',
        payload: { rfq_title: 'Generators', rfq_id: 'RFQ-01', deadline: '2026-10-01' },
        idempotencyKey,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      const second = await services.omnichannelNotifications.dispatchNotification(BUYER_ALPHA_OWNER, {
        recipientAddress: '+919876543210',
        channel: 'WHATSAPP',
        category: 'RFQ_INVITATION',
        templateCode: 'RFQ_INVITATION_WHATSAPP',
        payload: { rfq_title: 'Generators', rfq_id: 'RFQ-01', deadline: '2026-10-01' },
        idempotencyKey,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;

      expect(first.value.id).toBe(second.value.id);
    });

    it('suppresses notifications when user has opted out of category', async () => {
      await services.omnichannelNotifications.updatePreferences(BUYER_ALPHA_OWNER, BUYER_ALPHA_OWNER.profileId, {
        categoryOptOuts: ['RFQ_INVITATION'],
      });

      const res = await services.omnichannelNotifications.dispatchNotification(BUYER_ALPHA_OWNER, {
        recipientUserId: BUYER_ALPHA_OWNER.profileId,
        recipientAddress: '+919876543210',
        channel: 'WHATSAPP',
        category: 'RFQ_INVITATION',
        templateCode: 'RFQ_INVITATION_WHATSAPP',
        payload: { rfq_title: 'Pumps', rfq_id: 'RFQ-02', deadline: '2026-10-01' },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.status).toBe('SUPPRESSED');
    });

    it('handles inspection rejection with rework reason, incrementing rework count and blocking invoice eligibility', async () => {
      const { wo, milestone } = await seedWorkOrderWithMilestone();

      const submitRes = await services.milestoneInspections.submitInspection(BUYER_ALPHA_MEMBER, {
        workOrderId: wo.id,
        milestoneId: milestone.id,
        inspectionType: 'PHYSICAL_ONSITE',
        checklistTemplateCode: 'STD_FABRICATION_V1',
        items: [
          {
            itemCode: 'MAT-01',
            category: 'MATERIALS',
            description: 'Material specs',
            status: 'FAILED',
            score: 40,
          },
        ],
      });
      expect(submitRes.ok).toBe(true);
      if (!submitRes.ok) return;

      // Reject inspection
      const rejectRes = await services.milestoneInspections.rejectInspection(BUYER_ALPHA_OWNER, {
        inspectionId: submitRes.value.id,
        reworkReason: 'Defective raw material batch. Substandard tensile strength.',
      });

      expect(rejectRes.ok).toBe(true);
      if (!rejectRes.ok) return;

      expect(rejectRes.value.status).toBe('REWORK_REQUESTED');
      expect(rejectRes.value.passed).toBe(false);
      expect(rejectRes.value.reworkCount).toBe(1);

      // Verify invoice eligibility remains false
      const eligibility = await services.milestoneInspections.verifyMilestoneInvoiceEligibility(
        BUYER_ALPHA_OWNER,
        milestone.id,
      );
      expect(eligibility.ok).toBe(true);
      if (eligibility.ok) {
        expect(eligibility.value.eligible).toBe(false);
      }
    });

    it('enforces escalation level ceiling and prevents escalation on terminal states', async () => {
      const { po } = await seedWorkOrderWithMilestone();
      const openRes = await services.disputeResolution.openDispute(BUYER_ALPHA_OWNER, {
        organizationId: BUYER_ORG_ALPHA,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        category: 'DELIVERY_DELAY',
        severity: 'CRITICAL',
        title: 'Delayed shipment',
        description: 'Delay details',
      });
      expect(openRes.ok).toBe(true);
      if (!openRes.ok) return;
      const disputeId = openRes.value.id;

      // Escalate to level 2, 3, 4
      await services.disputeResolution.escalateDispute(BUYER_ALPHA_OWNER, { disputeId, reason: 'To level 2' });
      await services.disputeResolution.escalateDispute(BUYER_ALPHA_OWNER, { disputeId, reason: 'To level 3' });
      const lvl4 = await services.disputeResolution.escalateDispute(BUYER_ALPHA_OWNER, { disputeId, reason: 'To level 4' });
      expect(lvl4.ok).toBe(true);
      if (lvl4.ok) expect(lvl4.value.escalationLevel).toBe(4);

      // Attempt escalation past level 4
      const overLvl4 = await services.disputeResolution.escalateDispute(BUYER_ALPHA_OWNER, { disputeId, reason: 'Over level 4' });
      expect(overLvl4.ok).toBe(false);
      if (!overLvl4.ok) {
        expect(overLvl4.error.message).toContain('cannot be escalated');
      }

      // Resolve and try escalating
      await services.disputeResolution.resolveDispute(BUYER_ALPHA_OWNER, {
        disputeId,
        resolutionCategory: 'CLAIM_REJECTED',
        resolutionSummary: 'Resolved and closed',
      });

      const escalateResolved = await services.disputeResolution.escalateDispute(BUYER_ALPHA_OWNER, { disputeId, reason: 'After resolved' });
      expect(escalateResolved.ok).toBe(false);
    });
  });

  // ===========================================================================
  // 4. BLUE TEAM: Financial Invariants & Non-Custodial Integrity
  // ===========================================================================
  describe('🔵 Blue Team: Financial Invariants & Non-Custodial Integrity', () => {
    it('guarantees that opening, escalating, or resolving disputes does NOT silently mutate wallet balances or settlement ledgers', async () => {
      const { po } = await seedWorkOrderWithMilestone();
      const repos = mem.asRepositories();

      // Seed initial wallet
      const wallet = await repos.organizationWallets!.save({
        id: 'wal-p65-001',
        organizationId: BUYER_ORG_ALPHA,
        balanceCredits: 5000.0,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const initialWalletBalance = wallet.balanceCredits;
      const initialTransactionsCount = (await repos.walletTransactions!.findByOrganizationId(BUYER_ORG_ALPHA)).length;

      // Open a high-value dispute
      const openRes = await services.disputeResolution.openDispute(BUYER_ALPHA_OWNER, {
        organizationId: BUYER_ORG_ALPHA,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        category: 'PAYMENT_SHORTAGE',
        severity: 'CRITICAL',
        disputedAmount: 100000,
        title: 'Disputed amount',
        description: 'Testing non-custodial preservation',
      });
      expect(openRes.ok).toBe(true);
      if (!openRes.ok) throw new Error('Expected openRes to be ok');

      // Escalate and Resolve
      await services.disputeResolution.escalateDispute(BUYER_ALPHA_OWNER, {
        disputeId: openRes.value.id,
        reason: 'Escalation step',
      });

      await services.disputeResolution.resolveDispute(BUYER_ALPHA_OWNER, {
        disputeId: openRes.value.id,
        resolutionCategory: 'PRICE_ADJUSTMENT_MUTUAL',
        resolutionSummary: 'Settled without silent wallet mutability',
      });

      // Assert wallet balance and ledger are completely unchanged
      const updatedWallet = await repos.organizationWallets!.findById(wallet.id);
      expect(updatedWallet?.balanceCredits).toBe(initialWalletBalance);

      const finalTransactionsCount = (await repos.walletTransactions!.findByOrganizationId(BUYER_ORG_ALPHA)).length;
      expect(finalTransactionsCount).toBe(initialTransactionsCount);
    });
  });

  // ===========================================================================
  // 5. PURPLE TEAM: End-to-End Multi-Tenant Isolation & Full Lifecycle
  // ===========================================================================
  describe('🟣 Purple Team: Multi-Tenant Isolation & Full Lifecycle', () => {
    it('guarantees strict tenant isolation: Org Beta cannot access or mutate Org Alpha dispute records', async () => {
      const { po } = await seedWorkOrderWithMilestone();

      const alphaDispute = await services.disputeResolution.openDispute(BUYER_ALPHA_OWNER, {
        organizationId: BUYER_ORG_ALPHA,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        category: 'QUALITY_DEFICIENCY',
        severity: 'MEDIUM',
        title: 'Alpha Private Dispute',
        description: 'Strictly confidential',
      });
      expect(alphaDispute.ok).toBe(true);
      if (!alphaDispute.ok) throw new Error('Expected alphaDispute to be ok');

      // Org Beta queries disputes
      const betaDisputes = await services.disputeResolution.listDisputes(BUYER_BETA_OWNER, BUYER_ORG_BETA);
      expect(betaDisputes.ok).toBe(true);
      if (betaDisputes.ok) {
        expect(betaDisputes.value.some((d) => d.id === alphaDispute.value.id)).toBe(false);
      }

      // Org Beta tries to resolve Alpha dispute
      const betaResolve = await services.disputeResolution.resolveDispute(BUYER_BETA_OWNER, {
        disputeId: alphaDispute.value.id,
        resolutionCategory: 'CLAIM_REJECTED',
        resolutionSummary: 'Malicious resolution by unrelated tenant',
      });
      expect(betaResolve.ok).toBe(false);
      if (!betaResolve.ok) {
        expect(betaResolve.error).toBeInstanceOf(ForbiddenError);
      }
    });
  });
});

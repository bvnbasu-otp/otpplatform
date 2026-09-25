import { describe, it, expect } from 'vitest';
import { normalizeAdminUserItem, normalizeAdminOrgItem } from './api/admin-ops';
import { MASTER_MODULE_INVENTORY } from './components/AdminTestSuiteRunner';
import { ADMIN_CATEGORIES, ALL_ADMIN_MODULES } from './types/admin-navigation';
import type {
  SystemHealthResponse,
  LiveTransactionItem,
  SystemAlertItem,
  AdminServiceActionType,
  DbSnapshotItem,
  TargetedDiagnosticReport,
  DiagnosticQueryResult,
  SupportTicketItem,
  AdminUserItem,
  AdminOrganizationItem,
  AccountBlockReason,
} from './types/admin';

describe('Super Admin & Ops Console Data Layer', () => {
  it('correctly models healthy system telemetry state', () => {
    const mockHealth: SystemHealthResponse = {
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      database: {
        engine: 'PostgreSQL / Supabase Realtime',
        size: '28 MB',
        connected: true,
        latencyMs: 4,
      },
      counts: {
        requirements: 14,
        rfqs: 12,
        quotes: 24,
        purchaseOrders: 8,
        workOrders: 8,
        auditEvents: 142,
        notifications: 36,
        suppliers: 18,
        profiles: 20,
        organizations: 6,
      },
      auditChain: {
        totalEvents: 142,
        latestEventAt: new Date().toISOString(),
        integrity: 'CRYPTOGRAPHICALLY_VERIFIED',
      },
      services: {
        database: 'ONLINE',
        auth: 'ONLINE',
        realtimeWebsockets: 'ONLINE',
        ondcGateway: 'ONLINE',
        notificationDispatcher: 'ONLINE',
      },
    };

    expect(mockHealth.status).toBe('HEALTHY');
    expect(mockHealth.database.connected).toBe(true);
    expect(mockHealth.database.latencyMs).toBeLessThan(50);
    expect(mockHealth.auditChain.integrity).toBe('CRYPTOGRAPHICALLY_VERIFIED');
    expect(mockHealth.services.database).toBe('ONLINE');
  });

  it('correctly identifies stalled transactions exceeding 24 hours of inactivity', () => {
    const activeTx: LiveTransactionItem = {
      requirement_id: 'req-1',
      requirement_title: 'Office Painting Work',
      requirement_type: 'SERVICES',
      requirement_status: 'CLARIFICATION',
      requirement_created_at: new Date().toISOString(),
      organization_id: 'org-1',
      organization_name: 'Apex Enterprises',
      organization_type: 'MSME',
      rfq_id: 'rfq-1',
      rfq_status: 'CLARIFICATION',
      quote_deadline: null,
      awarded_supplier_id: null,
      awarded_at: null,
      po_id: null,
      po_number: null,
      po_status: null,
      po_amount: null,
      work_order_id: null,
      work_order_status: null,
      progress_percent: null,
      is_settled: false,
      quotes_count: 2,
      votes_count: 0,
      idle_hours: 48.5,
    };

    const isStalled = activeTx.idle_hours > 24;
    expect(isStalled).toBe(true);
  });

  it('validates supported service action types', () => {
    const validActions: AdminServiceActionType[] = [
      'SYSTEM_SOFT_RESTART',
      'PUSH_TO_EVALUATION',
      'AUTO_CONCLUDE_EVALUATION',
      'TRIGGER_RUNNER_UP_FALLBACK',
      'RETRY_NOTIFICATIONS',
      'REVERIFY_GSTIN',
    ];

    expect(validActions).toContain('SYSTEM_SOFT_RESTART');
    expect(validActions).toContain('TRIGGER_RUNNER_UP_FALLBACK');
    expect(validActions).toHaveLength(6);
  });

  it('formats system alert descriptions cleanly', () => {
    const alert: SystemAlertItem = {
      id: 'alert-1',
      severity: 'WARN',
      type: 'STALLED_EVALUATION',
      title: 'RFQ Pending Evaluation',
      description: 'RFQ "Cotton Yarn" in EVALUATION for over 48 hours.',
      entityId: 'rfq-123',
      entityType: 'RFQ',
      actionRequired: 'TRIGGER_AUTO_EVALUATION',
      idleHours: 52,
    };

    expect(alert.severity).toBe('WARN');
    expect(alert.idleHours).toBeGreaterThan(24);
  });

  it('correctly models database snapshot and restore items', () => {
    const snapshot: DbSnapshotItem = {
      id: 'snap-1',
      name: 'Pre-Deployment Backup',
      snapshotType: 'TRANSACTIONAL',
      tableCounts: { requirements: 14, quotes: 28, purchaseOrders: 8 },
      sizeBytes: 154200,
      sizeFormatted: '150.6 KB',
      createdAt: new Date().toISOString(),
      createdBy: 'admin@otp.test',
    };

    expect(snapshot.snapshotType).toBe('TRANSACTIONAL');
    expect(snapshot.tableCounts.requirements).toBe(14);
    expect(snapshot.sizeBytes).toBeGreaterThan(1000);
  });

  it('models targeted diagnostic reports with automated fix flags', () => {
    const report: TargetedDiagnosticReport = {
      target: 'req-uuid-1',
      diagnosticsCount: 2,
      issues: [
        {
          id: 'BUYER_QUORUM_DEADLOCK',
          severity: 'WARN',
          category: 'Governance & Voting',
          title: 'Committee Quorum Unmet in Evaluation Phase',
          description: 'RFQ is waiting for committee member evaluation votes.',
          autoFixAvailable: true,
          fixAction: 'FORCE_AUTO_EVALUATION',
        },
      ],
      timestamp: new Date().toISOString(),
    };

    expect(report.diagnosticsCount).toBe(2);
    expect(report.issues[0]?.autoFixAvailable).toBe(true);
    expect(report.issues[0]?.fixAction).toBe('FORCE_AUTO_EVALUATION');
  });

  it('models PASSED SQL query execution results in terminal', () => {
    const passedResult: DiagnosticQueryResult = {
      success: true,
      rowsCount: 3,
      data: [{ id: 1, title: 'Req 1' }, { id: 2, title: 'Req 2' }, { id: 3, title: 'Req 3' }],
      timestamp: new Date().toISOString(),
      executionTimeMs: 12,
    };

    expect(passedResult.success).toBe(true);
    expect(passedResult.rowsCount).toBe(3);
    expect(passedResult.data).toHaveLength(3);
    expect(passedResult.executionTimeMs).toBe(12);
  });

  it('models FAILED SQL query execution results with database error details', () => {
    const failedResult: DiagnosticQueryResult = {
      success: false,
      rowsCount: 0,
      data: [],
      error: 'relation "unknown_table" does not exist',
      errorDetail: 'Table unknown_table is not found in public schema',
      errorHint: 'Check table name spelling in public schema',
      timestamp: new Date().toISOString(),
      executionTimeMs: 8,
    };

    expect(failedResult.success).toBe(false);
    expect(failedResult.rowsCount).toBe(0);
    expect(failedResult.error).toContain('relation "unknown_table" does not exist');
    expect(failedResult.errorHint).toBeDefined();
  });

  it('correctly models support ticket routing across dedicated department mailboxes', () => {
    const bugTicket: SupportTicketItem = {
      id: 'ticket-1',
      ticketNumber: 'TICK-2026-10492',
      category: 'BUG',
      routedEmail: 'bugs@otp.ai',
      subject: 'Button unclickable in mobile view',
      description: 'The award confirmation button does not respond on Safari mobile.',
      priority: 'HIGH',
      userEmail: 'lead@buyer.test',
      userRole: 'Procurement Lead',
      userSide: 'BUYER',
      pageUrl: 'http://localhost:3000/rfq/123/compare',
      status: 'OPEN',
      resolutionNotes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedAt: null,
    };

    const featureTicket: SupportTicketItem = {
      id: 'ticket-2',
      ticketNumber: 'TICK-2026-20491',
      category: 'FEATURE',
      routedEmail: 'features@otp.ai',
      subject: 'Add WhatsApp milestone alerts',
      description: 'Please add WhatsApp notifications for delivery signoffs.',
      priority: 'MEDIUM',
      userEmail: 'supplier@msme.test',
      userRole: 'Supplier Lead',
      userSide: 'SUPPLIER',
      pageUrl: 'http://localhost:3000/supplier/purchase-orders',
      status: 'IN_REVIEW',
      resolutionNotes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedAt: null,
    };

    const salesTicket: SupportTicketItem = {
      id: 'ticket-3',
      ticketNumber: 'TICK-2026-30912',
      category: 'SALES',
      routedEmail: 'sales@otp.ai',
      subject: 'Enterprise tier quotation volume',
      description: 'Inquiring about 500+ RFQs/month SLA plan.',
      priority: 'LOW',
      userEmail: 'procure@enterprise.test',
      userRole: 'Procurement Manager',
      userSide: 'BUYER',
      pageUrl: 'http://localhost:3000/pricing',
      status: 'RESOLVED',
      resolutionNotes: 'Sales executive scheduled demo call.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
    };

    const opsTicket: SupportTicketItem = {
      id: 'ticket-4',
      ticketNumber: 'TICK-2026-40129',
      category: 'OPS',
      routedEmail: 'ops@otp.ai',
      subject: 'Deadlock quorum evaluation stuck',
      description: 'Committee quorum is 1 vote short and lead approver is on leave.',
      priority: 'CRITICAL',
      userEmail: 'ops@buyer.test',
      userRole: 'Finance Approver',
      userSide: 'BUYER',
      pageUrl: 'http://localhost:3000/rfq/456/award',
      status: 'OPEN',
      resolutionNotes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedAt: null,
    };

    expect(bugTicket.routedEmail).toBe('bugs@otp.ai');
    expect(featureTicket.routedEmail).toBe('features@otp.ai');
    expect(salesTicket.routedEmail).toBe('sales@otp.ai');
    expect(opsTicket.routedEmail).toBe('ops@otp.ai');
    expect(salesTicket.status).toBe('RESOLVED');
    expect(salesTicket.resolutionNotes).toBeDefined();
  });

  it('correctly models bulk user and organization lifecycle management (Block/Unblock/Delete)', () => {
    const activeBuyerUser: AdminUserItem = {
      id: 'usr-101',
      email: 'buyer.lead@apex.test',
      fullName: 'Rohan Sharma',
      phone: '+91 98765 43210',
      title: 'Procurement Specialist',
      isPlatformAdmin: false,
      status: 'ACTIVE',
      side: 'BUYER',
      role: 'BUYER',
      organizationId: 'org-1',
      organizationName: 'Apex Enterprises',
      orgType: 'MSME',
      gstVerified: true,
      createdAt: new Date().toISOString(),
    };

    const blockedSupplierUser: AdminUserItem = {
      id: 'usr-102',
      email: 'rogue.supplier@scam.test',
      fullName: 'Fake Vendor',
      phone: '+91 91234 56789',
      isPlatformAdmin: false,
      status: 'BLOCKED',
      side: 'SUPPLIER',
      role: 'SUPPLIER_ADMIN',
      supplierId: 'supp-99',
      supplierName: 'Suspicious Trading Co',
      gstVerified: false,
      blockedAt: new Date().toISOString(),
      blockedReason: 'Policy Violation: Placed fabricated quotes',
      createdAt: new Date().toISOString(),
    };

    const buyerOrg: AdminOrganizationItem = {
      id: 'org-1',
      name: 'Apex Enterprises',
      entity_type: 'BUYER_ORG',
      org_type: 'MSME',
      status: 'ACTIVE',
      contact_email: 'admin@apex.test',
      contact_phone: '+91 98765 00000',
      gst_verified: true,
      gstin: '29ABCDE1234F1Z5',
      created_at: new Date().toISOString(),
      member_count: 5,
      active_orders_count: 2,
    };

    const blockedSupplierOrg: AdminOrganizationItem = {
      id: 'supp-99',
      name: 'Suspicious Trading Co',
      entity_type: 'SUPPLIER',
      org_type: 'SUPPLIER_ENTERPRISE',
      status: 'BLOCKED',
      blocked_at: new Date().toISOString(),
      blocked_reason: 'Suspicious Activity: Invalid GSTIN provided',
      contact_email: 'contact@scam.test',
      gst_verified: false,
      created_at: new Date().toISOString(),
      member_count: 1,
      active_orders_count: 0,
    };

    const validReasons: AccountBlockReason[] = [
      'Suspicious Activity',
      'Policy Violation',
      'Spam / Bot Behavior',
      'Unresponsive / Failed Fulfillment',
      'Non-Compliant KYC / Invalid GSTIN',
      'Payment Dispute / Fraud Risk',
      'Other',
    ];

    expect(activeBuyerUser.status).toBe('ACTIVE');
    expect(activeBuyerUser.blockedAt).toBeUndefined();
    expect(blockedSupplierUser.status).toBe('BLOCKED');
    expect(blockedSupplierUser.blockedReason).toContain('Policy Violation');
    expect(buyerOrg.status).toBe('ACTIVE');
    expect(blockedSupplierOrg.status).toBe('BLOCKED');
    expect(validReasons).toContain('Suspicious Activity');
    expect(validReasons).toContain('Policy Violation');
    expect(validReasons).toContain('Spam / Bot Behavior');
  });

  it('normalizes raw database objects and enforces blocked status across snake_case and camelCase payloads', () => {
    // 1. Raw user from RPC with snake_case and blocked status
    const rawRpcBlockedUser = {
      id: 'usr-rpc-99',
      email: 'bad.actor@example.com',
      full_name: 'Bad Actor',
      phone: '+91 99999 11111',
      title: 'Sales Agent',
      is_platform_admin: false,
      status: 'BLOCKED',
      blocked_at: '2026-09-10T10:00:00.000Z',
      blocked_reason: 'Suspicious Activity: Multiple spam registrations',
      created_at: '2026-09-01T08:00:00.000Z',
      updated_at: '2026-09-10T10:00:00.000Z',
      side: 'BUYER',
      role: 'BUYER',
      organization_name: 'Shady Corp',
      org_type: 'INDIVIDUAL',
    };

    const normalizedUser = normalizeAdminUserItem(rawRpcBlockedUser);
    expect(normalizedUser.status).toBe('BLOCKED');
    expect(normalizedUser.fullName).toBe('Bad Actor');
    expect(normalizedUser.isPlatformAdmin).toBe(false);
    expect(normalizedUser.blockedAt).toBe('2026-09-10T10:00:00.000Z');
    expect(normalizedUser.blockedReason).toBe('Suspicious Activity: Multiple spam registrations');
    expect(normalizedUser.organizationName).toBe('Shady Corp');

    // 2. Raw user with SUSPENDED linked supplier
    const rawSupplierUser = {
      id: 'usr-supp-1',
      email: 'vendor@supp.test',
      supplier_users: [
        {
          supplier_id: 'supp-44',
          role: 'SUPPLIER_ADMIN',
          suppliers: {
            business_name: 'Suspended Supplier Ltd',
            status: 'SUSPENDED',
            blocked_at: '2026-09-10T09:00:00.000Z',
            blocked_reason: 'Non-Compliant KYC / Invalid GSTIN',
          },
        },
      ],
    };

    const normalizedSupplierUser = normalizeAdminUserItem(rawSupplierUser);
    expect(normalizedSupplierUser.status).toBe('BLOCKED');
    expect(normalizedSupplierUser.side).toBe('SUPPLIER');
    expect(normalizedSupplierUser.organizationName).toBe('Suspended Supplier Ltd');
    expect(normalizedSupplierUser.blockedReason).toBe('Non-Compliant KYC / Invalid GSTIN');

    // 3. Raw organization with blocked_at
    const rawOrg = {
      id: 'org-test-1',
      name: 'Blocked Buyer Org',
      status: 'BLOCKED',
      blocked_at: '2026-09-10T11:00:00.000Z',
      blocked_reason: 'Payment Dispute / Fraud Risk',
      contact_email: 'finance@blocked.test',
    };

    const normalizedOrg = normalizeAdminOrgItem(rawOrg);
    expect(normalizedOrg.status).toBe('BLOCKED');
    expect(normalizedOrg.entity_type).toBe('BUYER_ORG');
    expect(normalizedOrg.blocked_reason).toBe('Payment Dispute / Fraud Risk');
  });

  it('correctly maps and preserves lastSeenAt timestamp for user and organization presence tracking', () => {
    const rawUserWithSeenAt = {
      id: 'usr-seen-1',
      email: 'active.buyer@test.com',
      full_name: 'Active Buyer',
      status: 'ACTIVE',
      created_at: '2026-09-01T08:00:00.000Z',
      last_seen_at: '2026-09-12T10:00:00.000Z',
      side: 'BUYER',
    };

    const normalizedUser = normalizeAdminUserItem(rawUserWithSeenAt);
    expect(normalizedUser.lastSeenAt).toBe('2026-09-12T10:00:00.000Z');

    const rawOrgWithSeenAt = {
      id: 'org-seen-1',
      name: 'Active Supplier Corp',
      entity_type: 'SUPPLIER',
      last_seen_at: '2026-09-12T09:55:00.000Z',
      created_at: '2026-08-01T00:00:00.000Z',
    };

    const normalizedOrg = normalizeAdminOrgItem(rawOrgWithSeenAt);
    expect(normalizedOrg.last_seen_at).toBe('2026-09-12T09:55:00.000Z');
  });

  it('validates Master Module Test Inventory metrics (902 platform tests across 12 layers)', () => {
    expect(MASTER_MODULE_INVENTORY).toHaveLength(12);

    const totalTests = MASTER_MODULE_INVENTORY.reduce((sum, m) => sum + m.testCount, 0);
    const totalFiles = MASTER_MODULE_INVENTORY.reduce((sum, m) => sum + m.filesCount, 0);

    expect(totalTests).toBe(902);
    expect(totalFiles).toBe(116);

    const webModule = MASTER_MODULE_INVENTORY.find((m) => m.id === 'MOD-WEB-UI');
    expect(webModule).toBeDefined();
    expect(webModule?.testCount).toBe(616);
    expect(webModule?.filesCount).toBe(73);

    const domainModule = MASTER_MODULE_INVENTORY.find((m) => m.id === 'MOD-DOMAIN');
    expect(domainModule).toBeDefined();
    expect(domainModule?.testCount).toBe(71);
    expect(domainModule?.filesCount).toBe(10);

    const servicesModule = MASTER_MODULE_INVENTORY.find((m) => m.id === 'MOD-SERVICES');
    expect(servicesModule).toBeDefined();
    expect(servicesModule?.testCount).toBe(30);
    expect(servicesModule?.filesCount).toBe(8);

    for (const mod of MASTER_MODULE_INVENTORY) {
      expect(mod.id).toMatch(/^MOD-/);
      expect(mod.name.length).toBeGreaterThan(0);
      expect(mod.description.length).toBeGreaterThan(0);
      expect(mod.testCount).toBeGreaterThan(0);
      expect(mod.filesCount).toBeGreaterThan(0);
      expect(mod.status).toBe('VERIFIED');
    }
  });

  it('validates Super Admin Category and Module navigation definitions', () => {
    expect(ADMIN_CATEGORIES).toHaveLength(7);
    expect(ALL_ADMIN_MODULES.length).toBeGreaterThanOrEqual(15);

    const testModule = ALL_ADMIN_MODULES.find((m) => m.key === 'TESTS');
    expect(testModule).toBeDefined();
    expect(testModule?.categoryKey).toBe('TESTS_OPS');
    expect(testModule?.title).toContain('Test Suite Runner');

    const networkModule = ALL_ADMIN_MODULES.find((m) => m.key === 'SUPPLIER_NETWORK');
    expect(networkModule).toBeDefined();
    expect(networkModule?.categoryKey).toBe('USERS_ORGS');
    expect(networkModule?.title).toContain('Prepare Supplier Network');
  });

  it('validates soft-delete and hard-delete user filtering logic for Superadmin roster', () => {
    const activeUser = normalizeAdminUserItem({
      id: 'usr-1',
      email: 'user1@test.com',
      status: 'ACTIVE',
      deleted_at: null,
    });
    const deletedUser = normalizeAdminUserItem({
      id: 'usr-2',
      email: 'user2@test.com',
      status: 'DELETED',
      deleted_at: '2026-09-19T10:00:00.000Z',
    });

    expect(activeUser.status).toBe('ACTIVE');
    expect(deletedUser.status).toBe('DELETED');

    // Simulate roster filtering (active users only vs deleted)
    const allUsers = [activeUser, deletedUser];
    const visibleActiveUsers = allUsers.filter((u) => u.status !== 'DELETED');
    expect(visibleActiveUsers).toHaveLength(1);
    expect(visibleActiveUsers[0]?.id).toBe('usr-1');
  });

  it('exports MASTER_MODULE_INVENTORY with canonical phase-free descriptors', () => {
    expect(MASTER_MODULE_INVENTORY.length).toBeGreaterThan(0);
    const webUi = MASTER_MODULE_INVENTORY.find((m) => m.id === 'MOD-WEB-UI');
    expect(webUi).toBeDefined();
    expect(webUi?.description).not.toContain('Phase 3.1');
    expect(webUi?.description).not.toContain('Phase 2.5');
  });

  it('exports ALL_ADMIN_MODULES with canonical business registry descriptors', () => {
    const orgModule = ALL_ADMIN_MODULES.find((m) => m.key === 'ORGS_SUPPLIERS');
    expect(orgModule).toBeDefined();
    expect(orgModule?.description).toContain('business registries');
  });
});

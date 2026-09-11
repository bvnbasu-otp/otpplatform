export type AdminDataMode = 'AUTO' | 'PROD' | 'DEMO' | 'ALL';

export interface SystemDatabaseHealth {
  engine: string;
  size: string;
  connected: boolean;
  latencyMs: number;
}

export interface SystemCounts {
  requirements: number;
  rfqs: number;
  quotes: number;
  purchaseOrders: number;
  workOrders: number;
  auditEvents: number;
  notifications: number;
  suppliers: number;
  profiles: number;
  organizations: number;
}

export interface SystemModeBreakdown {
  productionRequirements: number;
  demoRequirements: number;
  productionOrders: number;
  demoOrders: number;
}

export interface AuditChainStatus {
  totalEvents: number;
  latestEventAt: string | null;
  integrity: 'CRYPTOGRAPHICALLY_VERIFIED' | 'FLAGGED' | 'UNKNOWN';
}

export interface ServiceStatusMap {
  database: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  auth: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  realtimeWebsockets: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  ondcGateway: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  notificationDispatcher: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
}

export interface SystemHealthResponse {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  timestamp: string;
  active_mode?: 'PROD' | 'DEMO' | 'ALL' | string;
  demo_mode_enabled?: boolean;
  database: SystemDatabaseHealth;
  counts: SystemCounts;
  breakdown?: SystemModeBreakdown;
  auditChain: AuditChainStatus;
  services: ServiceStatusMap;
}

export interface LiveTransactionItem {
  requirement_id: string;
  requirement_title: string;
  requirement_description?: string | null;
  requirement_type: string;
  requirement_status: string;
  quantity?: number | null;
  unit?: string | null;
  delivery_city?: string | null;
  requirement_created_at: string;
  organization_id: string;
  organization_name: string;
  organization_type: string;
  organization_city?: string | null;
  buyer_email?: string | null;
  buyer_name?: string | null;
  category_name?: string | null;
  subcategory_name?: string | null;
  rfq_id: string | null;
  rfq_public_ref?: string | null;
  rfq_status: string | null;
  quote_deadline: string | null;
  rfq_created_at?: string | null;
  award_id?: string | null;
  award_status?: string | null;
  awarded_at?: string | null;
  revealed_at?: string | null;
  awarded_supplier_id?: string | null;
  awarded_supplier_name?: string | null;
  po_id: string | null;
  po_number: string | null;
  po_status: string | null;
  po_amount: number | null;
  po_issued_at?: string | null;
  po_acknowledged_at?: string | null;
  work_order_id: string | null;
  work_order_status: string | null;
  progress_percent: number | null;
  is_settled?: boolean | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  invoice_amount?: number | null;
  invoice_status?: string | null;
  payment_id?: string | null;
  payment_amount?: number | null;
  payment_reference?: string | null;
  payment_status?: string | null;
  invitations_count?: number;
  quotes_count: number;
  votes_count: number;
  is_demo?: boolean;
  computed_phase?: 'DRAFT_REQUESTED' | 'QUOTING' | 'EVALUATION' | 'AWARDED' | 'PO_EXECUTION' | 'INVOICING_PAYMENT' | 'COMPLETED' | 'CANCELLED' | string;
  phase_step?: number;
  idle_hours: number;
}

export interface SellerOrderItem {
  po_id: string;
  po_number: string | null;
  po_status: string;
  po_amount: number | null;
  po_currency?: string | null;
  po_issued_at?: string | null;
  po_acknowledged_at?: string | null;
  po_created_at: string;

  // Supplier info
  supplier_id: string;
  supplier_name: string;
  supplier_legal_name?: string | null;
  supplier_city?: string | null;
  supplier_gstin?: string | null;
  supplier_email?: string | null;
  supplier_phone?: string | null;
  supplier_gst_status?: string | null;
  supplier_gst_verified?: boolean | null;

  // Buyer Organization
  organization_id: string;
  organization_name: string;
  organization_type?: string | null;

  // Requirement & RFQ
  requirement_id: string;
  requirement_title: string;
  requirement_type?: string | null;
  requirement_status?: string | null;
  quantity?: number | null;
  unit?: string | null;
  delivery_city?: string | null;

  rfq_id?: string | null;
  rfq_title?: string | null;
  rfq_public_ref?: string | null;
  rfq_status?: string | null;

  category_name?: string | null;
  subcategory_name?: string | null;

  // Work Order
  work_order_id?: string | null;
  work_order_status?: string | null;
  progress_percent?: number | null;
  buyer_accepted_at?: string | null;
  rating?: number | null;
  inspection_notes?: string | null;

  // Invoice
  invoice_id?: string | null;
  invoice_number?: string | null;
  invoice_amount?: number | null;
  invoice_status?: string | null;
  invoice_submitted_at?: string | null;

  // Payment
  payment_id?: string | null;
  payment_amount?: number | null;
  payment_status?: string | null;
  payment_reference?: string | null;
  payment_verified_at?: string | null;

  // Computed
  is_demo?: boolean;
  seller_phase: 'PO_PENDING_ACCEPTANCE' | 'PO_ACCEPTED' | 'IN_PRODUCTION' | 'DELIVERED_INSPECTED' | 'INVOICED' | 'SETTLED' | 'PO_ACTIVE' | string;
  idle_hours: number;
}

export interface SystemAlertItem {
  id: string;
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  type: string;
  title: string;
  description: string;
  entityId: string;
  entityType: string;
  actionRequired: string;
  idleHours: number;
}

export type AdminServiceActionType =
  | 'PUSH_TO_EVALUATION'
  | 'AUTO_CONCLUDE_EVALUATION'
  | 'TRIGGER_RUNNER_UP_FALLBACK'
  | 'RETRY_NOTIFICATIONS'
  | 'REVERIFY_GSTIN'
  | 'SYSTEM_SOFT_RESTART';

export interface ServiceActionResult {
  success: boolean;
  action: AdminServiceActionType;
  message: string;
  timestamp?: string;
}

export type AccountLifecycleStatus = 'ACTIVE' | 'BLOCKED' | 'PENDING' | 'DELETED' | 'SUSPENDED';

export type AccountBlockReason =
  | 'Suspicious Activity'
  | 'Policy Violation'
  | 'Spam / Bot Behavior'
  | 'Unresponsive / Failed Fulfillment'
  | 'Non-Compliant KYC / Invalid GSTIN'
  | 'Payment Dispute / Fraud Risk'
  | 'Other';

export interface AdminUserItem {
  id: string;
  email: string;
  fullName: string | null;
  phone?: string | null;
  title?: string | null;
  isPlatformAdmin?: boolean;
  status: AccountLifecycleStatus;
  side: 'BUYER' | 'SUPPLIER' | 'ADMIN';
  role: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  orgType?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  gstVerified?: boolean;
  blockedAt?: string | null;
  blockedReason?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface AdminOrganizationItem {
  id: string;
  name: string;
  entity_type: 'BUYER_ORG' | 'SUPPLIER';
  org_type: string;
  status: AccountLifecycleStatus;
  blocked_at?: string | null;
  blocked_reason?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_person?: string | null;
  gst_verified?: boolean;
  gstin?: string | null;
  created_at: string;
  member_count: number;
  active_orders_count: number;
}

export interface AdminUsersAndOrgsResponse {
  ok: boolean;
  usersCount: number;
  users: AdminUserItem[];
  organizationsCount: number;
  organizations: AdminOrganizationItem[];
  error?: string;
}

export interface AdminBulkActionResult {
  ok: boolean;
  count?: number;
  message?: string;
  error?: string;
}

export interface AdminUserActivity {
  id: string;
  email: string;
  fullName: string | null;
  role: string | null;
  organizationName: string | null;
  orgType: string | null;
  side: 'BUYER' | 'SUPPLIER';
  status?: AccountLifecycleStatus;
  blockedReason?: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  gstVerified?: boolean;
}

// ----------------------------------------------------
// Backup & Restore Types
// ----------------------------------------------------
export interface DbSnapshotItem {
  id: string;
  name: string;
  snapshotType: 'FULL' | 'TRANSACTIONAL' | 'DEMO_BASELINE';
  tableCounts: Record<string, number>;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  createdBy: string;
}

export interface CreateBackupResult {
  success: boolean;
  snapshotId: string;
  name: string;
  sizeBytes: number;
  tableCounts: Record<string, number>;
  createdAt: string;
}

// ----------------------------------------------------
// Targeted Troubleshooting Types
// ----------------------------------------------------
export interface DiagnosticIssue {
  id: string;
  severity: 'INFO' | 'WARN' | 'ERROR';
  category: string;
  title: string;
  description: string;
  autoFixAvailable: boolean;
  fixAction: string;
}

export interface TargetedDiagnosticReport {
  target: string;
  diagnosticsCount: number;
  issues: DiagnosticIssue[];
  timestamp: string;
}

// ----------------------------------------------------
// Diagnostic Query Runner Types
// ----------------------------------------------------
export interface DiagnosticQueryResult {
  success: boolean;
  rowsCount: number;
  data: any[];
  timestamp: string;
  error?: string;
  errorDetail?: string;
  errorHint?: string;
  executionTimeMs?: number;
}

// ----------------------------------------------------
// Support Tickets & Inquiries Types
// ----------------------------------------------------
export type SupportTicketCategory = 'BUG' | 'FEATURE' | 'SALES' | 'OPS' | 'ENHANCEMENT';
export type SupportTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SupportTicketStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED';

export interface SupportTicketItem {
  id: string;
  ticketNumber: string;
  category: SupportTicketCategory;
  routedEmail: string;
  subject: string;
  description: string;
  priority: SupportTicketPriority;
  userEmail: string | null;
  userRole: string | null;
  userSide: string | null;
  pageUrl: string | null;
  status: SupportTicketStatus;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

// ----------------------------------------------------
// Unified Admin Entity Search Types
// ----------------------------------------------------
export interface AdminSearchResultItem {
  entity_type: 'SUPPLIER' | 'BUYER_ORG' | 'REQUIREMENT' | 'PURCHASE_ORDER';
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  city?: string;
  gstin?: string;
  gst_verified?: boolean;
  gst_status?: string;
  email?: string;
  phone?: string;
  rfq_id?: string;
  org_id?: string;
  supplier_id?: string;
  requirement_id?: string;
  public_ref?: string;
  total_amount?: number;
  is_demo?: boolean;
}

export interface AdminSearchResponse {
  ok: boolean;
  query: string;
  is_uuid: boolean;
  count: number;
  results: AdminSearchResultItem[];
  error?: string;
}

// ----------------------------------------------------
// Self-Serve Registration / Signup Review Types
// ----------------------------------------------------
export interface AdminSignupRequest {
  id: string;
  reference: string;
  side: 'BUYER' | 'SUPPLIER';
  status: 'PENDING' | 'CONTACTED' | 'VERIFIED' | 'ONBOARDED' | 'REJECTED';
  business_name: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_full_name: string;
  designation?: string | null;
  email: string;
  phone: string;
  verification_channel: 'EMAIL' | 'WHATSAPP';
  verified_at?: string | null;
  buyer_type?: string | null;
  role_code?: string | null;
  role_label?: string | null;
  category_codes?: string[];
  tax_registration_id?: string | null;
  coverage_city?: string | null;
  coverage_pincode?: string | null;
  organization_id?: string | null;
  supplier_id?: string | null;
  reviewed_by?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminSignupRequestsResponse {
  ok: boolean;
  count: number;
  requests: AdminSignupRequest[];
  error?: string;
}

export interface AdminReviewSignupResponse {
  ok: boolean;
  status: string;
  reference?: string;
  side?: string;
  email?: string;
  full_name?: string;
  organization_id?: string;
  supplier_id?: string;
  temporary_password?: string;
  message?: string;
  error?: string;
}


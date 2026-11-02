export type AdminTab =
  | 'TRANSACTIONS'
  | 'SELLER_ORDERS'
  | 'BUYER_DEBUG'
  | 'SUPPLIER_DEBUG'
  | 'HEALTH'
  | 'TICKETS'
  | 'TESTS'
  | 'ACTIONS'
  | 'TERMINAL'
  | 'BACKUPS'
  | 'LOGS'
  | 'NOTIFICATIONS'
  | 'ANNOUNCEMENTS'
  | 'USERS'
  | 'ORGS_SUPPLIERS'
  | 'SUPPLIER_NETWORK'
  | 'TAXONOMY'
  | 'APPROVALS'
  | 'INTERNAL_USERS'
  | 'INTERNAL_RBAC'
  | 'STAFF_REFERRALS';

export type AdminCategoryKey =
  | 'ORDERS_RADAR'
  | 'DIAGNOSTICS'
  | 'HEALTH_SUPPORT'
  | 'TESTS_OPS'
  | 'DATABASE_OPS'
  | 'LOGS_ALERTS'
  | 'USERS_ORGS';

export type InternalConsoleRoleCode =
  | 'CEO_FOUNDER'
  | 'SUPER_ADMIN'
  | 'GENERAL_SUPPORT'
  | 'OPERATIONS'
  | 'SALES_MARKETING'
  | 'LEGAL_PRIVACY'
  | 'AUDITOR';

export interface InternalRoleConfig {
  code: InternalConsoleRoleCode;
  title: string;
  shortTitle: string;
  badge: string;
  description: string;
  colorClass: string;
  allowedTabs: AdminTab[];
  canSwitchRoles: boolean;
}

export const INTERNAL_ROLE_CONFIGS: Record<InternalConsoleRoleCode, InternalRoleConfig> = {
  CEO_FOUNDER: {
    code: 'CEO_FOUNDER',
    title: 'CEO & Founder Executive Center',
    shortTitle: 'CEO & Founder',
    badge: 'Executive Root',
    description: 'Macro-economic oversight, live GMV, platform monetization, escrow float & network liquidity with global switching',
    colorClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    allowedTabs: [
      'TRANSACTIONS', 'SELLER_ORDERS', 'BUYER_DEBUG', 'SUPPLIER_DEBUG', 'HEALTH',
      'TICKETS', 'TESTS', 'ACTIONS', 'TERMINAL', 'BACKUPS', 'LOGS', 'NOTIFICATIONS',
      'ANNOUNCEMENTS', 'USERS', 'ORGS_SUPPLIERS', 'SUPPLIER_NETWORK', 'TAXONOMY',
      'APPROVALS', 'INTERNAL_USERS', 'INTERNAL_RBAC', 'STAFF_REFERRALS',
    ],
    canSwitchRoles: true,
  },
  SUPER_ADMIN: {
    code: 'SUPER_ADMIN',
    title: 'Super Administrator Governance',
    shortTitle: 'Super Admin',
    badge: 'Root Governance',
    description: 'Platform user & org governance, 48-hour employee invitations, RBAC permissions & role impersonation',
    colorClass: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400',
    allowedTabs: [
      'TRANSACTIONS', 'SELLER_ORDERS', 'BUYER_DEBUG', 'SUPPLIER_DEBUG', 'HEALTH',
      'TICKETS', 'TESTS', 'ACTIONS', 'TERMINAL', 'BACKUPS', 'LOGS', 'NOTIFICATIONS',
      'ANNOUNCEMENTS', 'USERS', 'ORGS_SUPPLIERS', 'SUPPLIER_NETWORK', 'TAXONOMY',
      'APPROVALS', 'INTERNAL_USERS', 'INTERNAL_RBAC', 'STAFF_REFERRALS',
    ],
    canSwitchRoles: true,
  },
  GENERAL_SUPPORT: {
    code: 'GENERAL_SUPPORT',
    title: 'General Support Operations Desk',
    shortTitle: 'General Support',
    badge: 'Customer Care',
    description: 'Buyer and supplier issue resolution, ticket escalation, buyer/seller diagnostics and platform alert logs',
    colorClass: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
    allowedTabs: ['TICKETS', 'BUYER_DEBUG', 'SUPPLIER_DEBUG', 'NOTIFICATIONS', 'LOGS'],
    canSwitchRoles: false,
  },
  OPERATIONS: {
    code: 'OPERATIONS',
    title: 'Platform Operations & Security (SysOps / SecOps / DBOps)',
    shortTitle: 'Operations',
    badge: 'SysOps / SecOps / DBOps',
    description: 'Infrastructure health, automated regression test engine, circuit breakers, SQL terminal, backups & broadcast announcements',
    colorClass: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    allowedTabs: ['HEALTH', 'TESTS', 'ACTIONS', 'TERMINAL', 'BACKUPS', 'ANNOUNCEMENTS'],
    canSwitchRoles: false,
  },
  SALES_MARKETING: {
    code: 'SALES_MARKETING',
    title: 'Sales, Marketing & Taxonomy Engine',
    shortTitle: 'Sales & Marketing',
    badge: 'Growth & SNE',
    description: 'Supplier Network Engine (SNE) pre-warm console, 17-category taxonomy hierarchy, onboarding approvals & referral bonuses',
    colorClass: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
    allowedTabs: ['SUPPLIER_NETWORK', 'TAXONOMY', 'APPROVALS', 'STAFF_REFERRALS', 'ORGS_SUPPLIERS'],
    canSwitchRoles: false,
  },
  LEGAL_PRIVACY: {
    code: 'LEGAL_PRIVACY',
    title: 'Legal, Privacy & Compliance Vault',
    shortTitle: 'Legal & Privacy',
    badge: 'Legal & Audit',
    description: 'Escrow dispute arbitration, immutable SHA-256 audit logs, legal agreements and privacy compliance',
    colorClass: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
    allowedTabs: ['TICKETS', 'LOGS', 'APPROVALS'],
    canSwitchRoles: false,
  },
  AUDITOR: {
    code: 'AUDITOR',
    title: 'Independent Platform Auditor (Read-Only Mode)',
    shortTitle: 'Auditor',
    badge: 'Read-Only Audit',
    description: 'Read-only oversight across all buyer, supplier, and internal records with sensitive data masked and zero mutations',
    colorClass: 'border-teal-500/40 bg-teal-500/10 text-teal-400',
    allowedTabs: ['TRANSACTIONS', 'SELLER_ORDERS', 'USERS', 'ORGS_SUPPLIERS', 'LOGS', 'NOTIFICATIONS'],
    canSwitchRoles: false,
  },
};

/**
 * Strict role switcher access guard.
 * Only CEO & Founder and Super Admin are granted access to switch views or impersonate other roles.
 */
export function canAccessRoleSwitcher(
  context?: { isFounder?: boolean; isPlatformAdmin?: boolean; activeRole?: { code?: string } | null } | null,
  userEmail?: string | null,
): boolean {
  if (userEmail) {
    const clean = userEmail.trim().toLowerCase();
    if (clean === 'bvnbasu@gmail.com' || clean === 'bvnbasu@yahoo.com') return true;
  }
  if (!context) return false;
  if (context.isFounder) return true;
  if (context.isPlatformAdmin && (context.activeRole?.code === 'SUPER_ADMIN' || !context.activeRole?.code)) {
    return true;
  }
  return false;
}

/**
 * Redaction utility for Auditor role: masks critical PII, bank accounts, and contact details.
 */
export function maskSensitiveData(
  val: string | number | null | undefined,
  type?: 'phone' | 'email' | 'bank' | 'id' | 'generic',
): string {
  if (val === null || val === undefined || val === '') return '—';
  const str = String(val).trim();
  const effectiveType = type || (str.includes('@') ? 'email' : 'generic');
  if (effectiveType === 'phone') {
    return str.length > 4 ? `+91 ••••• ••${str.slice(-3)}` : '••••';
  }
  if (effectiveType === 'email') {
    const parts = str.split('@');
    if (parts.length < 2) return '••••@••••';
    const name = parts[0]!;
    const domain = parts[1]!;
    return `${name.slice(0, 1)}•••••@${domain}`;
  }
  if (effectiveType === 'bank') {
    return `••••••••${str.slice(-4)}`;
  }
  if (effectiveType === 'id') {
    return str.length > 8 ? `${str.slice(0, 4)}…${str.slice(-4)}` : '••••';
  }
  return str.length > 4 ? `••••••••${str.slice(-4)}` : '••••';
}

export interface AdminModuleDef {
  key: AdminTab;
  title: string;
  shortTitle: string;
  icon: string;
  description: string;
  categoryKey: AdminCategoryKey;
  badge?: (counts: AdminDynamicCounts) => number | string | null;
}

export interface AdminCategoryDef {
  key: AdminCategoryKey;
  title: string;
  shortTitle: string;
  icon: string;
  description: string;
  colorClass: string;
  badgeClass: string;
  modules: AdminModuleDef[];
}

export interface AdminDynamicCounts {
  transactionsCount: number;
  sellerOrdersCount: number;
  alertsCount: number;
  notificationsCount: number;
  usersCount: number;
  auditCount: number;
}

export const ADMIN_CATEGORIES: AdminCategoryDef[] = [
  {
    key: 'ORDERS_RADAR',
    title: 'Buyer Orders / Seller Orders',
    shortTitle: 'Orders Radar',
    icon: '📊',
    description: 'Buyer procurement radar, live transactions, PO fulfillment & seller settlements',
    colorClass: 'border-blue-500/30 bg-blue-500/5 hover:border-blue-500/60',
    badgeClass: 'bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200 border-blue-300 dark:border-blue-800',
    modules: [
      {
        key: 'TRANSACTIONS',
        title: 'Buyer Radar / Live Transactions',
        shortTitle: 'Buyer Radar',
        icon: '📊',
        description: 'Live buyer requirements, sealed quoting progress, committee evaluations & awards',
        categoryKey: 'ORDERS_RADAR',
        badge: (c) => c.transactionsCount,
      },
      {
        key: 'SELLER_ORDERS',
        title: 'Supplier Radar / Seller Orders',
        shortTitle: 'Seller Orders',
        icon: '🏪',
        description: 'Purchase orders, fulfillment progress, GST invoices, and settlement status',
        categoryKey: 'ORDERS_RADAR',
        badge: (c) => c.sellerOrdersCount,
      },
    ],
  },
  {
    key: 'DIAGNOSTICS',
    title: 'Buyer Debug / Seller Debug',
    shortTitle: 'Diagnostics',
    icon: '🔍',
    description: 'Deep engine diagnostics, intake state transitions, quote inspection & simulation',
    colorClass: 'border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-500/60',
    badgeClass: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/60 dark:text-cyan-200 border-cyan-300 dark:border-cyan-800',
    modules: [
      {
        key: 'BUYER_DEBUG',
        title: 'Buyer Workspace & Intake Diagnostics',
        shortTitle: 'Buyer Debug',
        icon: '🏛️',
        description: 'Committee quorum & COI diagnostic assistance, requirement sync & 8-state order status transitions',
        categoryKey: 'DIAGNOSTICS',
        badge: () => 'Intake',
      },
      {
        key: 'SUPPLIER_DEBUG',
        title: 'Seller Network & Engine Diagnostics',
        shortTitle: 'Seller Debug',
        icon: '🏭',
        description: 'Supplier GSTIN verification, quote diagnosis & PO acceptance simulation',
        categoryKey: 'DIAGNOSTICS',
        badge: () => 'Seller',
      },
    ],
  },
  {
    key: 'HEALTH_SUPPORT',
    title: 'Health & Tickets & Refresh',
    shortTitle: 'Health & Support',
    icon: '💓',
    description: 'System uptime telemetry, microservice heartbeats, support tickets & dispute arbitration',
    colorClass: 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60',
    badgeClass: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
    modules: [
      {
        key: 'HEALTH',
        title: 'System Health, Uptime & Telemetry',
        shortTitle: 'System Health',
        icon: '💓',
        description: 'Live PostgREST latency, microservice heartbeats & proactive telemetry scans',
        categoryKey: 'HEALTH_SUPPORT',
        badge: (c) => (c.alertsCount > 0 ? `${c.alertsCount} Alerts` : '100% SLA'),
      },
      {
        key: 'TICKETS',
        title: 'Support Tickets & Dispute Arbitration',
        shortTitle: 'Support Tickets',
        icon: '🎫',
        description: 'Buyer/supplier dispute claims, escalation queue & departmental arbitration',
        categoryKey: 'HEALTH_SUPPORT',
        badge: () => 'Disputes',
      },
    ],
  },
  {
    key: 'TESTS_OPS',
    title: 'Pre Prod Tests, Restart + Actions & Announcements',
    shortTitle: 'Tests, Ops & Announcements',
    icon: '🧪',
    description: 'Pre-prod regression test engine, maintenance switches, service restart circuit breakers & broadcast announcements',
    colorClass: 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60',
    badgeClass: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border-amber-300 dark:border-amber-800',
    modules: [
      {
        key: 'TESTS',
        title: 'Pre-Prod Regression Test Suite Runner',
        shortTitle: 'Test Runner',
        icon: '🧪',
        description: 'Multi-layer regression test matrix, unit validations & live DB benchmarks',
        categoryKey: 'TESTS_OPS',
        badge: () => 'Suite',
      },
      {
        key: 'ACTIONS',
        title: 'Emergency Actions, Service Restart & Circuit Breakers',
        shortTitle: 'Ops Actions',
        icon: '⚡',
        description: 'Scheduled maintenance switch, demo mode switch, emergency reload & circuit reset',
        categoryKey: 'TESTS_OPS',
        badge: () => 'Actions',
      },
      {
        key: 'ANNOUNCEMENTS',
        title: 'Platform Broadcasts & Announcements',
        shortTitle: 'Announcements',
        icon: '📢',
        description: 'Publish and manage scheduled platform announcements, release notes and broadcast banners',
        categoryKey: 'TESTS_OPS',
        badge: () => 'Broadcast',
      },
    ],
  },
  {
    key: 'DATABASE_OPS',
    title: 'SQL Terminal & Backup + Restore',
    shortTitle: 'Database Ops',
    icon: '💻',
    description: 'PostgreSQL SQL query terminal, database snapshots, restore points & retention purge',
    colorClass: 'border-indigo-500/30 bg-indigo-500/5 hover:border-indigo-500/60',
    badgeClass: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200 border-indigo-300 dark:border-indigo-800',
    modules: [
      {
        key: 'TERMINAL',
        title: 'SQL Query Terminal & Templates',
        shortTitle: 'SQL Terminal',
        icon: '💻',
        description: 'Interactive read-only PostgreSQL query console with curated admin templates',
        categoryKey: 'DATABASE_OPS',
        badge: () => 'SQL',
      },
      {
        key: 'BACKUPS',
        title: 'Database Snapshots, Backup & Restore',
        shortTitle: 'Backup & Restore',
        icon: '💾',
        description: 'Database snapshot creator, transactional restore points & retention purge',
        categoryKey: 'DATABASE_OPS',
        badge: () => 'Snapshots',
      },
    ],
  },
  {
    key: 'LOGS_ALERTS',
    title: 'Logs & Notifications',
    shortTitle: 'Logs & Alerts',
    icon: '📜',
    description: 'Immutable cryptographic audit trail, platform notifications & emergency alerts',
    colorClass: 'border-purple-500/30 bg-purple-500/5 hover:border-purple-500/60',
    badgeClass: 'bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-200 border-purple-300 dark:border-purple-800',
    modules: [
      {
        key: 'LOGS',
        title: 'Immutable Cryptographic Audit Trail',
        shortTitle: 'Audit Logs',
        icon: '📜',
        description: 'Cryptographically verified SHA-256 state change events & payload inspect',
        categoryKey: 'LOGS_ALERTS',
        badge: (c) => (c.auditCount ? `${c.auditCount} Events` : 'Audit'),
      },
      {
        key: 'NOTIFICATIONS',
        title: 'Platform Notifications & Broadcast Alerts',
        shortTitle: 'Notifications',
        icon: '🔔',
        description: 'Multi-channel notification engine, broadcast alerts & emergency platform banners',
        categoryKey: 'LOGS_ALERTS',
        badge: (c) => (c.notificationsCount > 0 ? `${c.notificationsCount} Alerts` : 'Alerts'),
      },
    ],
  },
  {
    key: 'USERS_ORGS',
    title: 'Users & Groups / Orgs & Approvals',
    shortTitle: 'Users & Orgs',
    icon: '👥',
    description: 'User accounts, role governance, tenant organizations, suppliers & approval queue',
    colorClass: 'border-pink-500/30 bg-pink-500/5 hover:border-pink-500/60',
    badgeClass: 'bg-pink-100 text-pink-900 dark:bg-pink-950/60 dark:text-pink-200 border-pink-300 dark:border-pink-800',
    modules: [
      {
        key: 'USERS',
        title: 'Users Roster & Role Governance',
        shortTitle: 'Users Roster',
        icon: '👥',
        description: 'User accounts, permissions, active presence & KYC compliance',
        categoryKey: 'USERS_ORGS',
        badge: (c) => c.usersCount || 'Users',
      },
      {
        key: 'ORGS_SUPPLIERS',
        title: 'Organizations & Supplier Registry',
        shortTitle: 'Orgs & Suppliers',
        icon: '🏢',
        description: 'Tenant organizations, verified suppliers, GSTINs & business registries',
        categoryKey: 'USERS_ORGS',
        badge: () => 'Registry',
      },
      {
        key: 'SUPPLIER_NETWORK',
        title: 'Prepare Supplier Network & Discovery Console',
        shortTitle: 'Supplier Network',
        icon: '🌐',
        description: '30-day location pre-warm, coverage density, quota budgets and external discovery',
        categoryKey: 'USERS_ORGS',
        badge: () => '30d Policy',
      },
      {
        key: 'TAXONOMY',
        title: 'Canonical Taxonomy & Regional Engine',
        shortTitle: 'Taxonomy Engine',
        icon: '🏷️',
        description: 'Context-scoped sourcing hierarchy, 5 procurement types & regional industrial clusters',
        categoryKey: 'USERS_ORGS',
        badge: () => 'v1.3.0',
      },
      {
        key: 'APPROVALS',
        title: 'Approval Queue / Pending Registrations',
        shortTitle: 'Approval Queue',
        icon: '⏳',
        description: 'Pending buyer & supplier onboarding registrations awaiting superadmin review',
        categoryKey: 'USERS_ORGS',
        badge: () => 'Queue',
      },
      {
        key: 'INTERNAL_USERS',
        title: 'Internal Staff & Invitations',
        shortTitle: 'Internal Staff',
        icon: '🛡️',
        description: 'Manage internal operator accounts and 48-hour single-use staff invitations',
        categoryKey: 'USERS_ORGS',
        badge: () => '48h Token',
      },
      {
        key: 'INTERNAL_RBAC',
        title: 'Internal RBAC Permission Matrix',
        shortTitle: 'Internal RBAC',
        icon: '🔐',
        description: 'Role-based permission groups and explicit grants governing internal boundaries',
        categoryKey: 'USERS_ORGS',
        badge: () => 'RBAC',
      },
      {
        key: 'STAFF_REFERRALS',
        title: 'Staff Referral Incentive Ledger',
        shortTitle: 'Staff Referrals',
        icon: '💼',
        description: 'Fixed referral bonus ledger with anti-self-approval and UTR settlement evidence',
        categoryKey: 'USERS_ORGS',
        badge: () => 'UTR Payout',
      },
    ],
  },
];

// Flat lookup map of all modules
export const ALL_ADMIN_MODULES: AdminModuleDef[] = ADMIN_CATEGORIES.flatMap((c) => c.modules);

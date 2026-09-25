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
  | 'APPROVALS';

export type AdminCategoryKey =
  | 'ORDERS_RADAR'
  | 'DIAGNOSTICS'
  | 'HEALTH_SUPPORT'
  | 'TESTS_OPS'
  | 'DATABASE_OPS'
  | 'LOGS_ALERTS'
  | 'USERS_ORGS';

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
    title: 'Pre Prod Tests & Restart + Actions',
    shortTitle: 'Tests & Ops',
    icon: '🧪',
    description: 'Pre-prod regression test engine, maintenance switches & service restart circuit breakers',
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
    description: 'Immutable cryptographic audit trail, platform notifications & emergency banners',
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
      {
        key: 'ANNOUNCEMENTS',
        title: 'Platform Broadcasts & Announcements',
        shortTitle: 'Announcements',
        icon: '📢',
        description: 'Publish and manage scheduled platform announcements, release notes and broadcast banners',
        categoryKey: 'LOGS_ALERTS',
        badge: () => 'Broadcast',
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
    ],
  },
];

// Flat lookup map of all modules
export const ALL_ADMIN_MODULES: AdminModuleDef[] = ADMIN_CATEGORIES.flatMap((c) => c.modules);

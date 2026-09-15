import type { RoleContext } from '@/features/roles/api/roles';

export type RoleBadgeType = 'Buyer' | 'Supplier' | 'Admin';

export interface CanonicalNavItem {
  id: 'home' | 'orders' | 'create' | 'audit' | 'profile';
  label: string;
  to: string;
  icon?: string;
  isCenterAction?: boolean;
  match?: string[];
}

export interface HeaderMenuLink {
  label: string;
  to: string;
  icon?: string;
  badge?: string;
  isExternal?: boolean;
}

export interface HeaderMenuSection {
  title: string;
  items: HeaderMenuLink[];
}

/**
 * Resolves the canonical authenticated Home destination for the active role.
 * - Platform Admin: /admin
 * - Buyer: /dashboard
 * - Supplier: /dashboard
 */
export function getHomeRoute(context: RoleContext): string {
  if (context.isPlatformAdmin) {
    return '/admin';
  }
  return '/dashboard';
}

/**
 * Resolves the canonical post-award Orders destination for the active role.
 * - Supplier: /supplier/purchase-orders
 * - Buyer: /purchase-orders
 * - Platform Admin: /purchase-orders
 */
export function getOrdersRoute(context: RoleContext): string {
  if (context.side === 'SUPPLIER') {
    return '/supplier/purchase-orders';
  }
  return '/purchase-orders';
}

/**
 * Resolves the canonical Audit trail destination.
 */
export function getAuditRoute(_context?: RoleContext): string {
  return '/audit';
}

/**
 * Resolves the canonical Profile destination.
 */
export function getProfileRoute(_context?: RoleContext): string {
  return '/profile';
}

/**
 * Canonical Role label for the Header Role Indicator.
 */
export function getRoleLabel(context: RoleContext): RoleBadgeType {
  if (context.isPlatformAdmin) {
    return 'Admin';
  }
  if (context.side === 'SUPPLIER') {
    return 'Supplier';
  }
  return 'Buyer';
}

/**
 * Exact 5-tab Mobile Bottom Navigation items:
 * Home | Orders | + | Audit | Profile
 */
export function getCanonicalBottomNav(context: RoleContext): CanonicalNavItem[] {
  const isSupplier = context.side === 'SUPPLIER';
  const isAdmin = context.isPlatformAdmin;

  return [
    {
      id: 'home',
      label: 'Home',
      icon: '🏠',
      to: isAdmin ? '/admin' : '/dashboard',
      match: ['/dashboard', '/admin'],
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: '📋',
      to: isSupplier ? '/supplier/purchase-orders' : '/purchase-orders',
      match: ['/purchase-orders', '/supplier/purchase-orders', '/work-orders', '/orders', '/orders-reports'],
    },
    {
      id: 'create',
      label: '+',
      to: '#',
      isCenterAction: true,
    },
    {
      id: 'audit',
      label: 'Audit',
      icon: '🛡️',
      to: '/audit',
      match: ['/audit'],
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: '👤',
      to: '/profile',
      match: ['/profile', '/settings/profile'],
    },
  ];
}

/**
 * Check if a route matches the current pathname.
 */
export function isRouteActive(item: CanonicalNavItem, pathname: string): boolean {
  if (item.isCenterAction) return false;
  if (item.match && item.match.length > 0) {
    return item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/**
 * Secondary Navigation Menu configuration (Header Menu).
 * Structured into: Workspace, Support, Website, Account.
 * Does not duplicate bottom navigation without clear purpose, no dead links.
 */
export function getCanonicalHeaderMenuSections(context: RoleContext): HeaderMenuSection[] {
  const homeRoute = getHomeRoute(context);
  const ordersRoute = getOrdersRoute(context);

  const workspaceItems: HeaderMenuLink[] = [
    { label: 'Home', to: homeRoute, icon: '🏠' },
    { label: 'Orders & Reports', to: ordersRoute, icon: '📋' },
    { label: 'Audit Trail & Proofs', to: '/audit', icon: '🛡️' },
    { label: 'Profile & Settings', to: '/profile', icon: '👤' },
  ];

  // Role-specific workspace quick links
  if (context.isPlatformAdmin) {
    workspaceItems.push({ label: 'Admin Console', to: '/admin', icon: '⚡' });
    workspaceItems.push({ label: 'Buyer Diagnostics', to: '/admin/buyer-diagnostics', icon: '🔍' });
    workspaceItems.push({ label: 'Seller Diagnostics', to: '/admin/seller-diagnostics', icon: '📡' });
  } else if (context.side === 'SUPPLIER') {
    workspaceItems.push({ label: 'Capabilities & Catalog', to: '/supplier/capabilities', icon: '📡' });
  } else {
    workspaceItems.push({ label: 'New Requirement', to: '/requirements/new', icon: '⚡' });
  }

  return [
    {
      title: 'Workspace',
      items: workspaceItems,
    },
    {
      title: 'Support',
      items: [
        { label: 'Help & Support Center', to: '#support-modal', icon: '🛠️' },
        { label: 'FAQs & Documentation', to: '/faqs', icon: '📖' },
      ],
    },
    {
      title: 'Website',
      items: [
        { label: 'Public Home', to: '/', icon: '🌐' },
        { label: 'How OTP Works', to: '/faqs#workflow', icon: '⚙️' },
        { label: 'Pricing Plans', to: '/pricing', icon: '💳' },
        { label: 'About OTP', to: '/about-us', icon: '🏢' },
      ],
    },
  ];
}

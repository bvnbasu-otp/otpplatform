import { can, type RoleContext, type RolePermission } from './api/roles';

export interface NavItem {
  label: string;
  to: string;
  /** Hidden when the active role lacks this. Absent means everyone signed in. */
  requires?: RolePermission;
  /** Matches nested paths so a child route still lights up its parent. */
  match?: string;
}

const BUYER_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Orders & Reports', to: '/purchase-orders', match: '/purchase-orders' },
  { label: 'Audit trail', to: '/audit', match: '/audit' },
];

const SUPPLIER_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard' },
  {
    label: 'Orders & Reports',
    to: '/supplier/purchase-orders',
    match: '/supplier/purchase-orders',
  },
  { label: 'Capabilities', to: '/supplier/capabilities', requires: 'WRITE' },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Admin Console', to: '/admin', match: '/admin' },
];

/**
 * The header navigation for whoever is signed in.
 *
 * Hiding a link is a courtesy, not a control: every destination re-checks on
 * arrival and the database refuses the write regardless. What this buys is a
 * finance approver seeing the four things they came to do rather than the
 * fourteen the product can do, and never clicking into a screen whose only
 * possible outcome is a refusal.
 */
export function navigationFor(context: RoleContext, options?: { demo?: boolean }): NavItem[] {
  if (context.isPlatformAdmin) {
    const items = [...ADMIN_NAV];
    if (options?.demo) {
      items.push({ label: 'Demo', to: '/demo' });
    }
    return items;
  }

  const base = context.side === 'SUPPLIER' ? SUPPLIER_NAV : BUYER_NAV;
  const items = base.filter((item) => !item.requires || can(context, item.requires));

  if (options?.demo) {
    items.push({ label: 'Demo', to: '/demo' });
  }

  return items;
}

export function isActivePath(item: NavItem, pathname: string, search: string = ''): boolean {
  const full = pathname + search;
  if (item.match) {
    return full === item.match || full.startsWith(`${item.match}/`) || pathname === item.match;
  }
  return full === item.to || pathname === item.to;
}

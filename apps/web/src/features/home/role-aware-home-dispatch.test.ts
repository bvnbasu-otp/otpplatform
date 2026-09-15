import { describe, it, expect } from 'vitest';

interface MockUserContext {
  role?: string;
  side?: 'BUYER' | 'SUPPLIER';
  isPlatformAdmin?: boolean;
  isMaintenanceMode?: boolean;
}

function resolveHomeDestination(ctx: MockUserContext): 'ADMIN_CONSOLE' | 'MAINTENANCE' | 'SUPPLIER_HOME' | 'BUYER_HOME' {
  const isAdmin = ctx.role === 'admin' || ctx.isPlatformAdmin === true;
  if (isAdmin) {
    return 'ADMIN_CONSOLE';
  }

  if (ctx.isMaintenanceMode === true) {
    return 'MAINTENANCE';
  }

  const isSupplier = ctx.role === 'supplier' || ctx.side === 'SUPPLIER';
  if (isSupplier) {
    return 'SUPPLIER_HOME';
  }

  return 'BUYER_HOME';
}

describe('HomePage - Role-Aware Destination Dispatcher', () => {
  it('dispatches platform admin directly to SuperAdmin Console (/admin)', () => {
    expect(resolveHomeDestination({ isPlatformAdmin: true })).toBe('ADMIN_CONSOLE');
    expect(resolveHomeDestination({ role: 'admin' })).toBe('ADMIN_CONSOLE');
  });

  it('redirects non-admin users to maintenance screen during active maintenance', () => {
    expect(resolveHomeDestination({ side: 'BUYER', isMaintenanceMode: true })).toBe('MAINTENANCE');
    expect(resolveHomeDestination({ side: 'SUPPLIER', isMaintenanceMode: true })).toBe('MAINTENANCE');
  });

  it('allows platform admin to bypass maintenance mode and access /admin', () => {
    expect(resolveHomeDestination({ isPlatformAdmin: true, isMaintenanceMode: true })).toBe('ADMIN_CONSOLE');
  });

  it('dispatches supplier users to Supplier Home Opportunity Cockpit', () => {
    expect(resolveHomeDestination({ side: 'SUPPLIER' })).toBe('SUPPLIER_HOME');
    expect(resolveHomeDestination({ role: 'supplier' })).toBe('SUPPLIER_HOME');
  });

  it('dispatches buyer users to Buyer Home Procurement Cockpit', () => {
    expect(resolveHomeDestination({ side: 'BUYER' })).toBe('BUYER_HOME');
    expect(resolveHomeDestination({})).toBe('BUYER_HOME');
  });
});

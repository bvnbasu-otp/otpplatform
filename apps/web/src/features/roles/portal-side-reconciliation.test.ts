import { describe, expect, it } from 'vitest';
import {
  reconcilePortalSide,
  normalizeRolePermissions,
  type HeldRole,
  type RoleDefinition,
} from './api/roles';

const SUPPLIER_FOUNDER: RoleDefinition = {
  code: 'SUPPLIER_FOUNDER',
  side: 'SUPPLIER',
  label: 'Supplier Founder',
  description: '',
  permissions: ['READ', 'WRITE'],
};

function held(role: RoleDefinition): HeldRole {
  return { ...role, assignedByAdmin: false };
}

describe('reconcilePortalSide (supplier persona routing)', () => {
  it('prefers SUPPLIER when portal side is stale BUYER but only supplier roles are held', () => {
    const side = reconcilePortalSide(
      'BUYER',
      SUPPLIER_FOUNDER,
      [held(SUPPLIER_FOUNDER)],
      'sup-1',
    );
    expect(side).toBe('SUPPLIER');
  });

  it('keeps BUYER when the person explicitly holds both buyer and supplier roles', () => {
    const buyerRole: RoleDefinition = {
      code: 'PROCUREMENT_LEAD',
      side: 'BUYER',
      label: 'Procurement Lead',
      description: '',
      permissions: ['READ', 'WRITE'],
    };
    const side = reconcilePortalSide(
      'BUYER',
      SUPPLIER_FOUNDER,
      [held(SUPPLIER_FOUNDER), held(buyerRole)],
      'sup-1',
    );
    expect(side).toBe('BUYER');
  });
});

describe('normalizeRolePermissions (workspace pane crash guard)', () => {
  it('returns an empty array when permissions are missing from the RPC payload', () => {
    expect(normalizeRolePermissions(undefined)).toEqual([]);
    expect(normalizeRolePermissions(null)).toEqual([]);
    expect(normalizeRolePermissions('READ')).toEqual([]);
  });
});

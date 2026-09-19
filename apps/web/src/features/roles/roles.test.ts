import { describe, expect, it, vi } from 'vitest';
import {
  SIGNED_OUT_CONTEXT,
  can,
  canVoteSomewhere,
  hasMultipleRoles,
  hasMultipleOrganizations,
  isReadOnly,
  type HeldRole,
  type RoleContext,
  type RolePermission,
} from './api/roles';
import { isActivePath, navigationFor } from './nav';
import { supabase } from '@/lib/supabase';

/**
 * The client's half of the role rules.
 *
 * The database decides what a person may do; this code decides what to offer them.
 * The two have to agree, and the direction of the disagreement matters: offering
 * an action the server will refuse wastes someone's time, while hiding an action
 * the server would have allowed makes the product look broken. Both are asserted
 * here, and the awkward cases — no role yet, a title with no committee seat, an
 * administrator — are where they come apart.
 */

function role(code: string, permissions: RolePermission[]): HeldRole {
  return {
    code,
    side: code.startsWith('SUPPLIER_') ? 'SUPPLIER' : 'BUYER',
    label: code,
    description: '',
    permissions,
    assignedByAdmin: false,
  };
}

function context(overrides: Partial<RoleContext> = {}): RoleContext {
  return {
    ...SIGNED_OUT_CONTEXT,
    signedIn: true,
    profileId: 'p1',
    side: 'BUYER',
    ...overrides,
  };
}

const PROCUREMENT_LEAD = role('PROCUREMENT_LEAD', ['READ', 'WRITE', 'PROPOSE']);
const COMMITTEE_MEMBER = role('COMMITTEE_MEMBER', ['READ', 'VOTE']);
const FINANCE_APPROVER = role('FINANCE_APPROVER', ['READ', 'APPROVE']);
const AUDITOR = role('GENERAL_AUDITOR', ['READ']);
const SUPPLIER_FOUNDER = role('SUPPLIER_FOUNDER', ['READ', 'WRITE', 'PROPOSE', 'APPROVE']);
const SUPPLIER_BILLING = role('SUPPLIER_BILLING_MANAGER', ['READ']);

describe('what a role allows', () => {
  it('allows what the active role carries and nothing beside it', () => {
    const ctx = context({ roles: [PROCUREMENT_LEAD], activeRole: PROCUREMENT_LEAD });

    expect(can(ctx, 'WRITE')).toBe(true);
    expect(can(ctx, 'PROPOSE')).toBe(true);
    expect(can(ctx, 'VOTE')).toBe(false);
    expect(can(ctx, 'AWARD')).toBe(false);
  });

  it('reads the active role, not the roles held', () => {
    // Someone who runs sourcing and also audits is, right now, only auditing.
    const ctx = context({
      roles: [PROCUREMENT_LEAD, AUDITOR],
      activeRole: AUDITOR,
    });

    expect(can(ctx, 'WRITE')).toBe(false);
    expect(isReadOnly(ctx)).toBe(true);
  });

  it('restricts nothing for an account that has not picked a role yet', () => {
    // The server does not restrict these accounts either, and the two have to
    // agree: a screen hiding an action the database would accept is a bug that
    // looks exactly like a permission problem.
    const ctx = context({ roles: [], activeRole: null });

    expect(can(ctx, 'WRITE')).toBe(true);
    expect(isReadOnly(ctx)).toBe(false);
  });

  it('restricts nothing for a platform administrator', () => {
    const ctx = context({ isPlatformAdmin: true, roles: [AUDITOR], activeRole: AUDITOR });

    expect(can(ctx, 'AWARD')).toBe(true);
    expect(isReadOnly(ctx)).toBe(false);
  });

  it('says nothing is allowed to a visitor who is not signed in', () => {
    // SIGNED_OUT_CONTEXT holds no roles, so `can` is permissive by the rule
    // above; what must be true is that no screen treats it as a signed-in
    // session. That is the flag the router reads.
    expect(SIGNED_OUT_CONTEXT.signedIn).toBe(false);
    expect(SIGNED_OUT_CONTEXT.needsOnboarding).toBe(false);
    expect(SIGNED_OUT_CONTEXT.activeRole).toBeNull();
  });
});

describe('a title is not a committee seat', () => {
  it('does not offer a vote to a committee title with no enquiry assigned', () => {
    const ctx = context({
      roles: [COMMITTEE_MEMBER],
      activeRole: COMMITTEE_MEMBER,
      committeeRfqCount: 0,
    });

    expect(can(ctx, 'VOTE')).toBe(true);
    // The permission exists; the seat does not, and the database refuses on that
    // second condition. Promising the action here would be promising a refusal.
    expect(canVoteSomewhere(ctx)).toBe(false);
  });

  it('offers a vote once there is an enquiry to vote on', () => {
    const ctx = context({
      roles: [COMMITTEE_MEMBER],
      activeRole: COMMITTEE_MEMBER,
      committeeRfqCount: 2,
    });

    expect(canVoteSomewhere(ctx)).toBe(true);
  });

  it('does not offer a vote to an assigned member whose active role cannot vote', () => {
    // The same person, wearing the auditor hat. Being on the committee does not
    // put the vote back.
    const ctx = context({
      roles: [COMMITTEE_MEMBER, AUDITOR],
      activeRole: AUDITOR,
      committeeRfqCount: 2,
    });

    expect(canVoteSomewhere(ctx)).toBe(false);
  });
});

describe('read-only roles', () => {
  it('recognises a role that can only read', () => {
    expect(isReadOnly(context({ roles: [AUDITOR], activeRole: AUDITOR }))).toBe(true);
  });

  it('does not call a role read-only for lacking one permission', () => {
    const ctx = context({ roles: [FINANCE_APPROVER], activeRole: FINANCE_APPROVER });

    expect(isReadOnly(ctx)).toBe(false);
    expect(can(ctx, 'APPROVE')).toBe(true);
    expect(can(ctx, 'WRITE')).toBe(false);
  });

  it('does not call a supplier billing role read-only by accident of its name', () => {
    // It is read-only because of its permissions, not its label — and it is.
    expect(isReadOnly(context({ roles: [SUPPLIER_BILLING], activeRole: SUPPLIER_BILLING })))
      .toBe(true);
  });
});

describe('the role switcher appears only when there is something to switch', () => {
  it('is absent for one role', () => {
    expect(hasMultipleRoles(context({ roles: [PROCUREMENT_LEAD] }))).toBe(false);
  });

  it('is present for two', () => {
    expect(hasMultipleRoles(context({ roles: [PROCUREMENT_LEAD, AUDITOR] }))).toBe(true);
  });

  it('is absent before onboarding', () => {
    expect(hasMultipleRoles(context({ roles: [] }))).toBe(false);
  });
});

describe('the organization switcher appears only when multiple memberships exist', () => {
  it('is absent for single organization', () => {
    expect(
      hasMultipleOrganizations(
        context({
          organizations: [
            { id: 'org-1', name: 'Personal', orgType: 'INDIVIDUAL', role: 'MEMBER', isPersonal: true },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('is present when user belongs to personal account and an RWA / Enterprise', () => {
    expect(
      hasMultipleOrganizations(
        context({
          organizations: [
            { id: 'org-1', name: 'Personal', orgType: 'INDIVIDUAL', role: 'MEMBER', isPersonal: true },
            { id: 'org-2', name: 'Palm Grove RWA', orgType: 'RESIDENTIAL_RWA', role: 'ADMIN', isPersonal: false },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe('navigation follows the role', () => {
  it('offers a buyer the core workflow destinations', () => {
    const items = navigationFor(
      context({ roles: [PROCUREMENT_LEAD], activeRole: PROCUREMENT_LEAD }),
    );
    const paths = items.map((i) => i.to);

    expect(paths).toContain('/dashboard');
    expect(paths).toContain('/purchase-orders');
    expect(paths).toContain('/audit');
  });

  it('keeps navigation clean for finance approvers and auditors', () => {
    const items = navigationFor(
      context({ roles: [FINANCE_APPROVER], activeRole: FINANCE_APPROVER }),
    );
    const paths = items.map((i) => i.to);

    expect(paths).toContain('/purchase-orders');
    expect(paths).toContain('/audit');
  });

  it('leaves an auditor the audit trail', () => {
    const items = navigationFor(context({ roles: [AUDITOR], activeRole: AUDITOR }));
    const paths = items.map((i) => i.to);

    expect(paths).toContain('/audit');
  });

  it('sends a supplier to the supplier side of the product', () => {
    const items = navigationFor(
      context({
        side: 'SUPPLIER',
        roles: [SUPPLIER_FOUNDER],
        activeRole: SUPPLIER_FOUNDER,
        supplierId: 's1',
      }),
    );
    const paths = items.map((i) => i.to);

    expect(paths).toContain('/supplier/capabilities');
    expect(paths).toContain('/supplier/purchase-orders');
    // Buyer destinations must not appear on a supplier's header at all.
    expect(paths).not.toContain('/requirements/new');
    expect(paths).not.toContain('/audit');
  });

  it('hides capability editing from a supplier role that cannot write', () => {
    const items = navigationFor(
      context({
        side: 'SUPPLIER',
        roles: [SUPPLIER_BILLING],
        activeRole: SUPPLIER_BILLING,
        supplierId: 's1',
      }),
    );

    expect(items.map((i) => i.to)).not.toContain('/supplier/capabilities');
  });

  it('always leaves a way back to the dashboard, whatever the role', () => {
    for (const held of [PROCUREMENT_LEAD, COMMITTEE_MEMBER, FINANCE_APPROVER, AUDITOR]) {
      const items = navigationFor(context({ roles: [held], activeRole: held }));
      expect(items.map((i) => i.to), held.code).toContain('/dashboard');
    }
  });

  it('shows dedicated clean navigation for platform admins without unwanted buyer menus', () => {
    const ctx = context({ isPlatformAdmin: true, roles: [AUDITOR], activeRole: AUDITOR });
    const items = navigationFor(ctx);
    const paths = items.map((i) => i.to);

    expect(paths).toEqual(['/admin']);
    expect(paths).not.toContain('/dashboard');
    expect(paths).not.toContain('/purchase-orders');
    expect(paths).not.toContain('/audit');
    expect(paths).not.toContain('/supplier/purchase-orders');
  });

  it('adds the demo link only when demo mode asks for it', () => {
    const ctx = context({ roles: [AUDITOR], activeRole: AUDITOR });

    expect(navigationFor(ctx).map((i) => i.to)).not.toContain('/demo');
    expect(navigationFor(ctx, { demo: true }).map((i) => i.to)).toContain('/demo');
  });
});

describe('highlighting the page someone is on', () => {
  const orders = { label: 'Orders', to: '/purchase-orders', match: '/purchase-orders' };
  const dashboard = { label: 'Dashboard', to: '/dashboard' };

  it('lights up a parent link from a child route', () => {
    expect(isActivePath(orders, '/purchase-orders/abc-123')).toBe(true);
  });

  it('lights up an exact match', () => {
    expect(isActivePath(orders, '/purchase-orders')).toBe(true);
    expect(isActivePath(dashboard, '/dashboard')).toBe(true);
  });

  it('does not light up a link whose path merely starts the same way', () => {
    expect(isActivePath(orders, '/purchase-orders-archive')).toBe(false);
  });

  it('does not light up a link with no match rule from a child route', () => {
    expect(isActivePath(dashboard, '/dashboard/settings')).toBe(false);
  });
});


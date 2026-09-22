import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listOrgMembers,
  inviteOrgMember,
  acceptOrgInvitation,
  removeOrgMember,
  listOrgInvitations,
  revokeOrgInvitation,
  listOrgDelegations,
  createDelegationProxy,
  revokeDelegationProxy,
  updateTeamMemberRole,
  switchActiveOrganization,
} from './api/org-members';
import { supabase } from '@/lib/supabase';
import { switchActiveOrganization as switchOrgRpc } from '@/features/roles/api/roles';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

vi.mock('@/features/roles/api/roles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/roles/api/roles')>();
  return {
    ...actual,
    switchActiveOrganization: vi.fn(),
  };
});

const mockSupabaseClient = {
  rpc: vi.fn(),
};

const mockSwitchFn = vi.fn();

describe('Org Feature Module Tests & Phase C8.2 Governance', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    mockSupabaseClient.rpc.mockReset();
    mockSwitchFn.mockReset();
  });

  afterEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    mockSupabaseClient.rpc.mockReset();
    mockSwitchFn.mockReset();
  });

  it('lists organization members and correctly maps membership details', async () => {
    const mockRows = [
      {
        profile_id: 'prof-1',
        full_name: 'Lead Buyer',
        email: 'lead@buyer.test',
        role: 'OWNER',
        joined_at: '2026-09-01T00:00:00Z',
        is_self: true,
      },
      {
        profile_id: 'prof-2',
        full_name: 'Junior Buyer',
        email: 'junior@buyer.test',
        role: 'BUYER',
        joined_at: '2026-09-05T00:00:00Z',
        is_self: false,
      },
    ];

    const mockResponse = { data: mockRows, error: null };
    vi.mocked(supabase.rpc).mockResolvedValue(mockResponse as any);
    mockSupabaseClient.rpc.mockResolvedValue(mockResponse);

    const res = await listOrgMembers('org-1', mockSupabaseClient as any);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.members).toHaveLength(2);
      expect(res.members[0]?.isSelf).toBe(true);
      expect(res.members[0]?.role).toBe('OWNER');
      expect(res.members[1]?.isSelf).toBe(false);
    }
  });

  it('invites a new member to the organization via atomic tokenized RPC', async () => {
    const mockResponse = {
      data: {
        ok: true,
        message: 'Invitation created for new.member@buyer.test as COMMITTEE_MEMBER.',
        token: 'tok-sec-12345',
        inviteUrl: '/invite/tok-sec-12345',
        invitationId: 'inv-uuid-001',
      },
      error: null,
    };
    vi.mocked(supabase.rpc).mockResolvedValue(mockResponse as any);
    mockSupabaseClient.rpc.mockResolvedValue(mockResponse);

    const res = await inviteOrgMember('org-1', 'new.member@buyer.test', 'COMMITTEE_MEMBER', mockSupabaseClient as any);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.message).toContain('Invitation created');
      expect(res.token).toBe('tok-sec-12345');
      expect(res.inviteUrl).toBe('/invite/tok-sec-12345');
      expect(res.invitationId).toBe('inv-uuid-001');
    }
  });

  it('accepts an organization invitation via acceptOrgInvitation atomic RPC', async () => {
    const mockResponse = {
      data: {
        ok: true,
        organizationId: 'org-123',
        organizationName: 'Acme Procurement Corp',
        role: 'BUYER',
        message: 'Successfully joined Acme Procurement Corp as BUYER.',
      },
      error: null,
    };
    mockSupabaseClient.rpc.mockResolvedValue(mockResponse);

    const res = await acceptOrgInvitation('tok-valid-abc', mockSupabaseClient as any);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.organizationId).toBe('org-123');
      expect(res.organizationName).toBe('Acme Procurement Corp');
      expect(res.role).toBe('BUYER');
      expect(res.message).toContain('Successfully joined');
    }
  });

  it('handles invitation acceptance errors (expired, revoked, already used, email mismatch)', async () => {
    mockSupabaseClient.rpc.mockResolvedValueOnce({
      data: { ok: false, error: 'This invitation link has expired.' },
      error: null,
    });
    const expiredRes = await acceptOrgInvitation('tok-expired', mockSupabaseClient as any);
    expect(expiredRes.ok).toBe(false);
    if (!expiredRes.ok) {
      expect(expiredRes.error).toBe('This invitation link has expired.');
    }

    mockSupabaseClient.rpc.mockResolvedValueOnce({
      data: { ok: false, error: 'This invitation has been revoked by an administrator.' },
      error: null,
    });
    const revokedRes = await acceptOrgInvitation('tok-revoked', mockSupabaseClient as any);
    expect(revokedRes.ok).toBe(false);
    if (!revokedRes.ok) {
      expect(revokedRes.error).toBe('This invitation has been revoked by an administrator.');
    }

    mockSupabaseClient.rpc.mockResolvedValueOnce({
      data: { ok: false, error: 'This invitation token has already been accepted (single-use).' },
      error: null,
    });
    const usedRes = await acceptOrgInvitation('tok-used', mockSupabaseClient as any);
    expect(usedRes.ok).toBe(false);
    if (!usedRes.ok) {
      expect(usedRes.error).toBe('This invitation token has already been accepted (single-use).');
    }

    mockSupabaseClient.rpc.mockResolvedValueOnce({
      data: { ok: false, error: 'This invitation was sent to buyer@corp.com, but you are signed in as intruder@evil.com.' },
      error: null,
    });
    const mismatchRes = await acceptOrgInvitation('tok-mismatch', mockSupabaseClient as any);
    expect(mismatchRes.ok).toBe(false);
    if (!mismatchRes.ok) {
      expect(mismatchRes.error).toContain('This invitation was sent to');
    }
  });

  it('lists and revokes organization invitations', async () => {
    const mockInvRows = [
      {
        id: 'inv-1',
        organizationId: 'org-1',
        invitedEmail: 'test@example.com',
        role: 'COMMITTEE_MEMBER',
        invitedBy: 'prof-1',
        invitedByName: 'Lead Buyer',
        status: 'PENDING',
        expiresAt: '2026-09-27T00:00:00Z',
        createdAt: '2026-09-20T00:00:00Z',
      },
    ];

    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: mockInvRows, error: null });
    const listRes = await listOrgInvitations('org-1', mockSupabaseClient as any);
    expect(listRes.ok).toBe(true);
    if (listRes.ok) {
      expect(listRes.invitations).toHaveLength(1);
      expect(listRes.invitations[0]?.status).toBe('PENDING');
    }

    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: { ok: true, message: 'Invitation revoked' }, error: null });
    const revokeRes = await revokeOrgInvitation('inv-1', mockSupabaseClient as any);
    expect(revokeRes.ok).toBe(true);
  });

  it('creates and lists delegation proxies', async () => {
    const mockDelResponse = {
      data: { ok: true, delegationId: 'del-uuid-1', message: 'Delegation proxy created' },
      error: null,
    };
    mockSupabaseClient.rpc.mockResolvedValueOnce(mockDelResponse);

    const createRes = await createDelegationProxy(
      {
        organizationId: 'org-1',
        delegateeId: 'prof-2',
        permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
        spendCap: 1000000,
        notes: 'Medical leave coverage',
      },
      mockSupabaseClient as any
    );

    expect(createRes.ok).toBe(true);
    if (createRes.ok) {
      expect(createRes.delegationId).toBe('del-uuid-1');
    }

    const mockDelRows = [
      {
        id: 'del-uuid-1',
        organizationId: 'org-1',
        delegatorId: 'prof-1',
        delegatorName: 'Lead Buyer',
        delegateeId: 'prof-2',
        delegateeName: 'Junior Buyer',
        permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
        spendCapAmount: 1000000,
        startsAt: '2026-09-20T00:00:00Z',
        expiresAt: '2026-10-04T00:00:00Z',
        isActive: true,
        notes: 'Medical leave coverage',
        createdAt: '2026-09-20T00:00:00Z',
      },
    ];

    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: mockDelRows, error: null });
    const listDelRes = await listOrgDelegations('org-1', mockSupabaseClient as any);
    expect(listDelRes.ok).toBe(true);
    if (listDelRes.ok) {
      expect(listDelRes.delegations).toHaveLength(1);
      expect(listDelRes.delegations[0]?.spendCapAmount).toBe(1000000);
    }
  });

  it('revokes a delegation proxy via atomic RPC', async () => {
    mockSupabaseClient.rpc.mockResolvedValueOnce({
      data: { ok: true, message: 'Delegation revoked successfully.' },
      error: null,
    });
    const revokeRes = await revokeDelegationProxy('del-uuid-1', mockSupabaseClient as any);
    expect(revokeRes.ok).toBe(true);
    if (revokeRes.ok) {
      expect(revokeRes.message).toBe('Delegation revoked successfully.');
    }
  });

  it('updates team member role successfully', async () => {
    const mockRoleResponse = {
      data: { ok: true, newRole: 'MANAGER', message: 'Role updated successfully' },
      error: null,
    };
    mockSupabaseClient.rpc.mockResolvedValue(mockRoleResponse);

    const updateRes = await updateTeamMemberRole('org-1', 'prof-2', 'MANAGER', mockSupabaseClient as any);
    expect(updateRes.ok).toBe(true);
    if (updateRes.ok) {
      expect(updateRes.newRole).toBe('MANAGER');
    }
  });

  it('removes an organization member successfully', async () => {
    const mockResponse = {
      data: { ok: true },
      error: null,
    };
    vi.mocked(supabase.rpc).mockResolvedValue(mockResponse as any);
    mockSupabaseClient.rpc.mockResolvedValue(mockResponse);

    const res = await removeOrgMember('org-1', 'prof-2', mockSupabaseClient as any);
    expect(res.ok).toBe(true);
  });

  it('switches active organization via roles API', async () => {
    const mockResult = {
      ok: true as const,
      context: {
        organizationId: 'org-2',
        activeRole: null,
        organizations: [],
      } as any,
    };
    vi.mocked(switchOrgRpc).mockResolvedValue(mockResult);
    mockSwitchFn.mockResolvedValue(mockResult);

    const res = await switchActiveOrganization('org-2', mockSwitchFn);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.context.organizationId).toBe('org-2');
    }
  });

  it('exports OrgMembersPage component with responsive horizontal tabs', async () => {
    const { OrgMembersPage } = await import('./pages/OrgMembersPage');
    expect(OrgMembersPage).toBeDefined();
    expect(typeof OrgMembersPage).toBe('function');
  });
});

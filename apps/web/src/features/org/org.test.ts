import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listOrgMembers, inviteOrgMember, removeOrgMember, switchActiveOrganization } from './api/org-members';
import { supabase } from '@/lib/supabase';
import { switchActiveOrganization as switchOrgRpc } from '@/features/roles/api/roles';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

vi.mock('@/features/roles/api/roles', () => ({
  switchActiveOrganization: vi.fn(),
}));

const mockSupabaseClient = {
  rpc: vi.fn(),
};

const mockSwitchFn = vi.fn();

describe('Org Feature Module Tests', () => {
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
        role: 'ADMIN',
        joined_at: '2026-09-01T00:00:00Z',
        is_self: true,
      },
      {
        profile_id: 'prof-2',
        full_name: 'Junior Buyer',
        email: 'junior@buyer.test',
        role: 'MEMBER',
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
      expect(res.members[0]?.role).toBe('ADMIN');
      expect(res.members[1]?.isSelf).toBe(false);
    }
  });

  it('invites a new member to the organization successfully', async () => {
    const mockResponse = {
      data: { ok: true, message: 'Invite sent successfully' },
      error: null,
    };
    vi.mocked(supabase.rpc).mockResolvedValue(mockResponse as any);
    mockSupabaseClient.rpc.mockResolvedValue(mockResponse);

    const res = await inviteOrgMember('org-1', 'new.member@buyer.test', 'MEMBER', mockSupabaseClient as any);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.message).toContain('Invite sent successfully');
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
});


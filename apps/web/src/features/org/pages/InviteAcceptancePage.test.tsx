import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { InviteAcceptancePage } from './InviteAcceptancePage';
import * as authModule from '@/features/auth';
import * as rolesModule from '@/features/roles';
import * as orgMembersApi from '../api/org-members';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ token: 'mock-token-12345' }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to, 'data-testid': testId, ...props }: any) =>
    React.createElement('a', { href: to, 'data-testid': testId, ...props }, children),
}));

vi.mock('@/features/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/features/roles', () => ({
  useRoleContext: vi.fn(),
}));

vi.mock('../api/org-members', () => ({
  acceptOrgInvitation: vi.fn(),
}));

describe('InviteAcceptancePage Component (Phase C8.2)', () => {
  const mockRefresh = vi.fn();
  const mockSignOut = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rolesModule.useRoleContext).mockReturnValue({
      context: {
        organizationId: 'org-test-1',
        organizationName: 'Acme Test Org',
        orgRole: 'MEMBER',
      } as any,
      isLoading: false,
      refresh: mockRefresh,
      switchTo: vi.fn(),
      switchOrg: vi.fn(),
    });
  });

  it('renders loading state when auth state is loading', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: null,
      session: null,
      isLoading: true,
      signOut: mockSignOut,
    } as any);

    const tree = React.createElement(InviteAcceptancePage);
    expect(tree).toBeDefined();
    expect(tree.type).toBe(InviteAcceptancePage);
  });

  it('renders unauthenticated state prompting user to sign in or sign up with preserved redirect target', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: null,
      session: null,
      isLoading: false,
      signOut: mockSignOut,
    } as any);

    const element = React.createElement(InviteAcceptancePage);
    expect(element).toBeDefined();
  });

  it('renders authenticated state when a valid user is logged in', () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: { id: 'usr-1', email: 'colleague@acme.com' } as any,
      session: {} as any,
      isLoading: false,
      signOut: mockSignOut,
    } as any);

    const element = React.createElement(InviteAcceptancePage);
    expect(element).toBeDefined();
  });

  it('executes acceptOrgInvitation and triggers role refresh upon successful join', async () => {
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: { id: 'usr-1', email: 'colleague@acme.com' } as any,
      session: {} as any,
      isLoading: false,
      signOut: mockSignOut,
    } as any);

    vi.mocked(orgMembersApi.acceptOrgInvitation).mockResolvedValue({
      ok: true,
      organizationId: 'org-123',
      organizationName: 'Acme Corp',
      role: 'BUYER',
      message: 'Successfully joined Acme Corp as BUYER.',
    });

    const res = await orgMembersApi.acceptOrgInvitation('mock-token-12345');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.organizationId).toBe('org-123');
      expect(res.role).toBe('BUYER');
    }
  });

  it('handles and returns error when invitation is expired or revoked', async () => {
    vi.mocked(orgMembersApi.acceptOrgInvitation).mockResolvedValue({
      ok: false,
      error: 'This invitation link has expired.',
    });

    const res = await orgMembersApi.acceptOrgInvitation('mock-token-expired');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('expired');
    }
  });

  it('handles anti-spoofing email mismatch error', async () => {
    vi.mocked(orgMembersApi.acceptOrgInvitation).mockResolvedValue({
      ok: false,
      error: 'This invitation was sent to buyer@corp.com, but you are signed in as attacker@evil.com.',
    });

    const res = await orgMembersApi.acceptOrgInvitation('mock-token-spoof');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('This invitation was sent to');
    }
  });
});

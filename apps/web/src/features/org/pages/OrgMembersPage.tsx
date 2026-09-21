import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import {
  listOrgMembers,
  inviteOrgMember,
  removeOrgMember,
  listOrgInvitations,
  revokeOrgInvitation,
  listOrgDelegations,
  createDelegationProxy,
  revokeDelegationProxy,
  updateTeamMemberRole,
  type OrgMember,
} from '../api/org-members';
import {
  DELEGATION_PERMISSIONS,
  DEFAULT_ENTERPRISE_APPROVAL_TIERS,
  type OrganizationInvitation,
  type OrganizationDelegation,
  type DelegationPermission,
  type OrgInvitationStatus,
} from '@otp/domain';

const ROLE_OPTIONS = [
  { value: 'COMMITTEE_MEMBER', label: 'Committee Member — evaluates & votes on RFQs' },
  { value: 'BUYER', label: 'Buyer / Procurement Lead — raises requirements' },
  { value: 'APPROVER', label: 'Approver / Finance — verifies budgets & signoffs' },
  { value: 'MANAGER', label: 'Manager — full read + propose + delegation access' },
  { value: 'VIEWER', label: 'Viewer — read-only observer' },
];

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60',
  MANAGER: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60',
  BUYER: 'bg-primary/10 text-primary border border-primary/20',
  APPROVER: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
  COMMITTEE_MEMBER: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
  VIEWER: 'bg-muted text-muted-foreground border border-border',
};

const ROLE_AUTHORITY_DESCRIPTION: Record<string, string> = {
  OWNER: '👑 Full Authority — All Tiers, Approvals, PO, Delegation & Management',
  MANAGER: '⭐ Management — Tier 1 & 2, Approvals, PO, Member & Delegation Management',
  BUYER: '🛒 Procurement Lead — Intake, Propose & Tier 1 Approvals',
  APPROVER: '✅ Financial Approver — Tier 1 & Tier 2 Signoffs',
  COMMITTEE_MEMBER: '🗳️ Committee Member — RFQ Merit Scoring & Balloting',
  VIEWER: '👁️ Observer — Read-Only Workspace Access',
};

const PERMISSION_LABELS: Record<DelegationPermission, { title: string; subtitle: string; badgeClass: string }> = {
  APPROVE_TIER_1: {
    title: 'Approve Tier 1',
    subtitle: 'Up to ₹5 Lakhs',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300',
  },
  APPROVE_TIER_2: {
    title: 'Approve Tier 2',
    subtitle: '₹5L to ₹25 Lakhs',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300',
  },
  APPROVE_TIER_3: {
    title: '👑 Tier 3 Executive Gate',
    subtitle: 'Over ₹25 Lakhs (Requires Owner)',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300',
  },
  VOTE_COMMITTEE: {
    title: 'Committee Ballot Voting',
    subtitle: 'Cast Sealed Quote Votes',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300',
  },
  ISSUE_PO: {
    title: 'Issue Purchase Orders',
    subtitle: 'Contract & PO Release',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300',
  },
  RELEASE_PAYMENT: {
    title: 'Release Payment',
    subtitle: 'Milestone Settlement Signoff',
    badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border-teal-300',
  },
};

export function OrgMembersPage() {
  const { context, switchOrg, refresh } = useRoleContext();
  const [activeTab, setActiveTab] = useState<'members' | 'invitations' | 'delegations' | 'thresholds'>('members');
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [delegations, setDelegations] = useState<OrganizationDelegation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Member Search State
  const [memberSearch, setMemberSearch] = useState('');

  // Role Edit Dialog State
  const [editingMember, setEditingMember] = useState<OrgMember | null>(null);
  const [newRoleSelection, setNewRoleSelection] = useState<string>('COMMITTEE_MEMBER');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleUpdateError, setRoleUpdateError] = useState<string | null>(null);

  // Member Removal Modal State
  const [removingMember, setRemovingMember] = useState<OrgMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Invitation Filter & Form State
  const [invitationStatusFilter, setInvitationStatusFilter] = useState<'ALL' | OrgInvitationStatus>('ALL');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('COMMITTEE_MEMBER');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; message: string; inviteUrl?: string; token?: string } | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [revokingInvId, setRevokingInvId] = useState<string | null>(null);

  // Delegation Form State
  const [delegateeId, setDelegateeId] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<DelegationPermission[]>(['APPROVE_TIER_1']);
  const [spendCap, setSpendCap] = useState('');
  const [durationPreset, setDurationPreset] = useState<'7' | '14' | '30' | 'custom'>('14');
  const [customExpiryDate, setCustomExpiryDate] = useState(() => {
    const d = new Date(Date.now() + 14 * 86400000);
    return d.toISOString().split('T')[0] ?? '';
  });
  const [delegationNotes, setDelegationNotes] = useState('');
  const [delegationLoading, setDelegationLoading] = useState(false);
  const [delegationResult, setDelegationResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [revokingDelId, setRevokingDelId] = useState<string | null>(null);

  // General feedback / Switching state
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [switchingOrg, setSwitchingOrg] = useState<string | null>(null);

  const orgId = context.organizationId;
  const orgName = context.organizationName ?? 'Your Organization';
  const isOwner = context.orgRole === 'OWNER' || context.isPlatformAdmin;
  const canManage = isOwner || context.orgRole === 'MANAGER';

  async function loadData(targetOrgId: string) {
    setIsLoading(true);
    setError(null);
    const [memRes, invRes, delRes] = await Promise.all([
      listOrgMembers(targetOrgId),
      canManage ? listOrgInvitations(targetOrgId) : Promise.resolve({ ok: true as const, invitations: [] }),
      listOrgDelegations(targetOrgId),
    ]);

    if (!memRes.ok) setError(memRes.error);
    else setMembers(memRes.members);

    if (invRes.ok) setInvitations(invRes.invitations);
    if (delRes.ok) setDelegations(delRes.delegations);
    setIsLoading(false);
  }

  useEffect(() => {
    if (!orgId) {
      setIsLoading(false);
      return;
    }
    void loadData(orgId);
  }, [orgId, canManage]);

  // Temporary feedback toast timer
  useEffect(() => {
    if (actionSuccess) {
      const t = setTimeout(() => setActionSuccess(null), 3000);
      return () => clearTimeout(t);
    }
  }, [actionSuccess]);

  // Filtered Members
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.fullName && m.fullName.toLowerCase().includes(q)) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  // Filtered Invitations
  const filteredInvitations = useMemo(() => {
    if (invitationStatusFilter === 'ALL') return invitations;
    return invitations.filter((i) => i.status === invitationStatusFilter);
  }, [invitations, invitationStatusFilter]);

  // 1. Handle Create Invitation
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteResult(null);
    const res = await inviteOrgMember(orgId, inviteEmail.trim(), inviteRole);
    setInviteLoading(false);
    if (res.ok) {
      setInviteResult({
        ok: true,
        message: res.message,
        inviteUrl: res.inviteUrl,
        token: res.token,
      });
      setInviteEmail('');
      setActionSuccess('✓ Invitation created successfully with single-use secure link.');
      void loadData(orgId);
    } else {
      setInviteResult({ ok: false, message: res.error });
    }
  }

  // 2. Handle Copy Link
  async function handleCopyLink(inviteUrl: string, id: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fullUrl = inviteUrl.startsWith('http') ? inviteUrl : `${origin}${inviteUrl.startsWith('/') ? '' : '/'}${inviteUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedTokenId(id);
      setTimeout(() => setCopiedTokenId(null), 2500);
    } catch {
      setActionError('Failed to copy link to clipboard.');
    }
  }

  // 3. Handle WhatsApp Share
  function handleWhatsAppShare(inviteUrl: string, invitedEmail: string, role: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fullUrl = inviteUrl.startsWith('http') ? inviteUrl : `${origin}${inviteUrl.startsWith('/') ? '' : '/'}${inviteUrl}`;
    const text = `Hi, you have been invited to join ${orgName} on Open Trade & Procurement (OTP) as ${role.replace(/_/g, ' ')}. Access and accept your invitation here: ${fullUrl}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  // 4. Handle Revoke Invitation
  async function handleRevokeInvitation(invitationId: string) {
    if (!orgId) return;
    setRevokingInvId(invitationId);
    setActionError(null);
    const res = await revokeOrgInvitation(invitationId);
    setRevokingInvId(null);
    if (!res.ok) {
      setActionError(res.error);
    } else {
      setActionSuccess('✓ Invitation revoked successfully.');
      setInvitations((prev) =>
        prev.map((i) => (i.id === invitationId ? { ...i, status: 'REVOKED' } : i))
      );
    }
  }

  // 5. Handle Update Member Role
  async function handleSaveRoleChange() {
    if (!orgId || !editingMember) return;
    setIsUpdatingRole(true);
    setRoleUpdateError(null);
    const res = await updateTeamMemberRole(orgId, editingMember.profileId, newRoleSelection);
    setIsUpdatingRole(false);
    if (!res.ok) {
      setRoleUpdateError(res.error);
    } else {
      setActionSuccess(`✓ Updated role for ${editingMember.fullName || editingMember.email} to ${newRoleSelection}.`);
      setMembers((prev) =>
        prev.map((m) =>
          m.profileId === editingMember.profileId ? { ...m, role: newRoleSelection } : m
        )
      );
      setEditingMember(null);
      await refresh();
    }
  }

  // 6. Handle Remove Member
  async function handleConfirmRemoveMember() {
    if (!orgId || !removingMember) return;
    setIsRemoving(true);
    setRemoveError(null);
    const res = await removeOrgMember(orgId, removingMember.profileId);
    setIsRemoving(false);
    if (!res.ok) {
      setRemoveError(res.error);
    } else {
      setActionSuccess(`✓ Removed member from ${orgName}.`);
      setMembers((prev) => prev.filter((m) => m.profileId !== removingMember.profileId));
      setRemovingMember(null);
    }
  }

  // 7. Handle Permission Selection Toggle
  function togglePermission(perm: DelegationPermission) {
    if (selectedPermissions.includes(perm)) {
      if (selectedPermissions.length === 1) return; // Keep at least one permission
      setSelectedPermissions(selectedPermissions.filter((p) => p !== perm));
    } else {
      setSelectedPermissions([...selectedPermissions, perm]);
    }
  }

  // 8. Handle Create Delegation Proxy
  async function handleCreateDelegation(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !delegateeId || selectedPermissions.length === 0) return;

    setDelegationLoading(true);
    setDelegationResult(null);

    let expiryIso: string;
    if (durationPreset === 'custom') {
      expiryIso = new Date(`${customExpiryDate}T23:59:59Z`).toISOString();
    } else {
      const days = parseInt(durationPreset, 10) || 14;
      expiryIso = new Date(Date.now() + days * 86400000).toISOString();
    }

    const capNum = spendCap.trim() ? Number(spendCap) : null;

    const res = await createDelegationProxy({
      organizationId: orgId,
      delegateeId,
      permissions: selectedPermissions,
      startsAt: new Date().toISOString(),
      expiresAt: expiryIso,
      spendCap: capNum,
      notes: delegationNotes.trim() ? delegationNotes.trim() : null,
    });

    setDelegationLoading(false);

    if (res.ok) {
      setDelegationResult({ ok: true, message: res.message });
      setActionSuccess('✓ Delegation proxy created successfully.');
      setDelegateeId('');
      setSpendCap('');
      setDelegationNotes('');
      setSelectedPermissions(['APPROVE_TIER_1']);
      void loadData(orgId);
    } else {
      setDelegationResult({ ok: false, message: res.error });
    }
  }

  // 9. Handle Revoke Delegation Proxy
  async function handleRevokeDelegation(delegationId: string) {
    if (!orgId) return;
    setRevokingDelId(delegationId);
    setActionError(null);
    const res = await revokeDelegationProxy(delegationId);
    setRevokingDelId(null);
    if (!res.ok) {
      setActionError(res.error);
    } else {
      setActionSuccess('✓ Delegation proxy revoked.');
      setDelegations((prev) =>
        prev.map((d) =>
          d.id === delegationId
            ? { ...d, isActive: false, revokedAt: new Date().toISOString() }
            : d
        )
      );
    }
  }

  // 10. Handle Switch Org
  async function handleSwitchOrg(targetOrgId: string) {
    if (targetOrgId === orgId) return;
    setSwitchingOrg(targetOrgId);
    const res = await switchOrg(targetOrgId);
    setSwitchingOrg(null);
    if (res.ok) {
      await refresh();
    }
  }

  if (!orgId) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-muted-foreground space-y-3">
        <p className="text-4xl mb-2">🏢</p>
        <h2 className="text-sm font-bold text-foreground">No Active Organization Linked</h2>
        <p className="text-xs">
          Complete workspace onboarding or contact a Platform Admin to link your profile to an organization.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs min-h-[44px] mobile-touch-target mt-2"
        >
          ← Return to Dashboard
        </Link>
      </div>
    );
  }

  const pendingInvCount = invitations.filter((i) => i.status === 'PENDING').length;
  const activeDelCount = delegations.filter((d) => d.isActive).length;

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-3 space-y-3 overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* 1. Header with Breadcrumb & Organization Context */}
      <header className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              to="/dashboard"
              className="flex items-center justify-center h-8 w-8 rounded-xl border border-border/70 bg-muted/40 hover:bg-muted text-foreground transition text-xs shrink-0"
              title="Return to Dashboard"
            >
              ←
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-extrabold text-foreground flex items-center gap-1.5 truncate">
                <span>🏢</span>
                <span>Team Members, Invitations &amp; Delegation Workbench</span>
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {orgName} · Active Authority: <strong className="text-foreground font-semibold">{context.orgRole?.replace(/_/g, ' ') ?? 'Member'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${ROLE_BADGE[context.orgRole || 'VIEWER']}`}>
              {context.orgRole?.replace(/_/g, ' ') ?? 'Member'}
            </span>
          </div>
        </div>

        {/* Segmented Control / Tab Navigation */}
        <div
          role="tablist"
          aria-label="Governance Workbench Navigation"
          className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl bg-muted/60 p-1 border border-border/80"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
            data-testid="tab-team-members"
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all min-h-[44px] mobile-touch-target ${
              activeTab === 'members'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>👥</span>
            <span className="truncate">Team ({members.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'invitations'}
            onClick={() => setActiveTab('invitations')}
            data-testid="tab-invitations"
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all min-h-[44px] mobile-touch-target ${
              activeTab === 'invitations'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>✉️</span>
            <span className="truncate">Invitations ({pendingInvCount})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'delegations'}
            onClick={() => setActiveTab('delegations')}
            data-testid="tab-delegations"
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all min-h-[44px] mobile-touch-target ${
              activeTab === 'delegations'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>🛡️</span>
            <span className="truncate">Delegations ({activeDelCount})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'thresholds'}
            onClick={() => setActiveTab('thresholds')}
            data-testid="tab-thresholds"
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition-all min-h-[44px] mobile-touch-target ${
              activeTab === 'thresholds'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>⚖️</span>
            <span className="truncate">Spend Thresholds</span>
          </button>
        </div>
      </header>

      {/* Organization Switcher if Multi-Org */}
      {context.organizations.length > 1 && (
        <div className="rounded-2xl border border-border bg-card p-3 shadow-xs space-y-2">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
            Switch Organization Workspace
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {context.organizations.map((org) => {
              const isActive = org.id === orgId;
              const isBusy = switchingOrg === org.id;
              return (
                <button
                  key={org.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleSwitchOrg(org.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition min-h-[44px] mobile-touch-target ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                      : 'border-border/70 bg-card hover:bg-muted text-foreground'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{org.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {org.isPersonal ? 'Personal' : org.role.toLowerCase()}
                    </p>
                  </div>
                  {isActive && <span className="text-primary font-extrabold text-xs">✓ Active</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Global Notifications */}
      {actionSuccess && (
        <div className="p-3 text-xs text-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2">
          <span>✓</span>
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2">
          <span>⚠️</span>
          <span>{actionError}</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1: TEAM MEMBERS ROSTER & SEARCH                               */}
      {/* ================================================================= */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          {/* Quick Invite Form (Owner / Manager) */}
          {canManage && (
            <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✉️</span>
                <div>
                  <h2 className="text-xs font-bold text-foreground">Invite Colleague to {orgName}</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Generates a single-use SHA-256 secure 7-day tokenized invitation link.
                  </p>
                </div>
              </div>

              <form onSubmit={handleInvite} className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-6">
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@organization.com"
                      disabled={inviteLoading}
                      data-testid="invite-email-input"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      disabled={inviteLoading}
                      data-testid="invite-role-select"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={inviteLoading || !inviteEmail.trim()}
                      data-testid="invite-submit-btn"
                      className="w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px] mobile-touch-target flex items-center justify-center gap-1"
                    >
                      {inviteLoading ? 'Creating…' : '+ Invite'}
                    </button>
                  </div>
                </div>

                {inviteResult && (
                  <div
                    className={`text-xs font-semibold rounded-xl p-3 space-y-2 ${
                      inviteResult.ok
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                    }`}
                  >
                    <p>{inviteResult.ok ? '✓' : '⚠️'} {inviteResult.message}</p>
                    {inviteResult.inviteUrl && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => void handleCopyLink(inviteResult.inviteUrl!, 'newly-created')}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition min-h-[36px]"
                        >
                          {copiedTokenId === 'newly-created' ? '✓ Copied Link!' : '📋 Copy Invitation Link'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWhatsAppShare(inviteResult.inviteUrl!, inviteEmail, inviteRole)}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition min-h-[36px]"
                        >
                          📱 Share on WhatsApp
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </section>
          )}

          {/* Members Roster Section */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <div>
                <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                  Workspace Members ({members.length})
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Registered procurement officers, approvers, and merit voting committee members.
                </p>
              </div>

              {/* Live Search Input */}
              <div className="w-full sm:w-64 relative">
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search name or email…"
                  data-testid="member-search-input"
                  className="w-full rounded-xl border border-border bg-background pl-8 pr-8 py-1.5 text-xs text-foreground focus:border-primary min-h-[40px]"
                />
                <span className="absolute left-2.5 top-2.5 text-muted-foreground text-xs">🔍</span>
                {memberSearch && (
                  <button
                    type="button"
                    onClick={() => setMemberSearch('')}
                    className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2 align-middle" />
                Loading members…
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {memberSearch ? 'No members matching your search filter.' : 'No colleagues registered yet.'}
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {filteredMembers.map((m) => (
                  <li key={m.profileId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-black text-primary">
                        {(m.fullName || m.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-foreground truncate">
                            {m.fullName || m.email}
                          </span>
                          {m.isSelf && (
                            <span className="rounded-full bg-primary/10 text-primary text-[9px] px-2 py-0.2 font-bold">
                              You
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                              ROLE_BADGE[m.role] ?? 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {m.role.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {m.fullName && <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>}
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {ROLE_AUTHORITY_DESCRIPTION[m.role] || 'Standard Member'}
                        </p>
                      </div>
                    </div>

                    {/* Member Action Controls */}
                    {canManage && !m.isSelf && m.role !== 'OWNER' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMember(m);
                            setNewRoleSelection(m.role);
                            setRoleUpdateError(null);
                          }}
                          data-testid={`edit-role-${m.profileId}`}
                          className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition min-h-[44px] mobile-touch-target"
                        >
                          Modify Role
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRemovingMember(m);
                            setRemoveError(null);
                          }}
                          data-testid={`remove-member-${m.profileId}`}
                          className="rounded-xl border border-rose-300 dark:border-rose-900/60 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition min-h-[44px] mobile-touch-target"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: INVITATIONS WORKBENCH & DISPATCH                           */}
      {/* ================================================================= */}
      {activeTab === 'invitations' && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <div>
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                Tokenized Invitations Workbench
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Single-use cryptographically hashed invite links with 7-day auto-expiry.
              </p>
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border">
              {(['ALL', 'PENDING', 'ACCEPTED', 'REVOKED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setInvitationStatusFilter(st)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition min-h-[32px] ${
                    invitationStatusFilter === st
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {st} (
                  {st === 'ALL'
                    ? invitations.length
                    : invitations.filter((i) => i.status === st).length}
                  )
                </button>
              ))}
            </div>
          </div>

          {filteredInvitations.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No invitations found matching status filter "{invitationStatusFilter}".
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {filteredInvitations.map((inv) => {
                const isPending = inv.status === 'PENDING';
                const tokenUrl = `/invite/${inv.id}`;
                return (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-foreground truncate">{inv.invitedEmail}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ROLE_BADGE[inv.role]}`}>
                          {inv.role.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            inv.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : inv.status === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Expires: {new Date(inv.expiresAt).toLocaleDateString()} · Invited by {inv.invitedByName || 'Manager'}
                        {inv.acceptedAt && ` · Accepted on ${new Date(inv.acceptedAt).toLocaleDateString()}`}
                      </p>
                    </div>

                    {canManage && isPending && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleCopyLink(tokenUrl, inv.id)}
                          data-testid={`copy-inv-${inv.id}`}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition min-h-[44px] mobile-touch-target"
                        >
                          {copiedTokenId === inv.id ? '✓ Copied!' : '📋 Copy Link'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWhatsAppShare(tokenUrl, inv.invitedEmail, inv.role)}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-emerald-300 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition min-h-[44px] mobile-touch-target"
                        >
                          📱 WhatsApp
                        </button>
                        <button
                          type="button"
                          disabled={revokingInvId === inv.id}
                          onClick={() => void handleRevokeInvitation(inv.id)}
                          data-testid={`revoke-inv-${inv.id}`}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition min-h-[44px] mobile-touch-target"
                        >
                          {revokingInvId === inv.id ? '…' : 'Revoke'}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* TAB 3: DELEGATION WORKBENCH (PROXIES, SPEND CAPS & VALIDITY)      */}
      {/* ================================================================= */}
      {activeTab === 'delegations' && (
        <div className="space-y-3">
          {/* Create Delegation Proxy Card */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <div>
                <h2 className="text-xs font-bold text-foreground">Delegate Approval Authority (Proxy)</h2>
                <p className="text-[11px] text-muted-foreground">
                  Temporarily grant signoff or voting authority to a colleague with monetary spend caps &amp; auto-expiry.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateDelegation} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Delegatee Select */}
                <div className="sm:col-span-6">
                  <label htmlFor="delegation-delegatee-select" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Delegatee Colleague <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="delegation-delegatee-select"
                    required
                    value={delegateeId}
                    onChange={(e) => setDelegateeId(e.target.value)}
                    disabled={delegationLoading}
                    data-testid="delegation-delegatee-select"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                  >
                    <option value="">Select Colleague…</option>
                    {members
                      .filter((m) => !m.isSelf)
                      .map((m) => (
                        <option key={m.profileId} value={m.profileId}>
                          {m.fullName || m.email} ({m.role})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Spend Cap Input */}
                <div className="sm:col-span-6">
                  <label htmlFor="delegation-spend-cap" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    Spend Cap Limit (₹ INR) — Optional
                  </label>
                  <input
                    id="delegation-spend-cap"
                    type="number"
                    min="0"
                    step="1000"
                    value={spendCap}
                    onChange={(e) => setSpendCap(e.target.value)}
                    placeholder="e.g. 500000 (blank = uncapped)"
                    disabled={delegationLoading}
                    data-testid="delegation-spend-cap"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                  />
                  {spendCap && Number(spendCap) > 0 && (
                    <p className="text-[10px] text-primary font-bold mt-1">
                      Cap: ₹{Number(spendCap).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
              </div>

              {/* Granular Permission Chips */}
              <div className="space-y-1.5">
                <span className="block text-[11px] font-semibold text-muted-foreground">
                  Granular Delegated Permissions ({selectedPermissions.length} selected):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {DELEGATION_PERMISSIONS.map((perm) => {
                    const meta = PERMISSION_LABELS[perm];
                    const isChecked = selectedPermissions.includes(perm);
                    const isTier3 = perm === 'APPROVE_TIER_3';
                    const isTier3Disabled = isTier3 && !isOwner;

                    return (
                      <button
                        key={perm}
                        type="button"
                        disabled={delegationLoading || isTier3Disabled}
                        onClick={() => togglePermission(perm)}
                        className={`flex items-start gap-2 p-2.5 rounded-xl border text-left transition min-h-[44px] ${
                          isChecked
                            ? 'border-primary bg-primary/10 text-primary font-bold shadow-2xs'
                            : 'border-border/70 bg-card hover:bg-muted text-foreground'
                        } ${isTier3Disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="mt-0.5 rounded text-primary"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold leading-tight">{meta.title}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{meta.subtitle}</p>
                          {isTier3Disabled && (
                            <span className="text-[9px] text-red-500 font-semibold block mt-0.5">
                              🔒 Non-owner cannot delegate Tier 3
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration Preset & Custom Date */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Validity Period</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['7', '14', '30', 'custom'] as const).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDurationPreset(preset)}
                        className={`py-2 text-xs font-bold rounded-xl border transition min-h-[44px] ${
                          durationPreset === preset
                            ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                            : 'bg-card text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {preset === 'custom' ? 'Custom' : `${preset}d`}
                      </button>
                    ))}
                  </div>
                </div>

                {durationPreset === 'custom' && (
                  <div className="sm:col-span-6">
                    <label htmlFor="custom-expiry-date" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                      Expiry Date
                    </label>
                    <input
                      id="custom-expiry-date"
                      type="date"
                      required
                      value={customExpiryDate}
                      onChange={(e) => setCustomExpiryDate(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                    />
                  </div>
                )}
              </div>

              {/* Notes / Reason */}
              <div>
                <label htmlFor="delegation-notes-input" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Delegation Justification / Notes
                </label>
                <input
                  id="delegation-notes-input"
                  type="text"
                  value={delegationNotes}
                  onChange={(e) => setDelegationNotes(e.target.value)}
                  placeholder="e.g. Coverage for Annual Leave (Sep 21 – Oct 04)"
                  disabled={delegationLoading}
                  data-testid="delegation-notes-input"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={delegationLoading || !delegateeId || selectedPermissions.length === 0}
                  data-testid="delegation-submit-btn"
                  className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px] mobile-touch-target flex items-center gap-1.5"
                >
                  {delegationLoading ? 'Creating Proxy…' : '+ Create Delegation Proxy'}
                </button>
              </div>

              {delegationResult && (
                <p
                  className={`text-xs font-semibold rounded-xl p-2.5 ${
                    delegationResult.ok
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                  }`}
                >
                  {delegationResult.ok ? '✓' : '⚠️'} {delegationResult.message}
                </p>
              )}
            </form>
          </section>

          {/* Active Delegations List */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                  Active &amp; Past Delegation Proxies ({delegations.length})
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Time-bounded proxies granting signoff and voting rights.
                </p>
              </div>
            </div>

            {delegations.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No delegation proxies configured for this organization.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {delegations.map((del) => {
                  const now = Date.now();
                  const expTime = new Date(del.expiresAt).getTime();
                  const diffDays = Math.ceil((expTime - now) / 86400000);
                  const isExpired = expTime < now;
                  const isCurrentlyActive = del.isActive && !isExpired;

                  return (
                    <li key={del.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-foreground truncate">
                            {del.delegatorName || del.delegatorEmail} → {del.delegateeName || del.delegateeEmail}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isCurrentlyActive
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                          >
                            {isCurrentlyActive ? `ACTIVE (${diffDays}d left)` : isExpired ? 'EXPIRED' : 'REVOKED'}
                          </span>
                        </div>

                        {/* Permission Badges */}
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          {del.permissions.map((p) => (
                            <span
                              key={p}
                              className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                                PERMISSION_LABELS[p]?.badgeClass || 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {PERMISSION_LABELS[p]?.title || p}
                            </span>
                          ))}
                        </div>

                        <p className="text-[11px] text-muted-foreground">
                          {del.spendCapAmount != null
                            ? `Spend Cap: ₹${del.spendCapAmount.toLocaleString('en-IN')} · `
                            : 'Uncapped Spend · '}
                          Valid until: {new Date(del.expiresAt).toLocaleDateString()}
                          {del.notes && ` · "${del.notes}"`}
                        </p>
                      </div>

                      {del.isActive && !isExpired && (
                        <button
                          type="button"
                          disabled={revokingDelId === del.id}
                          onClick={() => void handleRevokeDelegation(del.id)}
                          data-testid={`revoke-del-${del.id}`}
                          className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition min-h-[44px] mobile-touch-target"
                        >
                          {revokingDelId === del.id ? '…' : 'Revoke Proxy'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: SPEND APPROVAL MATRIX & THRESHOLDS VISUALIZATION          */}
      {/* ================================================================= */}
      {activeTab === 'thresholds' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚖️</span>
              <div>
                <h2 className="text-xs font-bold text-foreground">Organizational Spend Approval Thresholds</h2>
                <p className="text-[11px] text-muted-foreground">
                  Configured financial authority tiers, sequential signoff rules, and anti-bypass controls.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              {DEFAULT_ENTERPRISE_APPROVAL_TIERS.map((tier, idx) => (
                <div
                  key={tier.tierLevel}
                  className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      Tier {idx + 1}
                    </span>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                      tier.tierLevel === 'TIER_3_EXECUTIVE'
                        ? 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950 dark:text-purple-300'
                        : tier.tierLevel === 'TIER_2_DEPT_HEAD'
                        ? 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-300'
                        : 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                    }`}>
                      {tier.tierLevel.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <h3 className="text-xs font-black text-foreground">{tier.tierName}</h3>

                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Monetary Range:</span>
                      <strong className="text-foreground font-mono">
                        ₹{tier.minAmount.toLocaleString('en-IN')} – {tier.maxAmount ? `₹${tier.maxAmount.toLocaleString('en-IN')}` : 'Unlimited'}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Min Approvers:</span>
                      <strong className="text-foreground">{tier.minApproversRequired} Signoff</strong>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/50 text-[11px]">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Authorized Roles:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tier.requiredApproverRoles.map((role) => (
                        <span key={role} className="rounded bg-background px-1.5 py-0.5 text-[9px] font-semibold border border-border">
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between gap-2 text-xs">
              <div className="space-y-0.5">
                <strong className="text-foreground font-bold block">🔒 Anti-Bypass Invariants Active:</strong>
                <p className="text-[11px] text-muted-foreground">
                  Requester cannot approve their own RFQ · Dual-signoff enforced above ₹50 Lakhs · Strict sequential signoffs.
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 text-[10px] font-black shrink-0">
                100% Enforced
              </span>
            </div>
          </section>
        </div>
      )}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border p-5 shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-foreground">
                Modify Member Role
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Update governance authority for <strong>{editingMember.fullName || editingMember.email}</strong>.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="modal-role-select" className="block text-xs font-bold text-foreground">
                Assigned Operational Role:
              </label>
              <select
                id="modal-role-select"
                value={newRoleSelection}
                onChange={(e) => setNewRoleSelection(e.target.value)}
                disabled={isUpdatingRole}
                data-testid="edit-role-select"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
                {isOwner && <option value="OWNER">Owner (Full Transfer)</option>}
              </select>
            </div>

            {roleUpdateError && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 p-2 rounded-xl">
                ⚠️ {roleUpdateError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                disabled={isUpdatingRole}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveRoleChange()}
                disabled={isUpdatingRole}
                data-testid="save-role-btn"
                className="px-4 py-2 text-xs font-extrabold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs min-h-[44px]"
              >
                {isUpdatingRole ? 'Saving…' : 'Save New Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Removal Modal */}
      {removingMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border p-5 shadow-xl space-y-4">
            <div className="text-center space-y-2">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-sm font-extrabold text-foreground">
                Remove Member from Organization?
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to remove <strong>{removingMember.fullName || removingMember.email}</strong> from {orgName}? They will immediately lose access to organization RFQs, purchase orders, and governance voting.
              </p>
            </div>

            {removeError && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 p-2 rounded-xl">
                ⚠️ {removeError}
              </p>
            )}

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRemovingMember(null)}
                disabled={isRemoving}
                className="w-full px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRemoveMember()}
                disabled={isRemoving}
                data-testid="confirm-remove-member-btn"
                className="w-full px-4 py-2 text-xs font-extrabold rounded-xl bg-rose-600 text-white hover:bg-rose-700 shadow-xs min-h-[44px]"
              >
                {isRemoving ? 'Removing…' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Governance Invariant Footer */}
      <div className="rounded-2xl border border-border bg-muted/20 p-3.5 text-xs text-muted-foreground space-y-1">
        <p className="font-bold text-foreground">🛡️ Segregation of Duties &amp; Delegation Invariants</p>
        <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
          <li>Anti-Self-Approval: Requesters cannot approve their own RFQs or authorize purchase order releases.</li>
          <li>Executive Gate: Tier 3 Executive signoff powers can only be delegated by Organization Owners or Platform Administrators.</li>
          <li>All invitations, role changes, and proxy delegations are logged in the immutable audit ledger.</li>
        </ul>
      </div>
    </div>
  );
}

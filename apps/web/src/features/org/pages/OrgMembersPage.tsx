import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import type {
  OrganizationInvitation,
  OrganizationDelegation,
  DelegationPermission,
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

export function OrgMembersPage() {
  const { context, switchOrg, refresh } = useRoleContext();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'members' | 'invitations' | 'delegations'>('members');
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [delegations, setDelegations] = useState<OrganizationDelegation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('COMMITTEE_MEMBER');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; message: string; inviteUrl?: string } | null>(null);

  // Delegation form state
  const [delegateeId, setDelegateeId] = useState('');
  const [delegationPerm, setDelegationPerm] = useState<DelegationPermission>('APPROVE_TIER_1');
  const [spendCap, setSpendCap] = useState('');
  const [delegationNotes, setDelegationNotes] = useState('');
  const [delegationLoading, setDelegationLoading] = useState(false);
  const [delegationResult, setDelegationResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Actions state
  const [removing, setRemoving] = useState<string | null>(null);
  const [revokingInv, setRevokingInv] = useState<string | null>(null);
  const [revokingDel, setRevokingDel] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [switchingOrg, setSwitchingOrg] = useState<string | null>(null);

  const orgId = context.organizationId;
  const orgName = context.organizationName ?? 'Your Organization';
  const canManage =
    !context.isPlatformAdmin &&
    (context.orgRole === 'OWNER' || context.orgRole === 'MANAGER');

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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteResult(null);
    const res = await inviteOrgMember(orgId, inviteEmail, inviteRole);
    setInviteLoading(false);
    if (res.ok) {
      setInviteResult({ ok: true, message: res.message, inviteUrl: res.inviteUrl });
      setInviteEmail('');
      void loadData(orgId);
    } else {
      setInviteResult({ ok: false, message: res.error });
    }
  }

  async function handleCreateDelegation(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !delegateeId) return;
    setDelegationLoading(true);
    setDelegationResult(null);
    const capNum = spendCap ? Number(spendCap) : null;
    const res = await createDelegationProxy({
      organizationId: orgId,
      delegateeId,
      permissions: [delegationPerm],
      spendCap: capNum,
      notes: delegationNotes.trim() ? delegationNotes.trim() : null,
    });
    setDelegationLoading(false);
    if (res.ok) {
      setDelegationResult({ ok: true, message: res.message });
      setDelegateeId('');
      setSpendCap('');
      setDelegationNotes('');
      void loadData(orgId);
    } else {
      setDelegationResult({ ok: false, message: res.error });
    }
  }

  async function handleRemove(profileId: string) {
    if (!orgId) return;
    if (!window.confirm('Remove this member from the organization?')) return;
    setRemoving(profileId);
    setActionError(null);
    const res = await removeOrgMember(orgId, profileId);
    setRemoving(null);
    if (!res.ok) {
      setActionError(res.error);
    } else {
      setMembers((prev) => prev.filter((m) => m.profileId !== profileId));
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    if (!orgId) return;
    setRevokingInv(invitationId);
    setActionError(null);
    const res = await revokeOrgInvitation(invitationId);
    setRevokingInv(null);
    if (!res.ok) {
      setActionError(res.error);
    } else {
      setInvitations((prev) =>
        prev.map((i) => (i.id === invitationId ? { ...i, status: 'REVOKED' } : i))
      );
    }
  }

  async function handleRevokeDelegation(delegationId: string) {
    if (!orgId) return;
    setRevokingDel(delegationId);
    setActionError(null);
    const res = await revokeDelegationProxy(delegationId);
    setRevokingDel(null);
    if (!res.ok) {
      setActionError(res.error);
    } else {
      setDelegations((prev) =>
        prev.map((d) => (d.id === delegationId ? { ...d, isActive: false, revokedAt: new Date().toISOString() } : d))
      );
    }
  }

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

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-3 space-y-3 overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* 1. Header */}
      <header className="rounded-2xl border border-border bg-card p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/dashboard"
              className="flex items-center justify-center h-8 w-8 rounded-xl border border-border/70 bg-muted/40 hover:bg-muted text-foreground transition text-xs shrink-0"
              title="Return to Dashboard"
            >
              ←
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold text-foreground flex items-center gap-1.5 truncate">
                <span>🏢</span>
                <span>Buyer Organization Governance &amp; Delegation</span>
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {orgName} · Role: {context.orgRole?.replace(/_/g, ' ') ?? 'Member'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-[10px] font-bold">
              {context.orgRole?.replace(/_/g, ' ') ?? 'Member'}
            </span>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div
          role="tablist"
          aria-label="Governance Navigation"
          className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 border border-border/80"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all min-h-[44px] mobile-touch-target ${
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
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all min-h-[44px] mobile-touch-target ${
              activeTab === 'invitations'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>✉️</span>
            <span className="truncate">Invitations ({invitations.filter((i) => i.status === 'PENDING').length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'delegations'}
            onClick={() => setActiveTab('delegations')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all min-h-[44px] mobile-touch-target ${
              activeTab === 'delegations'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>🛡️</span>
            <span className="truncate">Delegations ({delegations.filter((d) => d.isActive).length})</span>
          </button>
        </div>
      </header>

      {/* Organization Switcher if multi-org */}
      {context.organizations.length > 1 && (
        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-xs space-y-2">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
            Switch Organization Context
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
                  {isActive && <span className="text-primary font-extrabold">✓ Active</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {actionError && (
        <div className="p-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl">
          ⚠️ {actionError}
        </div>
      )}

      {/* TAB 1: MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          {canManage && (
            <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✉️</span>
                <div>
                  <h2 className="text-xs font-bold text-foreground">Invite Colleague with Tokenized Security</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Generates a single-use SHA-256 secure 7-day invitation link.
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
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      disabled={inviteLoading}
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
                      className="w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px] mobile-touch-target flex items-center justify-center gap-1"
                    >
                      {inviteLoading ? 'Sending…' : '+ Invite'}
                    </button>
                  </div>
                </div>

                {inviteResult && (
                  <div
                    className={`text-xs font-semibold rounded-xl p-2.5 ${
                      inviteResult.ok
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                    }`}
                  >
                    <p>{inviteResult.ok ? '✓' : '⚠️'} {inviteResult.message}</p>
                    {inviteResult.inviteUrl && (
                      <p className="mt-1 font-mono text-[11px] select-all bg-white/60 dark:bg-black/30 p-1.5 rounded">
                        Link: {window.location.origin}{inviteResult.inviteUrl}
                      </p>
                    )}
                  </div>
                )}
              </form>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                Current Members ({members.length})
              </h2>
            </div>

            {isLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2 align-middle" />
                Loading members…
              </div>
            ) : members.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No colleagues registered yet.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {members.map((m) => (
                  <li key={m.profileId} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-black text-primary">
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
                            className={`rounded-full px-2 py-0.2 text-[9px] font-bold ${
                              ROLE_BADGE[m.role] ?? 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {m.role.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {m.fullName && <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>}
                      </div>
                    </div>

                    {canManage && !m.isSelf && m.role !== 'OWNER' && (
                      <button
                        type="button"
                        disabled={removing === m.profileId}
                        onClick={() => void handleRemove(m.profileId)}
                        className="rounded-xl border border-rose-300 dark:border-rose-900/60 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition min-h-[44px] mobile-touch-target"
                      >
                        {removing === m.profileId ? '…' : 'Remove'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: INVITATIONS */}
      {activeTab === 'invitations' && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
              Pending &amp; Past Invitations
            </h2>
          </div>

          {invitations.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No organization invitations found.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground truncate">{inv.invitedEmail}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ROLE_BADGE[inv.role]}`}>
                        {inv.role}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        inv.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                        inv.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {inv.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Expires: {new Date(inv.expiresAt).toLocaleDateString()} · Invited by {inv.invitedByName || 'Manager'}
                    </p>
                  </div>

                  {canManage && inv.status === 'PENDING' && (
                    <button
                      type="button"
                      disabled={revokingInv === inv.id}
                      onClick={() => void handleRevokeInvitation(inv.id)}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                    >
                      {revokingInv === inv.id ? '…' : 'Revoke'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* TAB 3: DELEGATIONS */}
      {activeTab === 'delegations' && (
        <div className="space-y-3">
          {/* Create delegation card */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <div>
                <h2 className="text-xs font-bold text-foreground">Delegate Approval Authority (Proxy)</h2>
                <p className="text-[11px] text-muted-foreground">
                  Temporarily grant approval powers to a colleague with monetary spend caps &amp; auto-expiry.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateDelegation} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Delegatee Colleague</label>
                  <select
                    required
                    value={delegateeId}
                    onChange={(e) => setDelegateeId(e.target.value)}
                    disabled={delegationLoading}
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

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Permission</label>
                  <select
                    value={delegationPerm}
                    onChange={(e) => setDelegationPerm(e.target.value as DelegationPermission)}
                    disabled={delegationLoading}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                  >
                    <option value="APPROVE_TIER_1">Approve Tier 1 (&lt; ₹5L)</option>
                    <option value="APPROVE_TIER_2">Approve Tier 2 (₹5L - ₹25L)</option>
                    <option value="VOTE_COMMITTEE">Committee Voting</option>
                    <option value="ISSUE_PO">PO Issuance</option>
                    <option value="RELEASE_PAYMENT">Payment Release</option>
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Spend Cap (₹ INR)</label>
                  <input
                    type="number"
                    value={spendCap}
                    onChange={(e) => setSpendCap(e.target.value)}
                    placeholder="e.g. 1000000 (optional)"
                    disabled={delegationLoading}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <input
                  type="text"
                  value={delegationNotes}
                  onChange={(e) => setDelegationNotes(e.target.value)}
                  placeholder="Delegation reason / notes (e.g. Leave coverage for 2 weeks)"
                  disabled={delegationLoading}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={delegationLoading || !delegateeId}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px]"
                >
                  {delegationLoading ? 'Creating…' : '+ Create Delegation Proxy'}
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

          {/* Active delegations list */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                Active &amp; Past Delegation Proxies
              </h2>
            </div>

            {delegations.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No active delegation proxies configured for this organization.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {delegations.map((del) => (
                  <li key={del.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground truncate">
                          {del.delegatorName || del.delegatorEmail} → {del.delegateeName || del.delegateeEmail}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          {del.permissions.join(', ')}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          del.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {del.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {del.spendCapAmount ? `Cap: ₹${del.spendCapAmount.toLocaleString('en-IN')} · ` : 'No Cap · '}
                        Valid until: {new Date(del.expiresAt).toLocaleDateString()}
                        {del.notes && ` · "${del.notes}"`}
                      </p>
                    </div>

                    {del.isActive && (
                      <button
                        type="button"
                        disabled={revokingDel === del.id}
                        onClick={() => void handleRevokeDelegation(del.id)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                      >
                        {revokingDel === del.id ? '…' : 'Revoke'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Governance Invariant Footer */}
      <div className="rounded-2xl border border-border bg-muted/20 p-3.5 text-xs text-muted-foreground space-y-1">
        <p className="font-bold text-foreground">🛡️ Segregation of Duties &amp; Delegation Invariants</p>
        <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
          <li>Anti-Self-Approval: RFQ creators and procurement requesters cannot self-approve their own RFQ stages or PO releases.</li>
          <li>Executive Gate: Tier 3 Executive signoff powers can only be delegated by Organization Owners or Platform Administrators.</li>
          <li>All invitations, role changes, and proxy delegations are logged in the immutable audit ledger.</li>
        </ul>
      </div>
    </div>
  );
}

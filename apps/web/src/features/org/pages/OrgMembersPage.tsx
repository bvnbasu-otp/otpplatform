import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import {
  listOrgMembers,
  inviteOrgMember,
  removeOrgMember,
  type OrgMember,
} from '../api/org-members';

const ROLE_OPTIONS = [
  { value: 'COMMITTEE_MEMBER', label: 'Committee Member — evaluates & votes on RFQs' },
  { value: 'BUYER', label: 'Buyer / Procurement Lead — raises requirements' },
  { value: 'MANAGER', label: 'Manager — full read + propose access' },
  { value: 'VIEWER', label: 'Viewer — read-only observer' },
];

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60',
  MANAGER: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60',
  BUYER: 'bg-primary/10 text-primary border border-primary/20',
  COMMITTEE_MEMBER: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
  VIEWER: 'bg-muted text-muted-foreground border border-border',
};

export function OrgMembersPage() {
  const { context, switchOrg, refresh } = useRoleContext();
  const navigate = useNavigate();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('COMMITTEE_MEMBER');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Remove state
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [switchingOrg, setSwitchingOrg] = useState<string | null>(null);

  const orgId = context.organizationId;
  const orgName = context.organizationName ?? 'Your Organization';
  const canManage =
    !context.isPlatformAdmin &&
    (context.orgRole === 'OWNER' || context.orgRole === 'MANAGER');

  useEffect(() => {
    if (!orgId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setError(null);
      const res = await listOrgMembers(orgId);
      if (cancelled) return;
      if (!res.ok) setError(res.error);
      else setMembers(res.members);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteResult(null);
    const res = await inviteOrgMember(orgId, inviteEmail, inviteRole);
    setInviteLoading(false);
    if (res.ok) {
      setInviteResult({ ok: true, message: res.message });
      setInviteEmail('');
      // Refresh member list
      const fresh = await listOrgMembers(orgId);
      if (fresh.ok) setMembers(fresh.members);
    } else {
      setInviteResult({ ok: false, message: res.error });
    }
  }

  async function handleRemove(profileId: string) {
    if (!orgId) return;
    if (!window.confirm('Remove this member from the organization?')) return;
    setRemoving(profileId);
    setRemoveError(null);
    const res = await removeOrgMember(orgId, profileId);
    setRemoving(null);
    if (!res.ok) {
      setRemoveError(res.error);
    } else {
      setMembers((prev) => prev.filter((m) => m.profileId !== profileId));
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
      {/* 1. Header & Segmented Navigation */}
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
                <span>Workspace Members &amp; Organization</span>
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

        {/* Segmented Control / Tab Pills */}
        <div
          role="tablist"
          aria-label="Settings Navigation"
          className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 border border-border/80"
        >
          <button
            type="button"
            role="tab"
            aria-selected={false}
            onClick={() => navigate('/profile?tab=profile')}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-all min-h-[44px] mobile-touch-target"
          >
            <span>👤</span>
            <span className="truncate">Profile</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={true}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold bg-card text-foreground shadow-xs ring-1 ring-border transition-all min-h-[44px] mobile-touch-target"
          >
            <span>🏢</span>
            <span className="truncate">Team ({members.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={false}
            onClick={() => navigate('/profile?tab=preferences')}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-all min-h-[44px] mobile-touch-target"
          >
            <span>⚙️</span>
            <span className="truncate">Preferences</span>
          </button>
        </div>
      </header>

      {/* 2. Organization Switcher (if multi-org) */}
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

      {/* 3. Colleague Invitation Card */}
      {canManage && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">👥</span>
            <div>
              <h2 className="text-xs font-bold text-foreground">Invite Colleague to {orgName}</h2>
              <p className="text-[11px] text-muted-foreground">
                Assign evaluation, committee voting, or procurement permissions.
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
              <p
                className={`text-xs font-semibold rounded-xl p-2.5 ${
                  inviteResult.ok
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {inviteResult.ok ? '✓' : '⚠️'} {inviteResult.message}
              </p>
            )}
          </form>
        </section>
      )}

      {/* 4. Current Members Roster */}
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
        ) : error ? (
          <div className="p-3 text-xs text-red-600 bg-red-50 rounded-xl">⚠️ {error}</div>
        ) : removeError ? (
          <div className="p-3 text-xs text-red-600 bg-red-50 rounded-xl">⚠️ {removeError}</div>
        ) : members.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No colleagues registered yet. Send an invitation above to collaborate.
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

      {/* 5. Governance Info Box */}
      <div className="rounded-2xl border border-border bg-muted/20 p-3.5 text-xs text-muted-foreground space-y-1">
        <p className="font-bold text-foreground">🛡️ Merit Governance Rules</p>
        <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
          <li>Committee Members evaluate and vote on sealed quotes using identity-protected scoring.</li>
          <li>Quorum of 2+ votes required for Community, Institution, and Enterprise organizations.</li>
        </ul>
      </div>
    </div>
  );
}

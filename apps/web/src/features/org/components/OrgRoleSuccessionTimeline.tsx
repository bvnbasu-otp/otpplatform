import React, { useEffect, useMemo, useState } from 'react';
import type { OrgRoleAssignment, RoleRenewalParams, RoleRenewalResult } from '@otp/domain';
import { STANDARD_GOVERNANCE_ROLE_TEMPLATES, isRoleExpiringSoon } from '@otp/domain';
import {
  listOrgRoleHistory,
  appointOrgRole,
  transferOrgRoleSuccession,
  renewOrRotateOrgRole,
  type OrgMember,
} from '../api/org-members';
import { RoleTransferModal } from './RoleTransferModal';
import { RoleRenewalModal } from './RoleRenewalModal';

interface OrgRoleSuccessionTimelineProps {
  organizationId: string;
  organizationName: string;
  canManage: boolean;
  members: OrgMember[];
  onNotification?: (msg: string) => void;
}

const ROLE_ICONS: Record<string, string> = {
  PRESIDENT: '👑',
  VICE_PRESIDENT: '⭐',
  SECRETARY: '📜',
  JOINT_SECRETARY: '📝',
  TREASURER: '💰',
  ESTATE_MANAGER: '🏢',
  COMMITTEE_MEMBER: '🗳️',
  PRIMARY_OWNER: '💼',
  MANAGER: '👔',
  MEMBER: '👥',
  DELEGATE: '🛡️',
};

export function OrgRoleSuccessionTimeline({
  organizationId,
  organizationName,
  canManage,
  members,
  onNotification,
}: OrgRoleSuccessionTimelineProps) {
  const [roleHistory, setRoleHistory] = useState<OrgRoleAssignment[]>([]);
  const [activeTab, setActiveTab] = useState<'roster' | 'expiring' | 'history'>('roster');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [transferTargetRole, setTransferTargetRole] = useState<{ roleId: string; predecessorId?: string | null } | null>(null);
  const [renewalTargetAssignment, setRenewalTargetAssignment] = useState<OrgRoleAssignment | null>(null);

  // Direct Appoint Form State
  const [isAppointing, setIsAppointing] = useState(false);
  const [newRoleId, setNewRoleId] = useState('ESTATE_MANAGER');
  const [newPersonId, setNewPersonId] = useState('');
  const [newTermDays, setNewTermDays] = useState(365);
  const [appointLoading, setAppointLoading] = useState(false);

  async function loadHistory() {
    setIsLoading(true);
    setError(null);
    const res = await listOrgRoleHistory(organizationId);
    setIsLoading(false);
    if (!res.ok) {
      setError(res.error);
    } else {
      setRoleHistory(res.history);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, [organizationId]);

  // Active Assignments Map (latest active assignment per roleId)
  const activeAssignments = useMemo(() => {
    return roleHistory.filter((a) => a.status === 'ACTIVE');
  }, [roleHistory]);

  // Expiring roles (<= 30 days or expired)
  const expiringAssignments = useMemo(() => {
    const now = new Date();
    return activeAssignments.filter((a) => {
      const exp = isRoleExpiringSoon(a, 30, now);
      return exp.expiring || exp.isExpired;
    });
  }, [activeAssignments]);

  async function handleDirectAppoint(e: React.FormEvent) {
    e.preventDefault();
    if (!newPersonId) return;

    setAppointLoading(true);
    const template = STANDARD_GOVERNANCE_ROLE_TEMPLATES[newRoleId];
    const res = await appointOrgRole({
      organizationId,
      personId: newPersonId,
      roleId: newRoleId,
      roleName: template?.roleName || newRoleId,
      roleCategory: template?.roleCategory || 'RWA_GOVERNANCE',
      termDurationDays: newTermDays,
    });
    setAppointLoading(false);

    if (res.ok) {
      onNotification?.(res.message);
      setIsAppointing(false);
      setNewPersonId('');
      void loadHistory();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header & Sub-Tabs */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
          <div>
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span>🏛️</span>
              <span>RWA &amp; MSME Role Lifecycle, Succession &amp; Term Continuity</span>
            </h2>
            <p className="text-[11px] text-muted-foreground">
              "Role ≠ Person" Governance Engine · Default 1-Year (365d) Terms · Annual Renewal &amp; Rotation Workflow
            </p>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => setIsAppointing(!isAppointing)}
              data-testid="toggle-appoint-role-btn"
              className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition min-h-[44px] flex items-center gap-1 mobile-touch-target"
            >
              {isAppointing ? '✕ Close Appoint' : '+ Appoint Role'}
            </button>
          )}
        </div>

        {/* Quick Appoint Form */}
        {isAppointing && (
          <form onSubmit={handleDirectAppoint} className="rounded-xl bg-muted/40 border border-border p-3 space-y-3">
            <h3 className="text-xs font-bold text-foreground">Appoint Role Holder to {organizationName}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-4">
                <label className="block text-[10px] font-bold text-muted-foreground mb-1">Role Title</label>
                <select
                  value={newRoleId}
                  onChange={(e) => setNewRoleId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
                >
                  <optgroup label="RWA Governance Roles">
                    <option value="ESTATE_MANAGER">Estate Manager (1-Year Term)</option>
                    <option value="PRESIDENT">President</option>
                    <option value="VICE_PRESIDENT">Vice President</option>
                    <option value="SECRETARY">Secretary</option>
                    <option value="JOINT_SECRETARY">Joint Secretary</option>
                    <option value="TREASURER">Treasurer</option>
                    <option value="COMMITTEE_MEMBER">Committee Member</option>
                  </optgroup>
                  <optgroup label="MSME Management Roles">
                    <option value="PRIMARY_OWNER">Primary MSME / Owner</option>
                    <option value="MANAGER">Manager</option>
                    <option value="MEMBER">Member</option>
                    <option value="DELEGATE">Delegate</option>
                  </optgroup>
                </select>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[10px] font-bold text-muted-foreground mb-1">Assignee Colleague</label>
                <select
                  required
                  value={newPersonId}
                  onChange={(e) => setNewPersonId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
                >
                  <option value="">Select Member…</option>
                  {members.map((m) => (
                    <option key={m.profileId} value={m.profileId}>
                      {m.fullName || m.email} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold text-muted-foreground mb-1">Action</label>
                <button
                  type="submit"
                  disabled={appointLoading || !newPersonId}
                  className="w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px] flex items-center justify-center"
                >
                  {appointLoading ? 'Appointing…' : 'Save Assignment'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* View Switcher Chips */}
        <div className="flex items-center gap-1.5 rounded-xl bg-muted/60 p-1 border border-border/80 overflow-x-auto min-w-0">
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            data-testid="tab-active-roster"
            className={`flex-1 shrink-0 whitespace-nowrap min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-lg transition mobile-touch-target ${
              activeTab === 'roster'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>🏛️</span> Active Roster ({activeAssignments.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('expiring')}
            data-testid="tab-expiring-queue"
            className={`flex-1 shrink-0 whitespace-nowrap min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-lg transition mobile-touch-target ${
              activeTab === 'expiring'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>⏳</span> Renewal Queue ({expiringAssignments.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            data-testid="tab-timeline-history"
            className={`flex-1 shrink-0 whitespace-nowrap min-h-[40px] px-3 py-1.5 text-xs font-bold rounded-lg transition mobile-touch-target ${
              activeTab === 'history'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>📜</span> Full History ({roleHistory.length})
          </button>
        </div>
      </section>

      {/* TAB 1: ACTIVE ROLE ROSTER */}
      {activeTab === 'roster' && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="border-b pb-2">
            <h3 className="text-xs font-bold text-foreground">Active Role Holders &amp; Term Status</h3>
            <p className="text-[11px] text-muted-foreground">
              Current holders possess active voting, signoff, and operational PO powers.
            </p>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading role assignments…</div>
          ) : activeAssignments.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No active role assignments configured yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {activeAssignments.map((a) => {
                const now = new Date();
                const exp = isRoleExpiringSoon(a, 30, now);
                const icon = ROLE_ICONS[a.roleId] || '👤';

                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-2xl shrink-0">{icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-foreground truncate">{a.roleName}</span>
                          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 border border-emerald-300">
                            Current Holder: {a.personName || a.personEmail || 'Assigned'}
                          </span>
                          {exp.expiring && (
                            <span className="rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-extrabold px-2 py-0.5 animate-pulse">
                              ⏳ Expires in {exp.daysLeft}d
                            </span>
                          )}
                          {exp.isExpired && (
                            <span className="rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-[9px] font-extrabold px-2 py-0.5">
                              ⚠️ Term Expired — Action Required
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Scope: <strong>{a.responsibilityScope}</strong> · Term: {a.termDurationDays || 365} days
                          {a.effectiveTo && ` · Valid until: ${new Date(a.effectiveTo).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setRenewalTargetAssignment(a)}
                          data-testid={`renew-role-${a.id}`}
                          className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition min-h-[44px] mobile-touch-target"
                        >
                          📅 Renew / Rotate
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransferTargetRole({ roleId: a.roleId, predecessorId: a.personId })}
                          data-testid={`transfer-role-${a.id}`}
                          className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition min-h-[44px] mobile-touch-target"
                        >
                          🔄 Transfer Succession
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

      {/* TAB 2: EXPIRING & RENEWAL QUEUE */}
      {activeTab === 'expiring' && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="border-b pb-2">
            <h3 className="text-xs font-bold text-foreground">Expiring &amp; Expired Governance Roles</h3>
            <p className="text-[11px] text-muted-foreground">
              Roles nearing 1-year term conclusion or requiring annual rotation resolution.
            </p>
          </div>

          {expiringAssignments.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              ✓ All role assignments are active with healthy term validity.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {expiringAssignments.map((a) => {
                const now = new Date();
                const exp = isRoleExpiringSoon(a, 30, now);

                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-foreground">{a.roleName}</span>
                        <span className="text-xs text-muted-foreground">({a.personName || a.personEmail})</span>
                        <span
                          className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                            exp.isExpired
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {exp.isExpired ? 'EXPIRED (Authority Blocked)' : `Expires in ${exp.daysLeft} days`}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Term Expiry: {a.effectiveTo ? new Date(a.effectiveTo).toLocaleDateString() : 'N/A'} · Action Required: Prompt for Renewal, Role Rotation, or Retirement.
                      </p>
                    </div>

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setRenewalTargetAssignment(a)}
                        data-testid={`prompt-renew-${a.id}`}
                        className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition min-h-[44px] mobile-touch-target"
                      >
                        ⚡ Process Annual Renewal / Rotation
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* TAB 3: FULL TIMELINE & AUDIT HISTORY */}
      {activeTab === 'history' && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="border-b pb-2">
            <h3 className="text-xs font-bold text-foreground">Immutable Role Succession &amp; Timeline Ledger</h3>
            <p className="text-[11px] text-muted-foreground">
              Complete historical record of all appointments, term completions, rotations, and successions.
            </p>
          </div>

          {roleHistory.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No historical records logged yet.</div>
          ) : (
            <div className="space-y-3">
              {roleHistory.map((item) => {
                const isActive = item.status === 'ACTIVE';
                const isRotated = item.status === 'ROTATED';
                const isSuperseded = item.status === 'SUPERSEDED';
                const isRetired = item.status === 'RETIRED';

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-1.5 relative overflow-hidden text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-foreground">{item.roleName}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-semibold text-foreground">{item.personName || item.personEmail || 'Vacant'}</span>
                      </div>

                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : isRotated
                            ? 'bg-blue-100 text-blue-900 border-blue-300'
                            : isRetired
                            ? 'bg-slate-100 text-slate-900 border-slate-300'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-3">
                      <span>
                        Effective: {new Date(item.effectiveFrom).toLocaleDateString()}
                        {item.effectiveTo ? ` – ${new Date(item.effectiveTo).toLocaleDateString()}` : ' – Ongoing'}
                      </span>
                      {item.appointmentEvent && <span>Event: {item.appointmentEvent}</span>}
                      {item.removalReason && <span>Note: {item.removalReason}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Succession Modal */}
      {transferTargetRole && (
        <RoleTransferModal
          isOpen={Boolean(transferTargetRole)}
          onClose={() => setTransferTargetRole(null)}
          organizationId={organizationId}
          members={members}
          initialRoleId={transferTargetRole.roleId}
          initialPredecessorId={transferTargetRole.predecessorId}
          transferFn={transferOrgRoleSuccession}
          onSuccess={(msg) => {
            onNotification?.(msg);
            void loadHistory();
          }}
        />
      )}

      {/* Renewal / Rotation Modal */}
      {renewalTargetAssignment && (
        <RoleRenewalModal
          isOpen={Boolean(renewalTargetAssignment)}
          onClose={() => setRenewalTargetAssignment(null)}
          assignment={renewalTargetAssignment}
          renewFn={renewOrRotateOrgRole}
          onSuccess={(msg) => {
            onNotification?.(msg);
            void loadHistory();
          }}
        />
      )}
    </div>
  );
}

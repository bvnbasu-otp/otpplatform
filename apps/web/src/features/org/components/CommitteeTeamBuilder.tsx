import React, { useState } from 'react';
import type { BuyerPersona } from '@otp/domain';
import { STANDARD_GOVERNANCE_ROLE_TEMPLATES, calculateRoleDefaultTermExpiry } from '@otp/domain';
import type { OrgMember } from '../api/org-members';
import { appointOrgRole } from '../api/org-members';

export interface CommitteeTeamBuilderProps {
  organizationId: string;
  organizationName?: string;
  persona?: BuyerPersona | string;
  members?: OrgMember[];
  canManage?: boolean;
  onRoleAppointed?: (roleId: string, personId: string) => void;
  onNotification?: (msg: string) => void;
}

export function CommitteeTeamBuilder({
  organizationId,
  organizationName,
  persona,
  members = [],
  canManage = true,
  onRoleAppointed,
  onNotification,
}: CommitteeTeamBuilderProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>('ESTATE_MANAGER');
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [termDurationDays, setTermDurationDays] = useState<number>(365);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const currentTemplate = STANDARD_GOVERNANCE_ROLE_TEMPLATES[selectedRoleId] ?? {
    roleId: selectedRoleId,
    roleName: selectedRoleId,
    roleCategory: 'RWA_GOVERNANCE' as const,
    responsibilityScope: 'OPERATIONS' as const,
    defaultTermDays: 365,
    defaultAuthority: { permissions: [], spendCapAmount: 500000 },
  };

  const calculatedExpiry = calculateRoleDefaultTermExpiry(new Date(), termDurationDays);

  const handleAppoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPersonId) {
      setFeedback({ ok: false, msg: 'Please select an eligible committee member.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    const res = await appointOrgRole({
      organizationId,
      personId: selectedPersonId,
      roleId: selectedRoleId,
      roleName: currentTemplate.roleName,
      roleCategory: currentTemplate.roleCategory,
      responsibilityScope: currentTemplate.responsibilityScope,
      authorityScope: currentTemplate.defaultAuthority,
      termDurationDays,
      appointmentEvent: notes || 'COMMITTEE_APPOINTMENT',
    });

    setIsSubmitting(false);

    if (res.ok) {
      const msg = `Successfully appointed ${currentTemplate.roleName} for a ${termDurationDays}-day term!`;
      setFeedback({ ok: true, msg });
      onNotification?.(msg);
      onRoleAppointed?.(selectedRoleId, selectedPersonId);
      setNotes('');
    } else {
      setFeedback({ ok: false, msg: res.error ?? 'Failed to appoint role.' });
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4" data-testid="committee-team-builder">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
            <span>🏛️</span>
            <span>{organizationName ? `${organizationName} — ` : ''}Committee &amp; Governance Builder</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure universal governance roles with standard 1-year (365 days) terms, spend limits, and succession tracking.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <span>✓</span>
          <span>Annual Expiry Enforced (365 Days)</span>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-medium border ${
            feedback.ok
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <form onSubmit={handleAppoint} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Role Selection */}
        <div className="space-y-1.5">
          <label htmlFor="committee-role-select" className="text-xs font-bold text-foreground uppercase tracking-wider">
            Governance Role
          </label>
          <select
            id="committee-role-select"
            value={selectedRoleId}
            onChange={(e) => {
              const roleId = e.target.value;
              setSelectedRoleId(roleId);
              const tpl = STANDARD_GOVERNANCE_ROLE_TEMPLATES[roleId];
              if (tpl?.defaultTermDays) {
                setTermDurationDays(tpl.defaultTermDays);
              }
            }}
            data-testid="select-committee-role"
            disabled={!canManage || isSubmitting}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary min-h-[44px]"
          >
            <optgroup label="RWA Governance Roles">
              <option value="PRESIDENT">President (Executive Head, ₹10,00,000 Spend Authority)</option>
              <option value="VICE_PRESIDENT">Vice President (Deputy Executive)</option>
              <option value="SECRETARY">Secretary (Administrative Operations, ₹5,00,000 Spend Authority)</option>
              <option value="JOINT_SECRETARY">Joint Secretary (Deputy Operations)</option>
              <option value="TREASURER">Treasurer (Financial Disbursements, ₹10,00,000 Spend Authority)</option>
              <option value="ESTATE_MANAGER">Estate Manager (Facilities & PO Issuance, ₹5,00,000 Spend Authority)</option>
              <option value="COMMITTEE_MEMBER">Committee Member (Voting & Quorum Participation)</option>
            </optgroup>
            <optgroup label="MSME Governance Roles">
              <option value="PRIMARY_OWNER">Primary MSME / Owner</option>
              <option value="MANAGER">Manager</option>
              <option value="MEMBER">Member</option>
              <option value="DELEGATE">Delegate (Proxy)</option>
            </optgroup>
          </select>
        </div>

        {/* Member Selection */}
        <div className="space-y-1.5">
          <label htmlFor="committee-person-select" className="text-xs font-bold text-foreground uppercase tracking-wider">
            Select Member / Officer
          </label>
          <select
            id="committee-person-select"
            value={selectedPersonId}
            onChange={(e) => setSelectedPersonId(e.target.value)}
            data-testid="select-committee-person"
            disabled={!canManage || isSubmitting || members.length === 0}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary min-h-[44px]"
          >
            <option value="">{members.length === 0 ? '-- No members loaded --' : '-- Choose Member from Roster --'}</option>
            {members.map((m) => (
              <option key={m.profileId} value={m.profileId}>
                {m.fullName || m.email || m.profileId} ({m.role})
              </option>
            ))}
          </select>
        </div>

        {/* Role Capability Details Card */}
        <div className="md:col-span-2 rounded-xl bg-muted/40 p-3.5 border border-border/70 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground">
              {currentTemplate.roleName} Scope &amp; Authorities
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                Spend Limit: {currentTemplate.defaultAuthority.spendCapAmount ? `₹${currentTemplate.defaultAuthority.spendCapAmount.toLocaleString('en-IN')}` : 'No Direct Financial Cap'}
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Default Term: {currentTemplate.defaultTermDays ?? 365} Days
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Category: {currentTemplate.roleCategory} | Responsibility: {currentTemplate.responsibilityScope}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {currentTemplate.defaultAuthority.permissions.map((p, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-sm bg-background border text-muted-foreground font-mono">
                {p}
              </span>
            ))}
          </div>
          {calculatedExpiry && (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 pt-1 flex items-center gap-1 font-medium">
              <span>📅</span>
              <span>
                Term Window: Today → {calculatedExpiry.toLocaleDateString('en-IN', { dateStyle: 'medium' })} (Automatic Expiry &amp; Renewal Gate)
              </span>
            </div>
          )}
        </div>

        {/* Notes / Resolution */}
        <div className="md:col-span-2 space-y-1.5">
          <label htmlFor="committee-notes" className="text-xs font-bold text-foreground uppercase tracking-wider">
            AGM Resolution / Appointment Reference (Optional)
          </label>
          <input
            id="committee-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. AGM-2026 Res 4.2 / Management Handover"
            disabled={!canManage || isSubmitting}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary min-h-[44px]"
          />
        </div>

        {canManage && (
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !selectedPersonId}
              data-testid="submit-appoint-role"
              className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition disabled:opacity-50 min-h-[44px] mobile-touch-target"
            >
              {isSubmitting ? 'Appointing Role...' : `Appoint ${currentTemplate.roleName} (1-Year Term)`}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

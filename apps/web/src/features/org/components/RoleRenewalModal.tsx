import React, { useState } from 'react';
import type { OrgRoleAssignment, RoleRenewalParams, RoleRenewalResult } from '@otp/domain';
import { STANDARD_GOVERNANCE_ROLE_TEMPLATES } from '@otp/domain';

interface RoleRenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: OrgRoleAssignment;
  onSuccess: (message: string) => void;
  renewFn: (params: RoleRenewalParams) => Promise<RoleRenewalResult | { ok: false; error: string }>;
}

export function RoleRenewalModal({
  isOpen,
  onClose,
  assignment,
  onSuccess,
  renewFn,
}: RoleRenewalModalProps) {
  const [continueInGovernance, setContinueInGovernance] = useState<boolean>(true);
  const [selectedRoleId, setSelectedRoleId] = useState<string>(assignment.roleId);
  const [termDurationDays, setTermDurationDays] = useState<number>(assignment.termDurationDays || 365);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().split('T')[0] ?? '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isRotating = selectedRoleId !== assignment.roleId;
  const currentTemplate = STANDARD_GOVERNANCE_ROLE_TEMPLATES[assignment.roleId];
  const targetTemplate = STANDARD_GOVERNANCE_ROLE_TEMPLATES[selectedRoleId];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const res = await renewFn({
      assignmentId: assignment.id,
      continueInGovernance,
      renewalRoleId: continueInGovernance ? selectedRoleId : undefined,
      renewalRoleName: continueInGovernance ? targetTemplate?.roleName || selectedRoleId : undefined,
      termDurationDays,
      effectiveDate: new Date(`${effectiveDate}T00:00:00Z`).toISOString(),
      notes: notes.trim() || undefined,
    });

    setIsSubmitting(false);

    if (!res.ok) {
      const errMsg = 'error' in res ? res.error : (res as any).message ?? 'Failed to process annual renewal/rotation';
      setError(errMsg);
    } else {
      onSuccess(res.message);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-card w-full max-w-lg rounded-2xl border border-border p-4 sm:p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2 border-b border-border/70 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
              <span>📅</span>
              <span>Annual Term Renewal &amp; Role Rotation</span>
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Review expiring term for <strong>{assignment.personName || 'Role Holder'}</strong> ({assignment.roleName}).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1: Continue in Governance? (Yes / No) */}
          <div className="space-y-1.5">
            <span className="block text-xs font-bold text-foreground">
              1. Continue in Committee / Management? <span className="text-red-500">*</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setContinueInGovernance(true)}
                data-testid="renewal-continue-yes"
                className={`p-3 rounded-xl border text-left transition min-h-[44px] ${
                  continueInGovernance
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-2xs'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">✓</span>
                  <div>
                    <p className="text-xs font-bold leading-tight">Yes, Continue</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Renew term or rotate role</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setContinueInGovernance(false)}
                data-testid="renewal-continue-no"
                className={`p-3 rounded-xl border text-left transition min-h-[44px] ${
                  !continueInGovernance
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold shadow-2xs'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">👋</span>
                  <div>
                    <p className="text-xs font-bold leading-tight">No, Step Down</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Retire &amp; retain resident account</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Step 2 (If Yes): Select Role & Term Duration */}
          {continueInGovernance ? (
            <div className="space-y-3 rounded-xl bg-muted/30 border border-border/80 p-3.5">
              <div>
                <label htmlFor="renewal-role-select" className="block text-xs font-bold text-foreground mb-1">
                  2. Select Role for Renewal Term:
                </label>
                <select
                  id="renewal-role-select"
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  disabled={isSubmitting}
                  data-testid="renewal-role-select"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
                >
                  <optgroup label="Retain Existing Role">
                    <option value={assignment.roleId}>
                      {assignment.roleName} (Retain Same Role)
                    </option>
                  </optgroup>
                  <optgroup label="Rotate into Different Role">
                    {Object.values(STANDARD_GOVERNANCE_ROLE_TEMPLATES)
                      .filter((t) => t.roleId !== assignment.roleId)
                      .map((t) => (
                        <option key={t.roleId} value={t.roleId}>
                          Rotate to: {t.roleName}
                        </option>
                      ))}
                  </optgroup>
                </select>

                {isRotating && (
                  <p className="text-[11px] text-primary font-semibold mt-1">
                    🔄 Role Rotation: Previous {assignment.roleName} role will be marked ROTATED, and new {targetTemplate?.roleName} role will be activated.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Term Duration */}
                <div>
                  <label htmlFor="term-duration-select" className="block text-xs font-bold text-foreground mb-1">
                    Term Duration
                  </label>
                  <select
                    id="term-duration-select"
                    value={termDurationDays}
                    onChange={(e) => setTermDurationDays(Number(e.target.value))}
                    disabled={isSubmitting}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
                  >
                    <option value={365}>1 Year (365 Days) — Standard</option>
                    <option value={180}>6 Months (180 Days)</option>
                    <option value={730}>2 Years (730 Days)</option>
                  </select>
                </div>

                {/* Effective Date */}
                <div>
                  <label htmlFor="renewal-effective-date" className="block text-xs font-bold text-foreground mb-1">
                    Renewal Start Date
                  </label>
                  <input
                    id="renewal-effective-date"
                    type="date"
                    required
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-3 space-y-1 text-xs">
              <p className="font-bold text-rose-800 dark:text-rose-300">👋 Retirement &amp; Continuity Guarantee:</p>
              <p className="text-[11px] text-rose-700 dark:text-rose-400">
                The member will be marked <strong>RETIRED</strong>. Governance &amp; merit voting powers will be revoked upon term end, but their resident account and historical action audits will remain 100% preserved.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label htmlFor="renewal-notes-input" className="block text-xs font-bold text-foreground mb-1">
              Renewal / Rotation Justification Notes
            </label>
            <input
              id="renewal-notes-input"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. AGM 2027 Renewal Resolution"
              disabled={isSubmitting}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 p-2 rounded-xl border border-red-200">
              ⚠️ {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/70">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="submit-renewal-btn"
              className="px-5 py-2 text-xs font-extrabold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs min-h-[44px] flex items-center gap-1.5"
            >
              {isSubmitting
                ? 'Processing…'
                : continueInGovernance
                ? isRotating
                  ? 'Confirm Role Rotation'
                  : 'Confirm 1-Year Renewal'
                : 'Confirm Retirement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

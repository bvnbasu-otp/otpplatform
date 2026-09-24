import React, { useState } from 'react';
import type { OrgMember } from '../api/org-members';
import { STANDARD_GOVERNANCE_ROLE_TEMPLATES } from '@otp/domain';

interface RoleTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  members: OrgMember[];
  initialRoleId?: string;
  initialPredecessorId?: string | null;
  onSuccess: (message: string) => void;
  transferFn: (params: {
    organizationId: string;
    roleId: string;
    roleName?: string;
    predecessorPersonId?: string | null;
    successorPersonId?: string | null;
    effectiveDate?: string;
    successionEvent?: string;
    reason?: string;
    predecessorNewRole?: string;
  }) => Promise<{ ok: boolean; message?: string; error?: string }>;
}

export function RoleTransferModal({
  isOpen,
  onClose,
  organizationId,
  members,
  initialRoleId = 'PRESIDENT',
  initialPredecessorId = null,
  onSuccess,
  transferFn,
}: RoleTransferModalProps) {
  const [roleId, setRoleId] = useState(initialRoleId);
  const [predecessorId, setPredecessorId] = useState<string>(initialPredecessorId || '');
  const [successorId, setSuccessorId] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().split('T')[0] ?? '');
  const [reason, setReason] = useState('Annual AGM Succession & Handover');
  const [predecessorNewRole, setPredecessorNewRole] = useState('COMMITTEE_MEMBER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const roleTemplate = STANDARD_GOVERNANCE_ROLE_TEMPLATES[roleId];
  const roleName = roleTemplate?.roleName || roleId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!successorId) {
      setError('Please select a successor colleague.');
      return;
    }
    if (predecessorId && predecessorId === successorId) {
      setError('Successor cannot be the same person as the current role holder.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const res = await transferFn({
      organizationId,
      roleId,
      roleName,
      predecessorPersonId: predecessorId || null,
      successorPersonId: successorId,
      effectiveDate: new Date(`${effectiveDate}T00:00:00Z`).toISOString(),
      reason,
      predecessorNewRole,
    });

    setIsSubmitting(false);

    if (!res.ok) {
      setError(res.error || 'Failed to execute role succession');
    } else {
      onSuccess(res.message || `Successfully transferred ${roleName} authority.`);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-card w-full max-w-lg rounded-2xl border border-border p-4 sm:p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2 border-b border-border/70 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
              <span>🔄</span>
              <span>Execute Role Succession Handover</span>
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Atomically transfers authority to successor, terminates predecessor role, and stamps immutable audit logs.
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

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Role Selection */}
          <div>
            <label htmlFor="succession-role-select" className="block text-xs font-bold text-foreground mb-1">
              Governance Role to Transfer <span className="text-red-500">*</span>
            </label>
            <select
              id="succession-role-select"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
            >
              {Object.values(STANDARD_GOVERNANCE_ROLE_TEMPLATES).map((t) => (
                <option key={t.roleId} value={t.roleId}>
                  {t.roleName} ({t.roleCategory === 'RWA_GOVERNANCE' ? 'RWA' : 'MSME'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Predecessor Select */}
            <div>
              <label htmlFor="predecessor-select" className="block text-xs font-bold text-foreground mb-1">
                Outgoing Role Holder
              </label>
              <select
                id="predecessor-select"
                value={predecessorId}
                onChange={(e) => setPredecessorId(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
              >
                <option value="">Auto-detect / Vacant</option>
                {members.map((m) => (
                  <option key={m.profileId} value={m.profileId}>
                    {m.fullName || m.email} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Successor Select */}
            <div>
              <label htmlFor="successor-select" className="block text-xs font-bold text-foreground mb-1">
                Incoming Successor <span className="text-red-500">*</span>
              </label>
              <select
                id="successor-select"
                required
                value={successorId}
                onChange={(e) => setSuccessorId(e.target.value)}
                disabled={isSubmitting}
                data-testid="succession-successor-select"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
              >
                <option value="">Select Successor Colleague…</option>
                {members
                  .filter((m) => m.profileId !== predecessorId)
                  .map((m) => (
                    <option key={m.profileId} value={m.profileId}>
                      {m.fullName || m.email}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Effective Date */}
            <div>
              <label htmlFor="effective-date-input" className="block text-xs font-bold text-foreground mb-1">
                Handover Effective Date <span className="text-red-500">*</span>
              </label>
              <input
                id="effective-date-input"
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
              />
            </div>

            {/* Predecessor Transition Role */}
            <div>
              <label htmlFor="predecessor-new-role" className="block text-xs font-bold text-foreground mb-1">
                Outgoing Holder New Role
              </label>
              <select
                id="predecessor-new-role"
                value={predecessorNewRole}
                onChange={(e) => setPredecessorNewRole(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
              >
                <option value="COMMITTEE_MEMBER">Committee Member (Retains voting)</option>
                <option value="BUYER">Resident Buyer (Standard Member)</option>
                <option value="VIEWER">Viewer (Read-only)</option>
                <option value="EXIT">Exit Organization</option>
              </select>
            </div>
          </div>

          {/* Reason / Event */}
          <div>
            <label htmlFor="succession-reason-input" className="block text-xs font-bold text-foreground mb-1">
              Handover Event / Reason
            </label>
            <input
              id="succession-reason-input"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. AGM 2026 Election Handover"
              disabled={isSubmitting}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground min-h-[44px]"
            />
          </div>

          {/* Governance Invariants Callout */}
          <div className="rounded-xl bg-muted/40 border border-border p-2.5 text-[11px] text-muted-foreground space-y-1">
            <p className="font-bold text-foreground flex items-center gap-1">
              <span>🛡️</span>
              <span>Continuity Invariant Guarantee:</span>
            </p>
            <p>
              Predecessor historical signoffs &amp; audit trails remain immutable. Successor gains active authority starting from effective date.
            </p>
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
              disabled={isSubmitting || !successorId}
              data-testid="submit-succession-btn"
              className="px-5 py-2 text-xs font-extrabold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs min-h-[44px] flex items-center gap-1.5"
            >
              {isSubmitting ? 'Transferring…' : 'Confirm & Execute Handover'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

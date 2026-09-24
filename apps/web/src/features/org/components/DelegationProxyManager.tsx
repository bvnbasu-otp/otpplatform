import React, { useState } from 'react';
import type { OrganizationDelegation, DelegationPermission } from '@otp/domain';
import { DELEGATION_PERMISSIONS } from '@otp/domain';
import type { OrgMember } from '../api/org-members';

export interface DelegationProxyManagerProps {
  organizationId: string;
  currentActorProfileId: string;
  isPrimaryOrAdmin: boolean;
  members: OrgMember[];
  delegations: OrganizationDelegation[];
  onCreateDelegation: (params: {
    delegateeId: string;
    delegateeName?: string;
    delegateeEmail?: string;
    permissions: DelegationPermission[];
    spendCapAmount?: number | null;
    startsAt: string;
    expiresAt: string;
    notes?: string;
  }) => Promise<{ ok: boolean; message: string }>;
  onRevokeDelegation: (delegationId: string, reason?: string) => Promise<{ ok: boolean; message: string }>;
  isLoading?: boolean;
}

const PERMISSION_LABELS: Record<DelegationPermission, { title: string; subtitle: string; icon: string }> = {
  APPROVE_TIER_1: {
    title: 'Tier 1 Approval (≤ ₹5 Lakhs)',
    subtitle: 'Operational spend approval for standard requirements',
    icon: '⚡',
  },
  APPROVE_TIER_2: {
    title: 'Tier 2 Approval (₹5L – ₹25 Lakhs)',
    subtitle: 'High-value commercial sign-off for major procurements',
    icon: '💼',
  },
  APPROVE_TIER_3: {
    title: 'Tier 3 Executive Gate (> ₹25 Lakhs)',
    subtitle: 'Executive directorate sign-off (Reserved for Primary/Owner)',
    icon: '👑',
  },
  VOTE_COMMITTEE: {
    title: 'Committee Ballot Voting',
    subtitle: 'Cast sealed quotation votes in review rooms',
    icon: '🗳️',
  },
  ISSUE_PO: {
    title: 'Issue Purchase Orders',
    subtitle: 'Sign and release legal POs to awarded suppliers',
    icon: '📄',
  },
  RELEASE_PAYMENT: {
    title: 'Release Milestone Payments',
    subtitle: 'Sign off on delivery inspection and milestone disbursements',
    icon: '💳',
  },
};

const PRESET_SPEND_CAPS = [
  { label: '₹1 Lakh', value: 100000 },
  { label: '₹2.5 Lakhs', value: 250000 },
  { label: '₹5 Lakhs', value: 500000 },
  { label: '₹10 Lakhs', value: 1000000 },
  { label: 'No Limit', value: null },
];

export function DelegationProxyManager({
  organizationId,
  currentActorProfileId,
  isPrimaryOrAdmin,
  members,
  delegations,
  onCreateDelegation,
  onRevokeDelegation,
  isLoading = false,
}: DelegationProxyManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [delegateeId, setDelegateeId] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<DelegationPermission[]>(['APPROVE_TIER_1']);
  const [spendCapType, setSpendCapType] = useState<string>('500000');
  const [customSpendCap, setCustomSpendCap] = useState('');
  const [durationDays, setDurationDays] = useState<number>(30);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Eligible delegatees: must be org members other than current actor (Anti-Self-Delegation)
  const eligibleDelegatees = members.filter((m) => m.profileId !== currentActorProfileId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!delegateeId) {
      setStatusMessage({ type: 'error', text: 'Please select an eligible team member to delegate authority.' });
      return;
    }
    if (selectedPermissions.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please select at least one delegation permission.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    const now = new Date();
    const expires = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const cap = spendCapType === 'custom'
      ? parseFloat(customSpendCap) || null
      : spendCapType === 'none'
      ? null
      : parseFloat(spendCapType);

    const selectedMember = members.find((m) => m.profileId === delegateeId);

    const result = await onCreateDelegation({
      delegateeId,
      delegateeName: selectedMember ? `${selectedMember.fullName || selectedMember.email}` : undefined,
      delegateeEmail: selectedMember?.email,
      permissions: selectedPermissions,
      spendCapAmount: cap,
      startsAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      notes: notes.trim() || undefined,
    });

    setSubmitting(false);
    if (result.ok) {
      setStatusMessage({ type: 'success', text: result.message || 'Spend delegation successfully granted.' });
      setIsCreating(false);
      setDelegateeId('');
      setNotes('');
    } else {
      setStatusMessage({ type: 'error', text: result.message || 'Failed to create spend delegation.' });
    }
  };

  const handleRevoke = async (delegationId: string) => {
    if (!window.confirm('Are you sure you want to revoke this spend delegation? The delegatee will immediately lose approval authority.')) {
      return;
    }
    const result = await onRevokeDelegation(delegationId, 'Revoked by Primary Administrator');
    if (result.ok) {
      setStatusMessage({ type: 'success', text: 'Delegation successfully revoked.' });
    } else {
      setStatusMessage({ type: 'error', text: result.message || 'Failed to revoke delegation.' });
    }
  };

  const togglePermission = (perm: DelegationPermission) => {
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  return (
    <div className="space-y-6" data-testid="delegation-proxy-manager">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border shadow-xs">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
            <span>🛡️</span> MSME Spend Delegations &amp; Proxy Signoffs
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure time-bounded, spend-capped proxy authorities with strict anti-self-approval enforcement.
          </p>
        </div>

        {isPrimaryOrAdmin && !isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer min-h-[44px]"
          >
            <span>➕</span> Grant New Spend Delegation
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
          role="alert"
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs font-bold opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Delegation Creation Form */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="p-5 rounded-2xl bg-card border border-primary/30 shadow-md space-y-4 text-xs animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
              <span>✍️</span> Grant Spend Delegation Proxy
            </h4>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>

          {/* Delegatee Selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-foreground block">
              Select Delegatee (Team Member) <span className="text-red-500">*</span>
            </label>
            <select
              value={delegateeId}
              onChange={(e) => setDelegateeId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground font-medium text-xs min-h-[44px]"
              required
            >
              <option value="">-- Choose team member --</option>
              {eligibleDelegatees.map((m) => (
                <option key={m.profileId} value={m.profileId}>
                  {m.fullName || m.email} ({m.role || 'MEMBER'})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Anti-Self-Delegation Guard: You cannot delegate spend authority to yourself.
            </p>
          </div>

          {/* Spend Cap Selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-foreground block">
              Monetary Spend Cap (₹) <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {PRESET_SPEND_CAPS.map((cap) => (
                <button
                  key={cap.label}
                  type="button"
                  onClick={() => {
                    setSpendCapType(cap.value === null ? 'none' : String(cap.value));
                    setCustomSpendCap('');
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition text-center min-h-[44px] ${
                    (cap.value === null && spendCapType === 'none') || spendCapType === String(cap.value)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cap.label}
                </button>
              ))}
            </div>
            {spendCapType === 'custom' && (
              <input
                type="number"
                placeholder="Enter custom spend cap in ₹"
                value={customSpendCap}
                onChange={(e) => setCustomSpendCap(e.target.value)}
                className="w-full mt-2 px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs min-h-[44px]"
                min="1000"
                required
              />
            )}
          </div>

          {/* Duration Selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-foreground block">
              Validity Window (Time-Bounded) <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              {[7, 14, 30, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDurationDays(days)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition min-h-[44px] ${
                    durationDays === days
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {days} Days
                </button>
              ))}
            </div>
          </div>

          {/* Permissions Checkboxes */}
          <div className="space-y-2">
            <label className="font-bold text-foreground block">
              Delegated Permissions <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DELEGATION_PERMISSIONS.filter((p) => p !== 'APPROVE_TIER_3').map((perm) => {
                const isSelected = selectedPermissions.includes(perm);
                const info = PERMISSION_LABELS[perm];
                return (
                  <label
                    key={perm}
                    onClick={() => togglePermission(perm)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition ${
                      isSelected
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by parent label onClick
                      className="mt-0.5 rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                    <div>
                      <span className="font-bold text-xs flex items-center gap-1">
                        <span>{info?.icon || '⚡'}</span> {info?.title || perm}
                      </span>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {info?.subtitle || ''}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="font-bold text-foreground block">
              Notes / Delegation Justification (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Authorized proxy during Primary annual leave"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs min-h-[44px]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px] cursor-pointer"
            >
              {submitting ? 'Granting…' : 'Confirm Delegation Proxy'}
            </button>
          </div>
        </form>
      )}

      {/* Active Delegations List */}
      <div className="space-y-3">
        <h4 className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-2">
          <span>📋</span> Configured Delegation Proxies ({delegations.length})
        </h4>

        {delegations.length === 0 ? (
          <div className="p-8 rounded-2xl bg-card border border-dashed border-border text-center space-y-2">
            <span className="text-3xl">🛡️</span>
            <p className="text-xs font-bold text-foreground">No active spend delegations configured</p>
            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
              Primary administrators can delegate operational spend sign-offs to managers and leads within configured caps and time limits.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {delegations.map((d) => {
              const isExpired = new Date(d.expiresAt).getTime() < Date.now();
              const isRevoked = Boolean(d.revokedAt) || !d.isActive;
              const isCurrentlyActive = !isExpired && !isRevoked;

              return (
                <div
                  key={d.id}
                  className={`p-4 rounded-2xl border transition space-y-3 bg-card ${
                    isCurrentlyActive
                      ? 'border-emerald-200 dark:border-emerald-900/60 shadow-xs'
                      : 'border-border opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-foreground">
                          {d.delegateeName || d.delegateeEmail || `Delegate ${d.delegateeId.slice(0, 8)}`}
                        </span>
                        {isCurrentlyActive ? (
                          <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-extrabold border border-emerald-300">
                            Active
                          </span>
                        ) : isRevoked ? (
                          <span className="rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 px-2 py-0.5 text-[10px] font-extrabold border border-red-300">
                            Revoked
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-extrabold border border-border">
                            Expired
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Spend Cap: <strong className="text-foreground">{d.spendCapAmount ? `₹${d.spendCapAmount.toLocaleString('en-IN')}` : 'Unlimited (No Cap)'}</strong>
                      </p>
                    </div>

                    {isPrimaryOrAdmin && isCurrentlyActive && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(d.id)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/60 transition cursor-pointer"
                      >
                        Revoke
                      </button>
                    )}
                  </div>

                  {/* Permissions Pills */}
                  <div className="flex flex-wrap gap-1">
                    {d.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-muted text-foreground border border-border"
                      >
                        {PERMISSION_LABELS[perm]?.title || perm}
                      </span>
                    ))}
                  </div>

                  {/* Date Validity */}
                  <div className="text-[10px] text-muted-foreground flex items-center justify-between border-t border-border/60 pt-2">
                    <span>Valid from: {new Date(d.startsAt).toLocaleDateString('en-IN')}</span>
                    <span>Expires: {new Date(d.expiresAt).toLocaleDateString('en-IN')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

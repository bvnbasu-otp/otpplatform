import React, { useState, useEffect } from 'react';
import type { StaffReferralAchievement } from '../api/internal-ops';
import {
  fetchStaffReferralAchievements,
  authorizeStaffReferral,
  rejectStaffReferral,
  processStaffPayout,
  cancelStaffPayout,
} from '../api/internal-ops';

export function StaffReferralLedgerPanel() {
  const [achievements, setAchievements] = useState<StaffReferralAchievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchStaffReferralAchievements();
      setAchievements(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleAuthorize = async (id: string) => {
    const amountStr = window.prompt('Enter approved fixed incentive amount in INR (e.g. 5000):', '5000');
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      alert('Invalid amount. Must be a positive number.');
      return;
    }

    setActiveActionId(id);
    try {
      const res = await authorizeStaffReferral(id, amount);
      if (res.ok) {
        await loadData();
      } else {
        alert(res.error || 'Failed to authorize referral achievement.');
      }
    } finally {
      setActiveActionId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('Provide rejection rationale for this referral achievement:');
    if (!reason || !reason.trim()) return;

    setActiveActionId(id);
    try {
      const res = await rejectStaffReferral(id, reason);
      if (res.ok) {
        await loadData();
      } else {
        alert(res.error || 'Failed to reject referral achievement.');
      }
    } finally {
      setActiveActionId(null);
    }
  };

  const handleProcessPayout = async (payoutId: string) => {
    const utr = window.prompt('Enter Bank UTR / Transaction Reference (e.g. UTR-20261018-001):');
    if (!utr || !utr.trim()) return;

    const notes = window.prompt('Enter bank batch settlement note (optional):', 'Settled via NEFT batch');
    const evidence = {
      utr: utr.trim(),
      notes: notes || 'Direct bank settlement',
      settled_timestamp: new Date().toISOString(),
    };

    setActiveActionId(payoutId);
    try {
      const res = await processStaffPayout(payoutId, utr, evidence);
      if (res.ok) {
        await loadData();
      } else {
        alert(res.error || 'Failed to record payout settlement.');
      }
    } finally {
      setActiveActionId(null);
    }
  };

  const handleCancelPayout = async (payoutId: string) => {
    const reason = window.prompt('Enter cancellation reason (linked achievement will atomically reset to RECORDED):');
    if (!reason || !reason.trim()) return;

    setActiveActionId(payoutId);
    try {
      const res = await cancelStaffPayout(payoutId, reason);
      if (res.ok) {
        await loadData();
      } else {
        alert(res.error || 'Failed to cancel payout.');
      }
    } finally {
      setActiveActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-foreground">Staff Referral Incentive Ledger</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Performance-based employee referral incentives strictly decoupled from salary. Enforces anti-self-approval and Level 1 UTR bank evidence.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted"
        >
          ↻ Refresh Ledger
        </button>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h3 className="text-base font-semibold text-foreground mb-4">Referral Achievements & Payouts</h3>
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading referral ledger…</div>
        ) : achievements.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No referral achievements recorded in the ledger yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/30 text-muted-foreground font-semibold">
                <tr>
                  <th className="py-3 px-4">Referral Code</th>
                  <th className="py-3 px-4">Target Kind</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Incentive (INR)</th>
                  <th className="py-3 px-4">Bank Settlement UTR</th>
                  <th className="py-3 px-4">Recorded At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {achievements.map((ach) => (
                  <tr key={ach.id} className="hover:bg-muted/10 transition">
                    <td className="py-3 px-4 font-mono font-medium text-foreground">
                      {ach.referral_code}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-foreground">
                        {ach.target_kind}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                          ach.status === 'RECORDED'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                            : ach.status === 'AUTHORIZED'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            : ach.status === 'SETTLED'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {ach.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground">
                      {ach.awarded_amount_inr ? `₹${Number(ach.awarded_amount_inr).toLocaleString()}` : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground">
                      {ach.payout?.finance_reference_id || '—'}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {new Date(ach.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      {ach.status === 'RECORDED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleAuthorize(ach.id)}
                            disabled={activeActionId === ach.id}
                            className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            Authorize
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(ach.id)}
                            disabled={activeActionId === ach.id}
                            className="rounded border border-destructive/30 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {ach.status === 'AUTHORIZED' && ach.payout?.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleProcessPayout(ach.payout!.id)}
                            disabled={activeActionId === ach.payout!.id}
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                          >
                            Record Payout (UTR)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelPayout(ach.payout!.id)}
                            disabled={activeActionId === ach.payout!.id}
                            className="rounded border border-destructive/30 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

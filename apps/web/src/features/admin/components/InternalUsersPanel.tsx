import React, { useState, useEffect } from 'react';
import type { InternalRole, InternalInvitation } from '../api/internal-ops';
import {
  fetchInternalRoles,
  fetchInternalInvitations,
  revokeInternalInvitation,
  reconcileInternalInvitation,
} from '../api/internal-ops';
import { InviteInternalUserModal } from './InviteInternalUserModal';

export function InternalUsersPanel() {
  const [roles, setRoles] = useState<InternalRole[]>([]);
  const [invitations, setInvitations] = useState<InternalInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [r, inv] = await Promise.all([
        fetchInternalRoles(),
        fetchInternalInvitations(),
      ]);
      setRoles(r);
      setInvitations(inv);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleRevoke = async (id: string) => {
    const reason = window.prompt('Please provide a reason for revoking this invitation:');
    if (!reason || !reason.trim()) return;

    setRevokingId(id);
    try {
      const res = await revokeInternalInvitation(id, reason);
      if (res.ok) {
        await loadData();
      } else {
        alert(res.error || 'Failed to revoke invitation');
      }
    } finally {
      setRevokingId(null);
    }
  };

  const handleReconcile = async (id: string) => {
    const confirmed = window.confirm(
      'Reconcile this pending invitation only if the invited account already has the exact assigned internal role. This does not grant or change roles. Continue?',
    );
    if (!confirmed) return;

    setReconcilingId(id);
    try {
      const res = await reconcileInternalInvitation(id);
      if (res.ok) {
        await loadData();
      } else {
        alert(res.error || 'Invitation could not be reconciled. Use the acceptance link if the role is not already assigned.');
      }
    } finally {
      setReconcilingId(null);
    }
  };

  const formatExpiry = (expiresAt: string) => {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffHours = Math.round((expiry.getTime() - now.getTime()) / (1000 * 60 * 60));
    if (diffHours < 0) return 'Expired';
    return `${diffHours}h remaining`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-foreground">Internal Users & Invitations</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Manage internal platform operator accounts, invitation lifespans (48h max), and status revocations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted"
          >
            ↻ Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsInviteModalOpen(true)}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            + Invite Internal User
          </button>
        </div>
      </div>

      {/* Invitations Table */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h3 className="text-base font-semibold text-foreground mb-4">
          Internal Invitations (48-Hour Strict Lifecycle)
        </h3>
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading invitations…</div>
        ) : invitations.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No internal invitations found. Click "+ Invite Internal User" to issue one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/30 text-muted-foreground font-semibold">
                <tr>
                  <th className="py-3 px-4">Invited Email</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Issued At</th>
                  <th className="py-3 px-4">Lifespan / Expiry</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invitations.map((inv) => {
                  const displayStatus = inv.status === 'PENDING' && new Date(inv.expires_at).getTime() <= Date.now() ? 'EXPIRED' : inv.status;
                  return (
                  <tr key={inv.id} className="hover:bg-muted/10 transition">
                    <td className="py-3 px-4 font-medium text-foreground">{inv.email}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary">
                        {inv.role_code || 'OPERATOR'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        data-testid="invitation-status"
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                          displayStatus === 'PENDING'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                            : displayStatus === 'ACCEPTED'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {displayStatus}
                      </span>
                      {displayStatus === 'REVOKED' && inv.revocation_reason ? (
                        <span className="mt-1 block text-[10px] text-muted-foreground">Reason: {inv.revocation_reason}</span>
                      ) : null}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {new Date(inv.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {formatExpiry(inv.expires_at)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {displayStatus === 'ACCEPTED' && inv.accepted_at && (
                        <span className="text-[10px] text-muted-foreground">Accepted {new Date(inv.accepted_at).toLocaleString()}</span>
                      )}
                      {displayStatus === 'PENDING' && (
                        <div className="inline-flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleRevoke(inv.id)}
                          disabled={revokingId === inv.id}
                          className="rounded border border-destructive/30 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                        >
                          {revokingId === inv.id ? 'Revoking…' : 'Revoke'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReconcile(inv.id)}
                          disabled={reconcilingId === inv.id}
                          className="rounded border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
                        >
                          {reconcilingId === inv.id ? 'Checking…' : 'Reconcile existing access'}
                        </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InviteInternalUserModal
        roles={roles}
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
}

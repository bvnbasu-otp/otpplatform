import React, { useState } from 'react';
import type { InternalRole } from '../api/internal-ops';
import { createInternalInvitation } from '../api/internal-ops';

interface InviteInternalUserModalProps {
  roles: InternalRole[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function InviteInternalUserModal({
  roles,
  isOpen,
  onClose,
  onSuccess,
}: InviteInternalUserModalProps) {
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState(roles[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !roleId) {
      setError('Please provide an email and select an internal role.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await createInternalInvitation(email, roleId);
      if (res.ok) {
        setEmail('');
        onSuccess();
        onClose();
      } else {
        setError(res.error || 'Failed to issue internal invitation.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b">
          <h3 className="text-lg font-bold text-foreground">Invite Internal Staff</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Staff Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@otp.test"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Internal Role Assignment
            </label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">🔒 Security Policy Enforcement:</p>
            <p>• Invitations strictly expire in <strong>48 hours</strong>.</p>
            <p>• Single-use cryptographic token.</p>
            <p>• Internal operators are strictly isolated from customer procurement portals.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border px-4 py-2 text-xs font-semibold hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Issuing Invitation…' : 'Send Invitation (48h)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/features/auth';
import { Button, Field, controlClasses } from '@/components/ui';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const { user, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setPassword('');
      setConfirmPassword('');
      onClose();
    }, 2000);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24 sm:pt-28 pb-8 px-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-6 shadow-2xl space-y-4 my-auto sm:my-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <span>🔐</span> Set or Change Password
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Logged in as <strong className="text-foreground">{user?.email}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900">
            <p className="font-bold flex items-center gap-1.5">
              <span>✓</span> Password Successfully Updated!
            </p>
            <p className="mt-1 text-emerald-800">
              You can now use this password to sign in on any computer or mobile device.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-900">
                {error}
              </div>
            )}

            <Field label="New Password" required help="Minimum 8 characters.">
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={controlClasses(invalid)}
                  placeholder="••••••••••••"
                  required
                  autoFocus
                />
              )}
            </Field>

            <Field label="Confirm New Password" required>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={controlClasses(invalid)}
                  placeholder="••••••••••••"
                  required
                />
              )}
            </Field>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
              >
                Cancel
              </button>
              <Button
                type="submit"
                variant="action"
                size="md"
                busy={busy}
                busyLabel="Saving…"
              >
                Save Password
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}

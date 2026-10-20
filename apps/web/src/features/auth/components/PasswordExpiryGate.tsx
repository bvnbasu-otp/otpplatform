import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { validatePasswordComplexity, type PasswordPolicyView } from '@otp/domain';
import { useAuth } from '../AuthProvider';
import { useRoleContext } from '@/features/roles';
import { changePasswordSecure } from '../api/password-policy';
import { Button, Field, controlClasses } from '@/components/ui';
import { PASSWORD_REQUIREMENTS_COPY } from '../lib/password-requirements-copy';

const ALLOWED_PATH_PREFIXES = ['/account/password-expired', '/reset-password'];

export function isPasswordExemptPath(pathname: string): boolean {
  return ALLOWED_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export function shouldBlockForPasswordPolicy(
  policy: PasswordPolicyView | null | undefined,
  pathname: string,
): boolean {
  if (!policy?.enforced) return false;
  if (!policy.mustChangePassword) return false;
  return !isPasswordExemptPath(pathname);
}

export function PasswordExpiryGate({ children }: { children: ReactNode }) {
  const { context } = useRoleContext();
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  const policy = context.passwordPolicy;

  if (!shouldBlockForPasswordPolicy(policy, pathname)) {
    return <>{children}</>;
  }

  return <PasswordExpiredScreen email={context.email} onSignOut={() => void signOut()} />;
}

function PasswordExpiredScreen({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const complexity = validatePasswordComplexity(newPassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!complexity.valid) {
      setError(complexity.messages[0] ?? 'Password does not meet requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    const res = await changePasswordSecure(currentPassword, newPassword);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Password could not be updated.');
      return;
    }
    setSuccess(true);
    window.location.href = '/dashboard';
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg space-y-4">
        <h2 className="text-lg font-bold text-foreground">Password change required</h2>
        <p className="text-xs text-muted-foreground">
          Your password has reached the 90-day rotation policy
          {email ? (
            <>
              {' '}
              for <strong className="text-foreground">{email}</strong>
            </>
          ) : null}
          . Choose a new password before continuing.
        </p>
        <p className="text-[11px] text-muted-foreground">{PASSWORD_REQUIREMENTS_COPY}</p>

        {success ? (
          <p className="text-xs text-emerald-700">Password updated. Reloading workspace…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900" role="alert">
                {error}
              </div>
            )}
            <Field label="Current password" required>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="current-password"
                  className={controlClasses(invalid)}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label="New password" required>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="new-password"
                  className={controlClasses(invalid)}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  aria-invalid={newPassword.length > 0 && !complexity.valid}
                />
              )}
            </Field>
            {newPassword.length > 0 && !complexity.valid && (
              <ul className="text-[11px] text-amber-800 dark:text-amber-200 list-disc pl-4 space-y-0.5">
                {complexity.messages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
            <Field label="Confirm new password" required>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="new-password"
                  className={controlClasses(invalid)}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              )}
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}

        <div className="flex flex-col gap-2 pt-2 border-t text-xs">
          <Link to="/reset-password" className="text-action font-semibold hover:underline">
            Use email or WhatsApp reset instead
          </Link>
          <button type="button" onClick={onSignOut} className="text-muted-foreground hover:text-foreground text-left">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

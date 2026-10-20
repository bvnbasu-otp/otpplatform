import { Link } from 'react-router-dom';
import type { PasswordPolicyView } from '@otp/domain';
import { useRoleContext } from '@/features/roles';

function warnCopy(policy: PasswordPolicyView): string | null {
  if (!policy.enforced || policy.mustChangePassword || !policy.warnLevel) return null;
  if (policy.warnLevel === '3') {
    return `Your password expires in ${policy.daysRemaining ?? 'a few'} day(s). Change it now to avoid interruption.`;
  }
  if (policy.warnLevel === '14') {
    return `Your password will expire in ${policy.daysRemaining ?? 'about two'} days. Plan a password change soon.`;
  }
  return null;
}

export function PasswordPolicyWarningBanner() {
  const { context } = useRoleContext();
  const policy = context.passwordPolicy;
  const message = policy ? warnCopy(policy) : null;
  if (!message) return null;

  return (
    <div
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
    >
      <span>{message}</span>
      <Link to="/profile" className="ml-2 font-semibold text-action hover:underline">
        Change password
      </Link>
    </div>
  );
}

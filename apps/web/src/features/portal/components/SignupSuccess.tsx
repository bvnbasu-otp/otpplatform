import { Button } from '@/components/ui';
import { useFormText } from './FormDensity';
import type { SignupResult } from '../api/signup';
import type { PortalCopy } from '../types/portal';

/**
 * What happens after the registration form.
 *
 * For buyers, the account is auto-approved with 1 Free RFQ Starter Credit and immediate login access.
 * For suppliers, standard verification review is displayed.
 */
export function SignupSuccess({
  copy,
  result,
  onSignIn,
}: {
  copy: PortalCopy;
  result: SignupResult;
  onSignIn: () => void;
}) {
  const text = useFormText();
  const isBuyer = result.side === 'BUYER' || copy.side === 'BUYER';
  const isAutoApprovedBuyer = result.autoApproved || (result.status === 'ONBOARDED' && isBuyer);

  return (
    <div data-testid="signup-success" className="space-y-4">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-6 w-6"
        >
          <path d="m5 13 4.5 4.5L19 7" />
        </svg>
      </span>

      <h2 className={`font-extrabold text-foreground tracking-tight ${text.heading}`}>
        {result.alreadySubmitted
          ? 'We already have this registration'
          : isAutoApprovedBuyer
            ? '🎉 Account Activated & Auto-Approved!'
            : isBuyer
              ? 'Registration received — 1 Free RFQ Included'
              : 'Registration received'}
      </h2>

      <p className={`leading-relaxed text-muted-foreground ${text.body}`}>
        {result.alreadySubmitted
          ? 'This email is already registered on the platform under the reference below.'
          : isAutoApprovedBuyer
            ? 'Your buyer workspace is ready with 1 Free RFQ Credit. You can sign in immediately and post your first requirement with zero upfront charges.'
            : isBuyer
              ? 'We verify the organisation before your first request goes out to suppliers, so someone will be in touch to confirm who you buy for. You are allowed to post your first requirement for free right now while your registration is reviewed.'
              : 'We verify a business before commercial requests reach it, so someone will be in touch to confirm your registration and coverage.'}
      </p>

      {isBuyer && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-emerald-950 dark:text-emerald-200">
            <span>🎁</span>
            <span>Starter Plan: 1 Free RFQ Credit Granted</span>
          </div>
          <p className="text-[11px] text-emerald-900/80 dark:text-emerald-300/80 leading-snug">
            Your initial requirement is 100% free with identity-protected supplier quoting.
          </p>
        </div>
      )}

      <dl className={`rounded-xl border bg-card p-3.5 space-y-2 text-xs ${text.body}`}>
        <div className="flex items-center justify-between">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Reference
          </dt>
          <dd className="font-mono text-sm font-black text-foreground" data-testid="signup-reference">
            {result.reference}
          </dd>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-2">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</dt>
          <dd className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <span>●</span> {result.status}
          </dd>
        </div>

        {isAutoApprovedBuyer && result.temporaryPassword && (
          <div className="flex items-center justify-between border-t border-border/40 pt-2">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Initial Password
            </dt>
            <dd className="font-mono text-xs font-bold text-foreground bg-muted px-2 py-0.5 rounded">
              {result.temporaryPassword}
            </dd>
          </div>
        )}
      </dl>

      <Button
        variant="primary"
        className="w-full font-bold shadow-xs flex items-center justify-center gap-2"
        onClick={onSignIn}
      >
        <span>⚡</span>
        <span>{isBuyer ? 'Sign In & Post First RFQ Free →' : 'Back to sign in'}</span>
      </Button>
    </div>
  );
}

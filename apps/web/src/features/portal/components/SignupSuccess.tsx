import { Button } from '@/components/ui';
import { NotificationDeliveryNotice } from '@/features/notifications/components/NotificationDeliveryNotice';
import { useFormText } from './FormDensity';
import type { SignupResult } from '../api/signup';
import type { PortalCopy } from '../types/portal';
import { deriveRegistrationOutcome } from '../lib/registration-outcome';

/**
 * What happens after the registration form.
 *
 * The registration record, the confirmation message and its delivery are three
 * separate facts; see `deriveRegistrationOutcome`.
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
  const outcome = deriveRegistrationOutcome(result, isBuyer ? 'BUYER' : 'SUPPLIER');
  const freeCredits = typeof result.freeRfqCredits === 'number' ? result.freeRfqCredits : 0;
  const blocked = outcome.accountState === 'AUTH_SETUP_PENDING' && outcome.notification.status === 'FAILED';
  const pendingAuth = outcome.accountState === 'AUTH_SETUP_PENDING';
  const markClass = blocked
    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
    : pendingAuth
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';

  return (
    <div data-testid="signup-success" data-account-state={outcome.accountState} className="space-y-4">
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${markClass}`}>
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

      <h2 className={`font-extrabold text-foreground tracking-tight ${text.heading}`}>{outcome.headline}</h2>

      <p className={`leading-relaxed text-muted-foreground ${text.body}`}>{outcome.body}</p>

      {isBuyer && outcome.accountState !== 'ALREADY_REGISTERED' && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-emerald-950 dark:text-emerald-200">
            <span>🎁</span>
            <span>
              {freeCredits > 0
                ? `Starter Plan: ${freeCredits} Free RFQ Credit${freeCredits === 1 ? '' : 's'} on your organisation`
                : 'Starter Plan: your first RFQ credit is added when your organisation is activated'}
            </span>
          </div>
          <p className="text-[11px] text-emerald-900/80 dark:text-emerald-300/80 leading-snug">
            Your initial requirement is free with identity-protected supplier quoting.
          </p>
        </div>
      )}

      <dl className={`rounded-xl border bg-card p-3.5 space-y-2 text-xs ${text.body}`}>
        <div className="flex items-center justify-between">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Reference</dt>
          <dd className="font-mono text-sm font-black text-foreground" data-testid="signup-reference">
            {outcome.reference}
          </dd>
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-2">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Registration status</dt>
          <dd className="font-extrabold text-foreground flex items-center gap-1" data-testid="signup-status">
            <span>●</span> {outcome.statusLabel}
          </dd>
        </div>

        {/*
          A-29: there is no literal password for the server to hand back any
          more (submit_signup_request never returns one, and neither does
          admin_review_signup_request) — an auto-approved buyer's account
          activates the same way an approved applicant's does, via a
          single-use activation code delivered to their phone, not a
          password shown on this screen. See onboarding-notify (kind:
          'APPROVED') and the reused verify_whatsapp_password_reset /
          ResetPasswordPage flow.
        */}
      </dl>

      <div className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Confirmation message</p>
        <NotificationDeliveryNotice
          resolution={outcome.notification}
          purpose={result.verificationChannel === 'EMAIL' ? 'PASSWORD_RESET' : 'REGISTRATION'}
        />
      </div>
      {result.whatsappFallbackAttempted && result.guaranteedNotice && (
        <div className="space-y-1" data-testid="whatsapp-fallback-notice">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            WhatsApp fallback — email was selected, and WhatsApp was tried only after that
          </p>
          <NotificationDeliveryNotice resolution={result.guaranteedNotice} purpose="REGISTRATION" />
        </div>
      )}

      <Button
        variant="primary"
        className="w-full font-bold shadow-xs flex items-center justify-center gap-2"
        onClick={onSignIn}
      >
        <span>{outcome.canSignInNow ? 'Sign in →' : 'Back to sign in'}</span>
      </Button>
    </div>
  );
}

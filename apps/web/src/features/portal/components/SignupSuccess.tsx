import { Button } from '@/components/ui';
import { useFormText } from './FormDensity';
import type { SignupResult } from '../api/signup';
import type { PortalCopy } from '../types/portal';

/**
 * What happens after the form.
 *
 * A registration is a request, not an account, so this screen says so plainly
 * and hands over a reference the applicant can quote. Pretending they are now
 * signed up would only make the verification call feel like a rejection.
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

  return (
    <div data-testid="signup-success">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-action-soft text-action">
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

      <h2 className={`mt-4 font-semibold text-navy ${text.heading}`}>
        {result.alreadySubmitted ? 'We already have this one' : 'Registration received'}
      </h2>

      <p className={`mt-2 leading-relaxed text-slate ${text.body}`}>
        {result.alreadySubmitted
          ? 'This email is already on the list under the reference below. There is nothing more to do — we will come back to you on it.'
          : copy.side === 'BUYER'
            ? 'We verify the organisation before your first request goes out to suppliers, so someone will be in touch to confirm who you buy for.'
            : 'We verify a business before commercial requests reach it, so someone will be in touch to confirm your registration and coverage.'}
      </p>

      <dl className={`mt-5 rounded-lg border bg-muted/50 p-3.5 ${text.body}`}>
        <dt className="text-xs uppercase tracking-wide text-slate-soft">
          Your reference
        </dt>
        <dd className="mt-1 font-mono text-base font-semibold text-navy" data-testid="signup-reference">
          {result.reference}
        </dd>
        <dt className="mt-4 text-xs uppercase tracking-wide text-slate-soft">Status</dt>
        <dd className="mt-1 font-medium">{result.status}</dd>
      </dl>

      <Button variant="secondary" className="mt-5 w-full" onClick={onSignIn}>
        Back to sign in
      </Button>
    </div>
  );
}

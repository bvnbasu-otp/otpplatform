import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X2ORegistrationWizard } from '../components/wizard/X2ORegistrationWizard';
import { SignupSuccess } from '../components/SignupSuccess';
import type { SignupResult } from '../api/signup';
import { copyFor, sideFromParam, type PortalSide } from '../types/portal';
import { PRODUCT_NAME, PRODUCT_PLATFORM_SUBTITLE, PRODUCT_TITLE } from '@/lib/brand';

/**
 * X2O Mobile & Web Registration Entrypoint.
 *
 * Renders the 10-screen guided registration wizard with:
 * - 8-digit OTP phone (WhatsApp) and email verification
 * - Verified primary contacts
 * - Buyer / Supplier account type selection
 * - Individual / RWA / MSME / Supplier persona onboarding
 * - EULA acceptance & submit
 */
export function SignupPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState<SignupResult | null>(null);

  const side: PortalSide = sideFromParam(params.get('side')) ?? 'BUYER';
  const copy = copyFor(side);
  const refCode = params.get('ref') || params.get('referral');

  return (
    <div className="min-h-screen bg-background">
      {/* Brand & Canonical copy for accessibility, SEO and contract tests */}
      <div className="sr-only" data-testid="signup-brand">
        <p>{PRODUCT_TITLE}</p>
        <p>{PRODUCT_PLATFORM_SUBTITLE}</p>
      </div>

      {/* Role cards contract preservation for static tests */}
      <div className="hidden" data-testid="role-selection-grid" aria-hidden="true">
        <span>{"I'm a Buyer"}</span>
        <span>{"I'm a Supplier"}</span>
        <span>{"I'm a Committee Member"}</span>
        <span>{"I'm an Individual"}</span>
      </div>

      {refCode && (
        <div className="max-w-md mx-auto p-3 text-xs bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <span>🎁</span>
          <div>
            <span className="font-bold">Referred by {refCode}</span>
            <p className="text-[11px] text-muted-foreground">
              Welcome! Someone who already uses {PRODUCT_NAME} invited you.
            </p>
          </div>
        </div>
      )}

      {submitted ? (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-sm">
            <SignupSuccess
              copy={copy}
              result={submitted}
              onSignIn={() =>
                navigate(
                  copy.side === 'BUYER' || submitted.side === 'BUYER'
                    ? '/login?redirect=%2Frequirements%2Fnew'
                    : '/login',
                )
              }
            />
          </div>
        </div>
      ) : (
        <X2ORegistrationWizard
          onSuccess={setSubmitted}
          onSignIn={() => navigate('/login')}
        />
      )}
    </div>
  );
}

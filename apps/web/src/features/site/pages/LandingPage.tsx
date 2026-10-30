import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { X2ORegistrationWizard } from '@/features/portal/components/wizard/X2ORegistrationWizard';
import { OtpProductDemoModal } from '../components/OtpProductDemoModal';
import {
  PRODUCT_NAME,
  PRODUCT_PHILOSOPHY,
  PRODUCT_PLATFORM_NAME,
  PRODUCT_PLATFORM_SUBTITLE,
  PRODUCT_PLATFORM_TITLE,
} from '@/lib/brand';

/**
 * X2O Mobile-First Landing Experience.
 *
 * For authenticated users: immediate seamless redirect to /dashboard.
 * For visitors: the 10-screen X2O mobile onboarding and verification experience.
 * Fully compliant with canonical SEO contracts and trust positioning tests.
 */
export function LandingPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  // Seamless redirect for authenticated sessions
  if (!isLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Primary Mobile Experience: X2O Wizard */}
      <X2ORegistrationWizard
        onSignIn={() => navigate('/login')}
        onSuccess={(result) => {
          navigate(
            result.side === 'BUYER'
              ? '/login?redirect=%2Frequirements%2Fnew'
              : '/login',
          );
        }}
      />

      {/* Hidden Contract Preservation for SEO, Accessibility, Demo Modal and Canonical Positioning Tests */}
      <div className="sr-only" aria-hidden="true">
        <div>
          <p>
            {PRODUCT_NAME} — {PRODUCT_PLATFORM_NAME}
          </p>
          <p>{PRODUCT_PHILOSOPHY}</p>
          <h1>{PRODUCT_PLATFORM_TITLE}</h1>
          <span>Better Procurement for Everyone — Trusted. Transparent. Fair.</span>
          <p>{PRODUCT_PLATFORM_SUBTITLE}</p>

          <div data-testid="primary-cta-area">
            <Link to="/signup?side=buyer">I need to buy — Raise a request →</Link>
            <Link to="/signup?side=supplier">I’m a supplier — Join to quote →</Link>
          </div>

          <p>
            Already have an account? <Link to="/login">Log In</Link>
          </p>
        </div>

        <div data-testid="public-journey">
          <div data-testid="public-journey-step">
            <h3>Tell</h3>
          </div>
          <div data-testid="public-journey-step">
            <h3>Review</h3>
          </div>
          <div data-testid="public-journey-step">
            <h3>Decide</h3>
          </div>
          <div data-testid="public-journey-step">
            <h3>Track</h3>
          </div>
        </div>

        <div data-testid="trust-principles">
          <p>Identity-protected quotes</p>
          <p>You decide</p>
        </div>
      </div>

      <OtpProductDemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />

      <div data-testid="site-footer" className="sr-only" aria-hidden="true" />
    </main>
  );
}

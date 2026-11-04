import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import {
  PRODUCT_NAME,
  PRODUCT_PHILOSOPHY,
  PRODUCT_PLATFORM_NAME,
  PRODUCT_PLATFORM_SUBTITLE,
  PRODUCT_PLATFORM_TITLE,
  PRODUCT_TITLE,
} from '@/lib/brand';
import { SiteLayout } from '../components/SiteLayout';
import { PublicJourney, TrustPrinciples } from '../components/PublicJourney';
import { OtpProductDemoModal } from '../components/OtpProductDemoModal';

/**
 * X2O Public Landing & Homepage.
 *
 * For authenticated users: immediate seamless redirect to /dashboard.
 * For visitors: public landing page with canonical Hero, Public Journey,
 * Trust Principles and interactive walkthrough modal.
 */
export function LandingPage() {
  const { user, isLoading } = useAuth();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  // Seamless redirect for authenticated sessions
  if (!isLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <SiteLayout>
      <div className="overflow-x-hidden max-w-full space-y-12 sm:space-y-16 pb-12">
        <HeroSection onOpenDemo={() => setIsDemoModalOpen(true)} />
        <PublicJourney />
        <TrustPrinciples />
      </div>

      <OtpProductDemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </SiteLayout>
  );
}

function HeroSection({ onOpenDemo }: { onOpenDemo: () => void }) {
  return (
    <section className="relative pt-6 pb-4 sm:pt-10 sm:pb-8 border-b bg-gradient-to-b from-muted/40 via-background to-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto">
          {/* Brand & Badge Banner */}
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-primary/25 bg-primary/10 text-primary text-[11px] sm:text-xs font-bold uppercase tracking-wider shadow-2xs">
              <span>✨</span>
              <span>{PRODUCT_NAME} — {PRODUCT_PLATFORM_NAME}</span>
            </div>
            <p className="text-xs sm:text-sm font-semibold tracking-wide text-foreground/80 max-w-2xl mx-auto">
              {PRODUCT_PHILOSOPHY}
            </p>
          </div>

          {/* Hero Title: Anything To Order */}
          <h1 className="mt-4 text-3xl sm:text-5xl md:text-6xl font-black leading-[1.1] tracking-tight text-foreground">
            {PRODUCT_PLATFORM_TITLE}
          </h1>

          {/* Hero Subtitle */}
          <p className="mt-4 text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto font-medium">
            {PRODUCT_PLATFORM_SUBTITLE}
          </p>

          {/* Primary CTA Area */}
          <div
            className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3"
            data-testid="primary-cta-area"
          >
            <Link
              to="/signup?side=buyer"
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:bg-primary/90 transition min-h-[44px]"
            >
              I need to buy — Raise a request →
            </Link>
            <Link
              to="/signup?side=supplier"
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold text-sm shadow-2xs transition min-h-[44px]"
            >
              I’m a supplier — Join to quote →
            </Link>
          </div>

          {/* Interactive Walkthrough Button */}
          <div className="mt-4 flex items-center justify-center">
            <button
              type="button"
              onClick={onOpenDemo}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 text-xs font-bold text-primary transition shadow-2xs cursor-pointer min-h-[40px]"
              data-testid="interactive-product-walkthrough-button"
            >
              <span>✨</span>
              <span>Interactive Walkthrough: Tell, Review, Decide & Track in one place</span>
              <span>→</span>
            </button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-bold text-primary hover:underline">
              Log In
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

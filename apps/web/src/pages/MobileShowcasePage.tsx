import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MobileScreensShowcase } from '@/components/mobile-showcase/MobileScreensShowcase';
import { MobileMultiDeviceGallery } from '@/components/mobile-showcase/MobileMultiDeviceGallery';
import { SiteLayout } from '@/features/site';

export function MobileShowcasePage() {
  const [viewMode, setViewMode] = useState<'interactive' | 'gallery'>('interactive');

  return (
    <SiteLayout>
      <div className="bg-background min-h-screen">
        {/* Showcase Top Hero Header */}
        <section className="bg-gradient-to-b from-primary/10 via-background to-muted/20 border-b py-10 sm:py-14 px-4 text-center">
          <div className="max-w-4xl mx-auto space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
              <span>📱</span> OTP Mobile-First Experience
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-foreground tracking-tight">
              B2B Sourcing Engineered for Indian Smartphones
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Experience the complete 6-stage procurement lifecycle inside realistic mobile device viewports. No dense desktop tables—only 1-tap thumb interactions, voice dictation, and WhatsApp-native workflows.
            </p>

            {/* View Mode Switcher */}
            <div className="pt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('interactive')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-2xs ${
                  viewMode === 'interactive'
                    ? 'bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/40'
                    : 'bg-card text-muted-foreground border hover:bg-muted'
                }`}
              >
                🎮 Interactive Screen Simulator
              </button>
              <button
                type="button"
                onClick={() => setViewMode('gallery')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-2xs ${
                  viewMode === 'gallery'
                    ? 'bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/40'
                    : 'bg-card text-muted-foreground border hover:bg-muted'
                }`}
              >
                🖼️ Multi-Device Side-by-Side Gallery
              </button>
            </div>
          </div>
        </section>

        {/* Dynamic Display based on Switcher */}
        {viewMode === 'interactive' ? (
          <div className="py-2">
            <MobileScreensShowcase />
          </div>
        ) : (
          <div className="py-2">
            <MobileMultiDeviceGallery />
          </div>
        )}

        {/* Floating Call to Action */}
        <section className="py-12 px-4 text-center border-t bg-card">
          <div className="max-w-xl mx-auto space-y-4">
            <h3 className="text-xl sm:text-2xl font-bold text-foreground">
              Ready to test on your own phone?
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Sign in with a demo persona or create your first requirement in 10 seconds.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/login"
                className="rounded-xl bg-primary px-6 py-2.5 text-xs sm:text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition"
              >
                Launch Demo as Buyer →
              </Link>
              <Link
                to="/requirements/new"
                className="rounded-xl border bg-card px-6 py-2.5 text-xs sm:text-sm font-bold text-foreground hover:bg-muted transition"
              >
                Create Requirement →
              </Link>
            </div>
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}

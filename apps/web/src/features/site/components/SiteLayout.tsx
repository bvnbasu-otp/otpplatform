import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PLATFORM_DISCLAIMER_LINES, PRODUCT_FULL_NAME, PRODUCT_NAME } from '@/lib/brand';
import { SiteHeader } from './SiteHeader';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { MobileSimulatorFrame } from '@/components/layout/MobileSimulatorFrame';

function useArrivalScroll() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    const frame = requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    });

    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);
}

export function SiteLayout({ children }: { children: ReactNode }) {
  useArrivalScroll();
  const [isUtilityDrawerOpen, setIsUtilityDrawerOpen] = useState(false);

  return (
    <MobileSimulatorFrame>
      <div className="h-full w-full flex flex-col bg-background overflow-hidden relative">
        <SiteHeader />
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex-1">
            {children}
          </div>

          {/* Minimal 5-item Public Footer */}
          <footer className="mt-auto border-t bg-card/60 backdrop-blur-xs py-6 px-4" data-testid="site-footer">
            <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
              {/* Brand & Copyright */}
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-foreground">{PRODUCT_NAME}</span>
                <span>·</span>
                <span>© {new Date().getFullYear()} All rights reserved.</span>
              </div>

              {/* Strict 5-Item Navigation Footer Links */}
              <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-semibold" aria-label="Footer Navigation">
                <Link to="/" className="hover:text-foreground transition">Home</Link>
                <Link to="/pricing" className="hover:text-foreground transition">Pricing</Link>
                <Link to="/signup" className="text-primary hover:underline font-bold">+ Get Started</Link>
                <Link to="/about-us" className="hover:text-foreground transition">About Us</Link>
                <Link to="/faqs" className="hover:text-foreground transition">FAQs</Link>
              </nav>

              {/* Legal Links & Drawer Trigger */}
              <div className="flex items-center gap-3">
                <Link to="/legal/terms" className="hover:text-foreground transition">Terms</Link>
                <Link to="/legal/privacy" className="hover:text-foreground transition">Privacy</Link>
                <button
                  type="button"
                  onClick={() => setIsUtilityDrawerOpen(true)}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Governance Notice 🛡️
                </button>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-border/40 text-[10px] text-muted-foreground/80 text-center max-w-3xl mx-auto" data-testid="platform-disclaimer">
              {PLATFORM_DISCLAIMER_LINES.join(' ')}
            </div>
          </footer>
        </main>

        {/* Mobile Fixed Bottom Navigation Bar */}
        <MobileBottomNav />

        {/* Quick Utility Drawer / Slide-over Modal for Legal & Support */}
        {isUtilityDrawerOpen && (
          <div className="fixed sm:absolute inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in">
            <div className="w-full max-w-md bg-card h-full shadow-2xl border-l flex flex-col p-5 overflow-y-auto animate-in slide-in-from-right">
              <div className="flex items-center justify-between pb-3 border-b">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛡️</span>
                  <h2 className="text-sm font-bold text-foreground">Platform Legal &amp; Governance Notice</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUtilityDrawerOpen(false)}
                  className="rounded-md border p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition text-xs"
                >
                  ✕ Close
                </button>
              </div>

              <div className="mt-4 space-y-4 text-xs flex-1 text-muted-foreground leading-relaxed">
                <div>
                  <h3 className="font-bold text-foreground mb-1 text-xs">{PRODUCT_NAME} ({PRODUCT_FULL_NAME})</h3>
                  <p>
                    Identity-protected competitive sourcing for anyone who has to show how a purchasing decision was reached — from a single requirement to governed enterprise procurement.
                  </p>
                </div>

                <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
                  <p className="font-bold text-foreground text-xs">Direct Settlement Model</p>
                  {PLATFORM_DISCLAIMER_LINES.map((line, idx) => (
                    <p key={idx} className="text-[11px]">{line}</p>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <p className="font-bold text-foreground text-xs">Quick Utility Links</p>
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                    <Link to="/pricing" onClick={() => setIsUtilityDrawerOpen(false)} className="rounded border bg-card p-2 hover:bg-muted transition text-center text-primary">
                      💰 Pricing Plans
                    </Link>
                    <Link to="/faqs" onClick={() => setIsUtilityDrawerOpen(false)} className="rounded border bg-card p-2 hover:bg-muted transition text-center text-primary">
                      ❓ FAQs
                    </Link>
                    <Link to="/legal/terms" onClick={() => setIsUtilityDrawerOpen(false)} className="rounded border bg-card p-2 hover:bg-muted transition text-center">
                      📄 Terms of Use
                    </Link>
                    <Link to="/legal/privacy" onClick={() => setIsUtilityDrawerOpen(false)} className="rounded border bg-card p-2 hover:bg-muted transition text-center">
                      🔒 Privacy Policy
                    </Link>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t text-[11px] text-muted-foreground text-center">
                © {new Date().getFullYear()} {PRODUCT_NAME}. All rights reserved.
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileSimulatorFrame>
  );
}

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PLATFORM_DISCLAIMER_LINES, PRODUCT_NAME, PRODUCT_FULL_NAME } from '@/lib/brand';

export function SiteFooter() {
  const [isUtilityDrawerOpen, setIsUtilityDrawerOpen] = useState(false);

  return (
    <>
      <footer className="mt-auto border-t bg-card/60 backdrop-blur-xs py-5 px-3 sm:px-4" data-testid="site-footer">
        {/* 5-Item Trust Ribbon */}
        <div className="mx-auto max-w-5xl mb-4 pb-4 border-b border-border/50">
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:flex sm:flex-wrap items-center justify-center gap-1.5 sm:gap-2.5 text-[10px] sm:text-xs font-semibold text-muted-foreground">
            <span className="inline-flex items-center justify-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-center truncate">
              🔒 Identity Protected
            </span>
            <span className="inline-flex items-center justify-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-center truncate">
              ⚖️ Fair Competition
            </span>
            <span className="inline-flex items-center justify-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-center truncate">
              📊 Comparable Quotes
            </span>
            <span className="inline-flex items-center justify-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-center truncate">
              🗳️ Transparent Decision
            </span>
            <span className="col-span-2 xs:col-span-1 sm:col-span-1 inline-flex items-center justify-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-center truncate">
              📜 Immutable Audit Trail
            </span>
          </div>
        </div>

        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 text-xs text-muted-foreground">
          {/* Brand & Copyright */}
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1 sm:gap-2 text-center sm:text-left">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-extrabold text-foreground">{PRODUCT_NAME}</span>
              <span>·</span>
              <span>© {new Date().getFullYear()} All rights reserved.</span>
            </div>
            <span className="hidden sm:inline">·</span>
            <span className="text-[11px] text-muted-foreground/80">Last updated: 26 September 2026</span>
          </div>

          {/* Strict 5-Item Navigation Footer Links */}
          <nav className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs font-semibold" aria-label="Footer Navigation">
            <Link to="/" className="hover:text-foreground transition min-h-[32px] sm:min-h-0 inline-flex items-center">Home</Link>
            <Link to="/pricing" className="hover:text-foreground transition min-h-[32px] sm:min-h-0 inline-flex items-center">Pricing</Link>
            <Link to="/signup" className="text-primary hover:underline font-bold min-h-[32px] sm:min-h-0 inline-flex items-center">+ Get Started</Link>
            <Link to="/about-us" className="hover:text-foreground transition min-h-[32px] sm:min-h-0 inline-flex items-center">About Us</Link>
            <Link to="/faqs" className="hover:text-foreground transition min-h-[32px] sm:min-h-0 inline-flex items-center">FAQs</Link>
          </nav>

          {/* Legal Links & Drawer Trigger */}
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
            <Link to="/legal/terms" className="hover:text-foreground transition min-h-[32px] sm:min-h-0 inline-flex items-center">Terms</Link>
            <Link to="/legal/privacy" className="hover:text-foreground transition min-h-[32px] sm:min-h-0 inline-flex items-center">Privacy</Link>
            <button
              type="button"
              onClick={() => setIsUtilityDrawerOpen(true)}
              className="text-[11px] text-primary hover:underline font-medium min-h-[32px] sm:min-h-0 inline-flex items-center cursor-pointer"
            >
              Governance Notice 🛡️
            </button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border/40 text-[10px] text-muted-foreground/80 text-center max-w-3xl mx-auto leading-relaxed px-1" data-testid="platform-disclaimer">
          {PLATFORM_DISCLAIMER_LINES.join(' ')}
        </div>
      </footer>

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
                className="rounded-md border p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition text-xs cursor-pointer min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
              >
                ✕ Close
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs flex-1 text-muted-foreground leading-relaxed">
              <div>
                <h3 className="font-bold text-foreground mb-1 text-xs">{PRODUCT_NAME} ({PRODUCT_FULL_NAME})</h3>
                <p>
                  Identity-protected competitive sourcing for anyone who has to show how a purchasing decision was reached — from personal requirements to governed community and business procurement.
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
                    📖 FAQs
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
    </>
  );
}

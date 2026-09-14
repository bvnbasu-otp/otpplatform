import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { OtpLogo } from '@/components/ui/OtpLogo';
import { DemoPersonaSwitcher } from '@/components/demo/DemoPersonaSwitcher';

interface SiteLink {
  label: string;
  to: string;
}

const PRIMARY_LINKS: SiteLink[] = [
  { label: '📱 Mobile Showcase', to: '/showcase' },
  { label: 'How it works', to: '/#how-it-works' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'FAQs', to: '/faqs' },
  { label: 'About us', to: '/about-us' },
];

export function SiteHeader() {
  const { user } = useAuth();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAccountPopoverOpen, setIsAccountPopoverOpen] = useState(false);
  const accountPopoverRef = useRef<HTMLDivElement>(null);

  // Close menus on navigation
  useEffect(() => {
    setIsMenuOpen(false);
    setIsAccountPopoverOpen(false);
  }, [location.pathname, location.hash]);

  // Handle click outside account popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        accountPopoverRef.current &&
        !accountPopoverRef.current.contains(event.target as Node)
      ) {
        setIsAccountPopoverOpen(false);
      }
    }
    if (isAccountPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isAccountPopoverOpen]);

  const userInitials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'U';

  return (
    <header className="shrink-0 z-40 border-b bg-card max-h-[48px] h-12">
      <div className="mx-auto flex w-full h-full items-center justify-between gap-2 px-3">
        {/* Brand Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/"
            className="flex items-center gap-1.5 hover:opacity-90 transition"
            onClick={() => {
              setIsMenuOpen(false);
              setIsAccountPopoverOpen(false);
            }}
          >
            <OtpLogo size={24} />
          </Link>
        </div>

        {/* Right Action Cluster: Clean & Minimal (Height ≤ 48px) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {user ? (
            <div className="flex items-center gap-1.5">
              <Link
                to="/dashboard"
                className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
              >
                Dashboard →
              </Link>

              {/* Profile Avatar Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsAccountPopoverOpen((prev) => !prev);
                    setIsMenuOpen(false);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/20 transition shrink-0"
                  aria-label="Account options"
                >
                  {userInitials}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {location.pathname !== '/login' && (
                <Link
                  to="/login"
                  className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  data-testid="header-log-in"
                >
                  Log In
                </Link>
              )}
              {location.pathname !== '/signup' && (
                <Link
                  to="/signup"
                  className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition shadow-2xs"
                  data-testid="header-register"
                >
                  Register
                </Link>
              )}
            </div>
          )}

          {/* Mobile Hamburger Menu Button */}
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={isMenuOpen}
            onClick={() => {
              setIsMenuOpen((prev) => !prev);
              setIsAccountPopoverOpen(false);
            }}
            className={`rounded-lg border p-1.5 transition ${
              isMenuOpen ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted'
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
              {isMenuOpen ? (
                <path
                  d="M3 3l10 10M13 3L3 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M2 4h12M2 8h12M2 12h12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Account Options Popover */}
      {isAccountPopoverOpen && user && (
        <div
          ref={accountPopoverRef}
          className="fixed sm:absolute right-3 top-[50px] z-[1050] w-64 max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-60px)] overflow-y-auto rounded-xl border bg-card p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-xs"
        >
          <div className="flex items-center gap-2.5 pb-2.5 border-b">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xs shrink-0">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground truncate">{user.email}</p>
              <p className="text-[10px] text-muted-foreground font-medium">Signed In Account</p>
            </div>
          </div>

          <div className="mt-2.5 space-y-1.5">
            <Link
              to="/dashboard"
              onClick={() => setIsAccountPopoverOpen(false)}
              className="flex items-center justify-between rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition text-xs"
            >
              <span>Go to Dashboard</span>
              <span>→</span>
            </Link>

            <button
              type="button"
              onClick={async () => {
                setIsAccountPopoverOpen(false);
                await supabase.auth.signOut();
                window.location.href = '/login';
              }}
              className="w-full flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 font-semibold text-destructive hover:bg-destructive/10 transition text-xs"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Slide-Out Overlay Drawer (Z-Index: 1000) */}
      {isMenuOpen && (
        <div className="fixed sm:absolute inset-0 top-[48px] z-[1000]">
          {/* Backdrop with Click-to-Close */}
          <div
            className="fixed sm:absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Overlay Navigation Container */}
          <nav
            aria-label="Mobile Navigation"
            className="relative border-b bg-card shadow-2xl animate-in slide-in-from-top-2 duration-150 max-h-[calc(100%-48px)] overflow-y-auto"
          >
            <div className="mx-auto w-full px-4 py-3 space-y-3 text-xs">
              {/* Quick Persona switcher inside drawer */}
              <div className="flex items-center justify-between pb-2 border-b">
                <DemoPersonaSwitcher />
              </div>

              {user ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xs shrink-0">
                      {userInitials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block font-bold text-foreground truncate">{user.email}</span>
                      <span className="text-[10px] text-primary font-medium">Logged in</span>
                    </div>
                  </div>
                  <Link
                    to="/dashboard"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center justify-between rounded-lg bg-primary px-3 py-2 font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition text-xs"
                  >
                    <span>Go to Dashboard</span>
                    <span>→</span>
                  </Link>
                </div>
              ) : (
                <div className="pb-1">
                  <Link
                    to="/requirements/new"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-action px-4 py-2.5 font-bold text-action-foreground shadow-2xs hover:bg-action-hover transition text-xs"
                    data-testid="mobile-create-requirement"
                  >
                    <span>✨</span>
                    <span>Create requirement</span>
                  </Link>
                </div>
              )}

              {/* Primary Navigation Links */}
              <div className="space-y-1">
                <NavLink
                  to="/"
                  end
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center rounded-lg px-3 py-2 transition font-medium ${
                      isActive ? 'bg-muted font-bold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`
                  }
                >
                  Home
                </NavLink>
                {PRIMARY_LINKS.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setIsMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center rounded-lg px-3 py-2 transition font-medium ${
                        isActive ? 'bg-muted font-bold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
                {user && (
                  <NavLink
                    to="/dashboard"
                    onClick={() => setIsMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center rounded-lg px-3 py-2 transition font-medium ${
                        isActive ? 'bg-muted font-bold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`
                    }
                  >
                    Workspace Dashboard
                  </NavLink>
                )}
              </div>

              {/* Bottom Auth Section */}
              {!user ? (
                <div className="pt-2 border-t flex items-center gap-2">
                  <Link
                    to="/login"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex-1 text-center rounded-lg border bg-card px-3 py-2 font-semibold text-foreground hover:bg-muted transition text-xs shadow-2xs"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex-1 text-center rounded-lg bg-primary text-primary-foreground font-bold px-3 py-2 transition text-xs shadow-2xs hover:bg-primary/90"
                  >
                    Register
                  </Link>
                </div>
              ) : (
                <div className="pt-2 border-t">
                  <button
                    type="button"
                    onClick={async () => {
                      setIsMenuOpen(false);
                      await supabase.auth.signOut();
                      window.location.href = '/login';
                    }}
                    className="w-full flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 font-semibold text-destructive hover:bg-destructive/10 transition text-xs"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

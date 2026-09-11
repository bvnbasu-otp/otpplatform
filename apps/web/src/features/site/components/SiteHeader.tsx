import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { OtpLogo } from '@/components/ui/OtpLogo';
import { ThemeToggle } from '@/features/theme';

interface SiteLink {
  label: string;
  to: string;
}

const PRIMARY_LINKS: SiteLink[] = [
  { label: 'How it works', to: '/#how-it-works' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'FAQs', to: '/faqs' },
  { label: 'About us', to: '/about-us' },
];

const INACTIVE = 'text-muted-foreground hover:bg-muted/60 hover:text-foreground';

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
    <header className="shrink-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 max-h-[52px] h-[52px]">
      <div className="mx-auto flex max-w-7xl h-full items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4">
        {/* Brand Logo & Desktop Navigation */}
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-90 transition"
            onClick={() => {
              setIsMenuOpen(false);
              setIsAccountPopoverOpen(false);
            }}
          >
            <OtpLogo size={28} />
          </Link>

          {/* Full Top-Level Desktop Navigation Bar */}
          <nav aria-label="Site" className="hidden md:block">
            <ul className="flex items-center gap-1 text-xs font-medium">
              <li>
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `rounded-md px-2.5 py-1.5 transition ${isActive ? 'bg-muted font-bold text-foreground' : INACTIVE}`
                  }
                >
                  Home
                </NavLink>
              </li>
              {PRIMARY_LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    className={({ isActive }) =>
                      `rounded-md px-2.5 py-1.5 transition ${isActive ? 'bg-muted font-bold text-foreground' : INACTIVE}`
                    }
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
              {user && (
                <li>
                  <NavLink
                    to="/dashboard"
                    className={({ isActive }) =>
                      `rounded-md px-2.5 py-1.5 transition ${isActive ? 'bg-muted font-bold text-foreground' : INACTIVE}`
                    }
                  >
                    Dashboard
                  </NavLink>
                </li>
              )}
            </ul>
          </nav>
        </div>

        {/* Right Action Cluster (User Avatar / Profile Chip, Theme, Auth CTAs, Hamburger) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ThemeToggle variant="menu" />

          {user ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Desktop User Chip & Dashboard CTA */}
              <div className="hidden sm:flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[8px] font-bold">
                    {userInitials}
                  </span>
                  <span className="truncate max-w-[130px] font-mono">{user.email}</span>
                </span>
                <Link
                  to="/dashboard"
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
                >
                  Dashboard →
                </Link>
              </div>

              {/* Mobile Compact Profile Avatar Button */}
              <div className="relative sm:hidden">
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
              {/* Desktop Auth Links */}
              <div className="hidden sm:flex items-center gap-1.5">
                <Link
                  to="/login"
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  data-testid="header-log-in"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="rounded-md border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs"
                  data-testid="header-register"
                >
                  Register
                </Link>
                <Link
                  to="/requirements/new"
                  className="whitespace-nowrap rounded-md bg-action px-3 py-1.5 text-xs font-bold text-action-foreground hover:bg-action-hover transition shadow-2xs"
                  data-testid="header-create-requirement"
                >
                  + Create requirement
                </Link>
              </div>

              {/* Mobile Compact Create Button */}
              <Link
                to="/requirements/new"
                className="sm:hidden whitespace-nowrap rounded-md bg-action px-2.5 py-1 text-[11px] font-bold text-action-foreground hover:bg-action-hover transition shadow-2xs"
              >
                + Create
              </Link>
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
            className={`rounded-md border p-1.5 md:hidden transition ${
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

      {/* Mobile Account Options Popover (Triggered from Avatar) */}
      {isAccountPopoverOpen && user && (
        <div
          ref={accountPopoverRef}
          className="fixed right-3 top-[54px] z-[1050] w-64 max-w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-60px)] overflow-y-auto rounded-xl border bg-card p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-xs sm:hidden"
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

      {/* Slide-Out Overlay Drawer (Z-Index: 1000 Floating) */}
      {isMenuOpen && (
        <div className="fixed inset-0 top-[52px] z-[1000] md:hidden">
          {/* Backdrop with Click-to-Close */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Overlay Navigation Container */}
          <nav
            aria-label="Mobile Navigation"
            className="relative border-b bg-card shadow-2xl animate-in slide-in-from-top-2 duration-150 max-h-[calc(100dvh-52px)] overflow-y-auto"
          >
            <div className="mx-auto max-w-7xl px-4 py-3 space-y-3 text-xs">
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

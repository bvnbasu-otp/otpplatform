import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { useRoleContext } from '@/features/roles';
import { supabase } from '@/lib/supabase';
import { OtpLogo } from '@/components/ui/OtpLogo';
import { RoleModeToggle } from '@/components/ui/RoleModeToggle';
import { SupplierCapabilityModal } from '@/features/supplier';
import { SupportHelpButtonModal } from '@/features/support';
import { ThemeBottomSheet } from '@/features/theme';

export function SiteHeader() {
  const { user } = useAuth();
  const { context } = useRoleContext();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAccountPopoverOpen, setIsAccountPopoverOpen] = useState(false);
  const [isCapabilityModalOpen, setIsCapabilityModalOpen] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const accountPopoverRef = useRef<HTMLDivElement>(null);

  const isSupplier =
    location.pathname.startsWith('/supplier') ||
    location.search.includes('side=supplier') ||
    context.side === 'SUPPLIER';

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
    <header className="shrink-0 z-40 border-b bg-card max-h-[48px] h-12 select-none w-full max-w-full overflow-x-hidden">
      <div className="mx-auto flex w-full h-full items-center justify-between gap-2 px-3 max-w-7xl">
        {/* Left: Brand Logo & Desktop Nav Links */}
        <div className="flex items-center gap-3 shrink-0">
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

          {/* Desktop Navigation Links (Strictly Home, Pricing, +, About Us, FAQs) */}
          <nav className="hidden md:flex items-center gap-1 text-xs" aria-label="Desktop Navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-2.5 py-1 rounded-lg font-semibold transition ${
                  isActive ? 'bg-muted text-foreground font-bold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/pricing"
              className={({ isActive }) =>
                `px-2.5 py-1 rounded-lg font-semibold transition ${
                  isActive ? 'bg-muted text-foreground font-bold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`
              }
            >
              Pricing
            </NavLink>

            {/* Context-Aware '+' Global Action Button for Desktop */}
            {isSupplier ? (
              <button
                type="button"
                onClick={() => setIsCapabilityModalOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-500/20 transition cursor-pointer"
                title="Maximize Business Reach — Update Capabilities"
                aria-label="Maximize Business Reach — Update Capabilities"
                data-testid="header-supplier-capabilities-btn"
              >
                <span>+</span>
                <span>Add Capabilities</span>
              </button>
            ) : (
              <NavLink
                to="/requirements/new"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-bold hover:bg-primary/20 transition"
                title="Post a new requirement / broadcast RFQ"
                aria-label="Post a new requirement / broadcast RFQ"
                data-testid="header-buyer-create-requirement-btn"
              >
                <span>+</span>
                <span>Post Need</span>
              </NavLink>
            )}

            <NavLink
              to="/about-us"
              className={({ isActive }) =>
                `px-2.5 py-1 rounded-lg font-semibold transition ${
                  isActive ? 'bg-muted text-foreground font-bold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`
              }
            >
              About Us
            </NavLink>
            <NavLink
              to="/faqs"
              className={({ isActive }) =>
                `px-2.5 py-1 rounded-lg font-semibold transition ${
                  isActive ? 'bg-muted text-foreground font-bold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`
              }
            >
              FAQs
            </NavLink>
          </nav>
        </div>

        {/* Center/Right: Role Switcher Toggle */}
        <div className="hidden sm:flex items-center">
          <RoleModeToggle size="sm" />
        </div>

        {/* Right Action Cluster: Canonical Sequence [Profile / Theme Trigger] → [Help & Support (?)] */}
        <div className="flex items-center gap-1.5 shrink-0">
          {user ? (
            <div className="flex items-center gap-1.5">
              <Link
                to="/dashboard"
                className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
              >
                Dashboard →
              </Link>

              {/* Profile Avatar Trigger Button */}
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

              {/* Help & Support (?) placed after Profile trigger */}
              <SupportHelpButtonModal />
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
              {/* Universal Help & Support modal */}
              <SupportHelpButtonModal />
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

            {/* Theme Settings Trigger from Profile Popover */}
            <button
              type="button"
              onClick={() => {
                setIsAccountPopoverOpen(false);
                setShowThemeSheet(true);
              }}
              data-testid="site-header-theme-trigger"
              className="w-full flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-1.5 font-semibold text-foreground hover:bg-muted transition text-xs"
            >
              <span className="flex items-center gap-1.5">
                <span>🎨</span> Appearance Theme
              </span>
              <span>➔</span>
            </button>

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
              {/* Role mode switcher inside drawer */}
              <div className="flex items-center justify-between pb-2 border-b">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Mode Switcher</span>
                <RoleModeToggle size="sm" />
              </div>

              {/* Context-aware action button in mobile drawer */}
              {isSupplier ? (
                <div className="pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsCapabilityModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2.5 font-bold text-white shadow-2xs hover:bg-purple-700 transition text-xs cursor-pointer"
                    title="Maximize Business Reach — Update Capabilities"
                    data-testid="mobile-supplier-capabilities-btn"
                  >
                    <span>+</span>
                    <span>Add Business Capabilities</span>
                  </button>
                </div>
              ) : !user ? (
                <div className="pb-1">
                  <Link
                    to="/requirements/new"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition text-xs"
                    title="Post a new requirement / broadcast RFQ"
                    data-testid="mobile-create-requirement"
                  >
                    <span>+</span>
                    <span>Create Requirement</span>
                  </Link>
                </div>
              ) : null}

              {user && (
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
              )}

              {/* Primary Navigation Links: Home, Pricing, About Us, FAQs */}
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
                <NavLink
                  to="/pricing"
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center rounded-lg px-3 py-2 transition font-medium ${
                      isActive ? 'bg-muted font-bold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`
                  }
                >
                  Pricing
                </NavLink>
                <NavLink
                  to="/about-us"
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center rounded-lg px-3 py-2 transition font-medium ${
                      isActive ? 'bg-muted font-bold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`
                  }
                >
                  About Us
                </NavLink>
                <NavLink
                  to="/faqs"
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center rounded-lg px-3 py-2 transition font-medium ${
                      isActive ? 'bg-muted font-bold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`
                  }
                >
                  FAQs
                </NavLink>
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

              {/* Drawer Theme & Support Quick Actions */}
              <div className="pt-2 border-t flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setShowThemeSheet(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 font-semibold text-foreground hover:bg-muted transition text-xs shadow-2xs flex-1 justify-center"
                >
                  <span>🎨</span> Appearance
                </button>
                <div className="flex-1">
                  <SupportHelpButtonModal className="w-full" />
                </div>
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

      {/* Quick Capability Editor Modal for Suppliers */}
      <SupplierCapabilityModal
        open={isCapabilityModalOpen}
        onClose={() => setIsCapabilityModalOpen(false)}
      />

      {/* Theme Bottom Sheet Triggered from SiteHeader Profile Popover */}
      <ThemeBottomSheet
        isOpen={showThemeSheet}
        onClose={() => setShowThemeSheet(false)}
      />
    </header>
  );
}

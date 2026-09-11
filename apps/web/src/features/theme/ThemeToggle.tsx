import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from './ThemeProvider';
import type { ThemeMode, ColorTheme } from './types';

interface ThemeToggleProps {
  className?: string;
  variant?: 'segmented' | 'compact' | 'menu';
}

interface ColorOption {
  id: ColorTheme;
  name: string;
  description: string;
  bgClass: string;
  borderClass: string;
  previewColor: string;
}

const COLOR_OPTIONS: ColorOption[] = [
  {
    id: 'auto',
    name: 'Auto Sync',
    description: 'Follows active role (Buyer/Supplier/Admin)',
    bgClass: 'bg-gradient-to-r from-indigo-500 via-emerald-500 to-amber-500',
    borderClass: 'border-indigo-400',
    previewColor: '#6366f1',
  },
  {
    id: 'indigo',
    name: 'Indigo',
    description: 'Institutional & Governance (Buyer)',
    bgClass: 'bg-indigo-600',
    borderClass: 'border-indigo-500',
    previewColor: '#4f46e5',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Verified Trade & Commerce (Supplier)',
    bgClass: 'bg-emerald-600',
    borderClass: 'border-emerald-500',
    previewColor: '#059669',
  },
  {
    id: 'amber',
    name: 'Amber',
    description: 'Security & Operations (SuperAdmin)',
    bgClass: 'bg-amber-500',
    borderClass: 'border-amber-500',
    previewColor: '#d97706',
  },
  {
    id: 'blue',
    name: 'Ocean Blue',
    description: 'Enterprise Corporate Standard',
    bgClass: 'bg-sky-600',
    borderClass: 'border-sky-500',
    previewColor: '#0284c7',
  },
  {
    id: 'purple',
    name: 'Royal Purple',
    description: 'Executive Institutional',
    bgClass: 'bg-purple-600',
    borderClass: 'border-purple-500',
    previewColor: '#7c3aed',
  },
  {
    id: 'rose',
    name: 'Crimson Rose',
    description: 'High-Contrast Modern',
    bgClass: 'bg-rose-600',
    borderClass: 'border-rose-500',
    previewColor: '#e11d48',
  },
];

export function ThemeToggle({ className = '', variant = 'menu' }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme, persona, colorTheme, setColorTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click or escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // If purely segmented mode requested
  if (variant === 'segmented') {
    const modeOptions: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
      {
        mode: 'light',
        label: 'Light',
        icon: (
          <svg className="h-3.5 w-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
          </svg>
        ),
      },
      {
        mode: 'system',
        label: 'System',
        icon: (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        ),
      },
      {
        mode: 'dark',
        label: 'Dark',
        icon: (
          <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ),
      },
    ];

    return (
      <div
        role="radiogroup"
        aria-label="Theme selector"
        className={`inline-flex items-center rounded-lg border border-border bg-muted/60 p-0.5 shadow-xs dark:bg-muted/30 ${className}`}
      >
        {modeOptions.map((opt) => {
          const isActive = theme === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              role="radio"
              aria-checked={isActive}
              title={opt.label}
              onClick={() => setTheme(opt.mode)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.icon}
              <span className="capitalize">{opt.mode}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const autoPreviewColor = persona === 'admin' ? '#d97706' : persona === 'supplier' ? '#059669' : '#4f46e5';
  const activeColor = COLOR_OPTIONS.find((c) => c.id === colorTheme) || COLOR_OPTIONS[0];
  const activePreviewColor = colorTheme === 'auto' ? autoPreviewColor : (activeColor?.previewColor ?? '#4f46e5');

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        id="theme-appearance-menu-button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Appearance settings: select theme mode and color palette"
        title="Appearance: Click to select Dark/Light/System and Color Themes"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2 text-xs font-medium text-foreground shadow-xs transition hover:bg-muted hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {/* Mode Icon */}
        {theme === 'system' ? (
          <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        ) : resolvedTheme === 'dark' ? (
          <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
          </svg>
        )}

        {/* Color preview dot */}
        <span
          className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-border"
          style={{ backgroundColor: activePreviewColor }}
          aria-hidden="true"
        />

        <span className="hidden sm:inline font-medium capitalize text-muted-foreground">
          {theme}
        </span>

        {/* Dropdown chevron */}
        <svg
          className={`h-3 w-3 text-muted-foreground transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Appearance and theme customizer"
          className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-xl border border-border bg-card p-3.5 text-foreground shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 dark:shadow-black/50"
        >
          {/* Header */}
          <div className="mb-3 border-b border-border pb-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                🎨 Appearance & Theme
              </h3>
              <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
                {resolvedTheme.toUpperCase()}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Select dark/light mode and accent color palette.
            </p>
          </div>

          {/* Section 1: Mode Selector */}
          <div className="mb-3.5">
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Display Mode
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {[
                {
                  id: 'light' as ThemeMode,
                  label: 'Light',
                  icon: (
                    <svg className="h-3.5 w-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                    </svg>
                  ),
                },
                {
                  id: 'system' as ThemeMode,
                  label: 'System',
                  icon: (
                    <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                    </svg>
                  ),
                },
                {
                  id: 'dark' as ThemeMode,
                  label: 'Dark',
                  icon: (
                    <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  ),
                },
              ].map((item) => {
                const isActive = theme === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTheme(item.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${
                      isActive
                        ? 'bg-card font-semibold text-foreground shadow-xs ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-card/50 hover:text-foreground'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Color Palette Swatches */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">
                Accent Color Palette
              </label>
              {colorTheme !== 'auto' && (
                <button
                  type="button"
                  onClick={() => setColorTheme('auto')}
                  className="text-[10px] text-persona-brand hover:underline font-medium"
                >
                  Reset to Auto
                </button>
              )}
            </div>

            <div className="space-y-1">
              {COLOR_OPTIONS.map((opt) => {
                const isSelected = colorTheme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setColorTheme(opt.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                      isSelected
                        ? 'bg-persona-soft text-foreground font-medium ring-1 ring-persona-border'
                        : 'hover:bg-muted/70 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-border shrink-0 shadow-xs"
                        style={{ backgroundColor: opt.id === 'auto' ? autoPreviewColor : opt.previewColor }}
                      />
                      <div>
                        <span className={`block ${isSelected ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                          {opt.name}
                        </span>
                        <span className="block text-[10px] text-muted-foreground leading-tight">
                          {opt.description}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <svg className="h-4 w-4 text-persona-brand shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-3 border-t border-border pt-2 text-center text-[10px] text-muted-foreground">
            Changes apply instantly &amp; save to your browser.
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Floating Appearance Widget: A floating bottom-right action trigger
 * allowing immediate theme & color customizer access anywhere on the website.
 */
export function ThemeCustomizerFloating() {
  return (
    <div className="fixed bottom-4 right-4 z-40">
      <ThemeToggle variant="menu" />
    </div>
  );
}


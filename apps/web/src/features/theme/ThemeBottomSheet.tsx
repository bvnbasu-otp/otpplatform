import React from 'react';
import { useTheme } from './ThemeProvider';
import type { ThemeMode, ColorTheme } from './types';
import { BottomSheet } from '@/components/ui/BottomSheet';

export interface ThemeBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ColorOption {
  id: ColorTheme;
  name: string;
  description: string;
  previewColor: string;
}

const COLOR_OPTIONS: ColorOption[] = [
  {
    id: 'auto',
    name: 'Auto Sync',
    description: 'Follows active role (Buyer / Supplier / Admin)',
    previewColor: '#6366f1',
  },
  {
    id: 'indigo',
    name: 'Indigo',
    description: 'Institutional & Governance (Buyer)',
    previewColor: '#4f46e5',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Verified Trade & Commerce (Supplier)',
    previewColor: '#059669',
  },
  {
    id: 'amber',
    name: 'Amber',
    description: 'Security & Operations (SuperAdmin)',
    previewColor: '#d97706',
  },
  {
    id: 'blue',
    name: 'Ocean Blue',
    description: 'Enterprise Corporate Standard',
    previewColor: '#0284c7',
  },
  {
    id: 'purple',
    name: 'Royal Purple',
    description: 'Executive Institutional',
    previewColor: '#7c3aed',
  },
  {
    id: 'rose',
    name: 'Crimson Rose',
    description: 'High-Contrast Modern',
    previewColor: '#e11d48',
  },
];

const MODE_OPTIONS: { id: ThemeMode; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: 'light',
    label: 'Light',
    description: 'Clean high-contrast light surface',
    icon: (
      <svg className="h-5 w-5 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
    id: 'system',
    label: 'System',
    description: 'Follows operating system display mode',
    icon: (
      <svg className="h-5 w-5 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Low-light obsidian dark surface',
    icon: (
      <svg className="h-5 w-5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
];

export function ThemeBottomSheet({ isOpen, onClose }: ThemeBottomSheetProps) {
  const { theme, setTheme, resolvedTheme, persona, colorTheme, setColorTheme } = useTheme();

  const autoPreviewColor = persona === 'admin' ? '#d97706' : persona === 'supplier' ? '#059669' : '#4f46e5';

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="🎨 Appearance & Display Theme"
      subtitle={`Active mode: ${theme.toUpperCase()} (${resolvedTheme}) · Accent: ${colorTheme.toUpperCase()}`}
      maxHeight="max-h-[90vh]"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground truncate">
            ✓ Changes apply instantly &amp; save automatically
          </span>
          <button
            type="button"
            onClick={onClose}
            data-testid="theme-bottom-sheet-done"
            className="rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition active:scale-95 min-h-[44px] mobile-touch-target"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Section 1: Display Mode (Light / System / Dark) */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Display Mode
            </span>
            <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 font-bold text-foreground">
              {resolvedTheme.toUpperCase()} ACTIVE
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Display mode"
            className="grid grid-cols-3 gap-2"
          >
            {MODE_OPTIONS.map((opt) => {
              const isActive = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={`${opt.label} mode`}
                  data-testid={`theme-mode-btn-${opt.id}`}
                  onClick={() => setTheme(opt.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition min-h-[48px] mobile-touch-target text-center ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs ring-2 ring-primary/20'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div className="mb-1">{opt.icon}</div>
                  <span className="text-xs font-bold leading-tight">{opt.label}</span>
                  <span className="text-[9px] text-muted-foreground leading-none mt-0.5 hidden sm:block">
                    {opt.id === 'system' ? 'OS Auto' : opt.id === 'light' ? 'Day' : 'Night'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Accent Color Palette */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Accent Color Palette
              </span>
              <p className="text-[11px] text-muted-foreground">
                Brand highlight and interactive button accent
              </p>
            </div>
            {colorTheme !== 'auto' && (
              <button
                type="button"
                onClick={() => setColorTheme('auto')}
                data-testid="theme-reset-auto-btn"
                className="text-[11px] text-primary hover:underline font-bold rounded-lg px-2 py-1 min-h-[44px] mobile-touch-target inline-flex items-center"
              >
                Reset to Auto
              </button>
            )}
          </div>

          <div
            role="radiogroup"
            aria-label="Accent color palette"
            className="space-y-1.5"
          >
            {COLOR_OPTIONS.map((opt) => {
              const isSelected = colorTheme === opt.id;
              const swatchColor = opt.id === 'auto' ? autoPreviewColor : opt.previewColor;

              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${opt.name}: ${opt.description}`}
                  data-testid={`theme-color-btn-${opt.id}`}
                  onClick={() => setColorTheme(opt.id)}
                  className={`flex w-full items-center justify-between p-3 rounded-xl border text-left transition min-h-[48px] mobile-touch-target ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-foreground font-semibold ring-2 ring-primary/20 shadow-xs'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="inline-block h-5 w-5 rounded-full ring-2 ring-border shrink-0 shadow-xs"
                      style={{ backgroundColor: swatchColor }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground truncate">
                          {opt.name}
                        </span>
                        {opt.id === 'auto' && (
                          <span className="rounded-full bg-primary/10 text-primary text-[9px] font-extrabold px-1.5 py-0.2">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                        {opt.description}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 shadow-2xs ml-2">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}

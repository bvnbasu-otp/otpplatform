import React, { useState, useRef, useEffect } from 'react';
import { useLanguage, type SupportedLanguage } from '@/lib/i18n';

export interface LanguageSwitcherProps {
  className?: string;
  variant?: 'compact' | 'full';
  placement?: 'header' | 'menu';
}

export function LanguageSwitcher({
  className = '',
  variant = 'compact',
  placement = 'header',
}: LanguageSwitcherProps) {
  const { language, setLanguage, languages, currentMeta, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
    setIsOpen(false);
  };

  if (variant === 'full' || placement === 'menu') {
    return (
      <div className={`space-y-2 ${className}`} data-testid="language-switcher-full">
        <label className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
          🌐 {t('language.selectLanguage', 'Select Language')}
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {languages.map((lang) => {
            const isSelected = lang.code === language;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleSelect(lang.code)}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition min-h-[44px] mobile-touch-target border text-left cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-2xs'
                    : 'border-border/70 bg-card text-foreground hover:bg-muted/70'
                }`}
                aria-pressed={isSelected}
                data-testid={`lang-btn-${lang.code}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm shrink-0">{lang.flag}</span>
                  <span className="truncate">{lang.nativeName}</span>
                </div>
                {isSelected && <span className="text-primary font-bold text-xs shrink-0 ml-1">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`} data-testid="language-switcher">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${t('language.current', 'Language')}: ${currentMeta.nativeName}`}
        data-testid="language-switcher-trigger"
        className="flex items-center gap-1 rounded-lg border border-border/80 bg-card px-2 py-1 text-xs font-bold text-foreground hover:bg-muted/80 transition min-h-[36px] mobile-touch-target cursor-pointer"
      >
        <span className="text-xs" aria-hidden="true">🌐</span>
        <span className="text-[11px] uppercase tracking-wide font-extrabold">{currentMeta.shortLabel}</span>
        <span className="text-[9px] text-muted-foreground">▼</span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={t('language.selectLanguage', 'Select Language')}
          className="absolute right-0 mt-1 w-48 rounded-xl border border-border bg-card p-1.5 shadow-xl z-50 animate-in fade-in-50 zoom-in-95 duration-100"
        >
          <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase border-b border-border/60 mb-1">
            {t('language.selectLanguage', 'Select Language')}
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {languages.map((lang) => {
              const isSelected = lang.code === language;
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(lang.code)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition cursor-pointer min-h-[38px] ${
                    isSelected
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-foreground hover:bg-muted font-medium'
                  }`}
                  data-testid={`lang-option-${lang.code}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm shrink-0">{lang.flag}</span>
                    <span className="truncate">{lang.nativeName}</span>
                    <span className="text-[10px] text-muted-foreground">({lang.shortLabel})</span>
                  </div>
                  {isSelected && <span className="text-primary font-black">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

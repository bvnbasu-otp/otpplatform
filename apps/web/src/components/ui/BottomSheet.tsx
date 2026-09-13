import React, { useEffect } from 'react';
import { cn } from './cn';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  maxHeight?: string;
  showHandle?: boolean;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
  maxHeight = 'max-h-[85vh]',
  showHandle = true,
}: BottomSheetProps) {
  // Lock body scrolling when bottom sheet is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex flex-col justify-end sm:items-center sm:justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet / Modal Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'bottom-sheet-title' : undefined}
        className={cn(
          'relative w-full sm:max-w-lg bg-card border-t sm:border rounded-t-2xl sm:rounded-2xl shadow-2xl z-10 flex flex-col',
          'animate-in slide-in-from-bottom duration-300 ease-out',
          maxHeight,
          className
        )}
      >
        {/* Handle Bar (Mobile Only) */}
        {showHandle && (
          <div className="pt-3 pb-1 flex justify-center shrink-0 cursor-grab active:cursor-grabbing sm:hidden">
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
          </div>
        )}

        {/* Header */}
        {(title || subtitle) && (
          <div className="px-4 py-3 border-b flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <h3 id="bottom-sheet-title" className="text-base font-extrabold text-foreground truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {subtitle}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition shrink-0"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto flex-1 overscroll-contain">
          {children}
        </div>

        {/* Footer (Optional Sticky) */}
        {footer && (
          <div className="p-3 border-t bg-muted/30 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

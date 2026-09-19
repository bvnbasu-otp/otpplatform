import React, { useEffect, useRef } from 'react';
import { Button } from './Button';
import { cn } from './cn';
import { useRoleContext } from '@/features/roles/hooks/use-role-context';

// ============================================================================
// EMPTY STATE COMPONENT
// ============================================================================

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    testId?: string;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    testId?: string;
  };
  compact?: boolean;
  className?: string;
  testId?: string;
}

export function EmptyState({
  icon = '📦',
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
  className = '',
  testId = 'empty-state-view',
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'rounded-2xl border border-dashed border-border/80 bg-card/60 text-center flex flex-col items-center justify-center transition-all',
        compact ? 'p-4 sm:p-6' : 'p-6 sm:p-10 my-3',
        className
      )}
    >
      <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-muted/60 text-2xl sm:text-3xl shadow-2xs mb-3">
        {icon}
      </div>
      <h3 className="text-xs sm:text-sm font-extrabold text-foreground tracking-tight max-w-md">
        {title}
      </h3>
      <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
        {description}
      </p>

      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {primaryAction && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={primaryAction.onClick}
              data-testid={primaryAction.testId || 'empty-state-primary-action'}
              className="min-h-[40px] px-4 font-bold shadow-2xs"
            >
              {primaryAction.icon && <span className="mr-1.5">{primaryAction.icon}</span>}
              <span>{primaryAction.label}</span>
            </Button>
          )}
          {secondaryAction && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={secondaryAction.onClick}
              data-testid={secondaryAction.testId || 'empty-state-secondary-action'}
              className="min-h-[40px] px-4 font-medium"
            >
              {secondaryAction.icon && <span className="mr-1.5">{secondaryAction.icon}</span>}
              <span>{secondaryAction.label}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LOADING STATE COMPONENT
// ============================================================================

export interface LoadingStateProps {
  message?: string;
  detail?: string;
  variant?: 'spinner' | 'skeleton' | 'card';
  className?: string;
  testId?: string;
}

export function LoadingState({
  message = 'Loading data…',
  detail,
  variant = 'spinner',
  className = '',
  testId = 'loading-state-view',
}: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <div
        data-testid={testId}
        aria-busy="true"
        aria-live="polite"
        className={cn('space-y-3 p-4 rounded-xl border bg-card/60 animate-pulse', className)}
      >
        <div className="h-4 bg-muted/80 rounded w-1/3" />
        <div className="h-3 bg-muted/50 rounded w-3/4" />
        <div className="h-20 bg-muted/40 rounded w-full" />
        <div className="flex gap-2 pt-2">
          <div className="h-8 bg-muted/70 rounded w-24" />
          <div className="h-8 bg-muted/50 rounded w-20" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      aria-busy="true"
      aria-live="polite"
      className={cn(
        'rounded-2xl border bg-card/80 p-8 sm:p-12 text-center flex flex-col items-center justify-center my-3 shadow-2xs',
        className
      )}
    >
      <div className="relative flex h-12 w-12 items-center justify-center mb-3">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary/20 border-t-primary" />
        <span className="absolute text-xs font-black text-primary">⚡</span>
      </div>
      <p className="text-xs sm:text-sm font-bold text-foreground">{message}</p>
      {detail && (
        <p className="text-[11px] text-muted-foreground mt-1 max-w-sm leading-relaxed">{detail}</p>
      )}
    </div>
  );
}

// ============================================================================
// ERROR STATE COMPONENT
// ============================================================================

export interface ErrorStateProps {
  title?: string;
  message: string;
  errorCode?: string;
  retryAction?: {
    label?: string;
    onClick: () => void;
    testId?: string;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  className?: string;
  testId?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  errorCode,
  retryAction,
  secondaryAction,
  className = '',
  testId = 'error-state-view',
}: ErrorStateProps) {
  return (
    <div
      data-testid={testId}
      role="alert"
      className={cn(
        'rounded-2xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-5 sm:p-8 text-center flex flex-col items-center justify-center my-3 shadow-2xs',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 text-2xl mb-3">
        ⚠️
      </div>
      <h3 className="text-xs sm:text-sm font-extrabold text-rose-900 dark:text-rose-200 tracking-tight">
        {title}
      </h3>
      <p className="text-[11px] sm:text-xs text-rose-800/80 dark:text-rose-300/80 mt-1 max-w-md leading-relaxed">
        {message}
      </p>

      {errorCode && (
        <span className="mt-2 font-mono text-[10px] bg-rose-200/50 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded border border-rose-300/60 dark:border-rose-800/60">
          Ref: {errorCode}
        </span>
      )}

      {(retryAction || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {retryAction && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={retryAction.onClick}
              data-testid={retryAction.testId || 'error-state-retry-action'}
              className="min-h-[40px] px-4 font-bold bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-2xs"
            >
              🔄 {retryAction.label || 'Try Again'}
            </Button>
          )}
          {secondaryAction && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={secondaryAction.onClick}
              data-testid={secondaryAction.testId || 'error-state-secondary-action'}
              className="min-h-[40px] px-4 font-medium"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BLOCKED STATE COMPONENT (Permission / Role / Policy Guard)
// ============================================================================

export interface BlockedStateProps {
  title?: string;
  reason: string;
  requiredRole?: string;
  requiredPermission?: string;
  onSwitchContext?: () => void;
  onGoBack?: () => void;
  className?: string;
  testId?: string;
}

export function BlockedState({
  title = 'Access Restricted',
  reason,
  requiredRole,
  requiredPermission,
  onSwitchContext,
  onGoBack,
  className = '',
  testId = 'blocked-state-view',
}: BlockedStateProps) {
  return (
    <div
      data-testid={testId}
      role="alert"
      className={cn(
        'rounded-2xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-6 sm:p-10 text-center flex flex-col items-center justify-center my-4 shadow-2xs',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 text-2xl mb-3">
        🔒
      </div>
      <h3 className="text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-200 tracking-tight">
        {title}
      </h3>
      <p className="text-[11px] sm:text-xs text-amber-900/80 dark:text-amber-300/80 mt-1 max-w-md leading-relaxed">
        {reason}
      </p>

      {(requiredRole || requiredPermission) && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[10px]">
          {requiredRole && (
            <span className="rounded bg-amber-200/60 dark:bg-amber-900/50 text-amber-950 dark:text-amber-200 font-bold px-2 py-0.5 border border-amber-300/70 dark:border-amber-800">
              Role: {requiredRole}
            </span>
          )}
          {requiredPermission && (
            <span className="rounded bg-amber-200/60 dark:bg-amber-900/50 text-amber-950 dark:text-amber-200 font-bold px-2 py-0.5 border border-amber-300/70 dark:border-amber-800">
              Permission: {requiredPermission}
            </span>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {onSwitchContext && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onSwitchContext}
            data-testid="blocked-switch-context-btn"
            className="min-h-[40px] px-4 font-bold bg-amber-600 hover:bg-amber-700 text-white border-amber-700 shadow-2xs"
          >
            👥 Switch Context / Role
          </Button>
        )}
        {onGoBack && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onGoBack}
            data-testid="blocked-back-btn"
            className="min-h-[40px] px-4 font-medium"
          >
            ← Return to Dashboard
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ACCESSIBLE MODAL COMPONENT
// ============================================================================

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  className?: string;
  testId?: string;
  /** When true (default), automatically resets/closes the modal if active role or organization context changes */
  closeOnContextChange?: boolean;
  /** Optional callback fired when tenant or role context changes while modal is active */
  onContextChange?: (detail: { role?: string | null; organizationId?: string | null }) => void;
}

const MAX_WIDTH_MAP = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'lg',
  className = '',
  testId = 'accessible-modal',
  closeOnContextChange = true,
  onContextChange,
}: ModalProps) {
  // DEF-004: Tenant & Role Context Sync — Listen to active role / organization context changes
  // so any active modal gracefully resets or notifies when tenant/role changes mid-session.
  const roleState = useRoleContext();
  const currentOrgId = roleState?.context?.organizationId ?? null;
  const currentRoleCode = roleState?.context?.activeRole?.code ?? null;

  const initialContextRef = useRef<{ orgId: string | null; roleCode: string | null }>({
    orgId: currentOrgId,
    roleCode: currentRoleCode,
  });

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      initialContextRef.current = {
        orgId: currentOrgId,
        roleCode: currentRoleCode,
      };
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, currentOrgId, currentRoleCode]);

  useEffect(() => {
    if (!isOpen || !closeOnContextChange) return;

    if (
      initialContextRef.current.orgId !== currentOrgId ||
      initialContextRef.current.roleCode !== currentRoleCode
    ) {
      onContextChange?.({ organizationId: currentOrgId, role: currentRoleCode });
      onClose();
    }
  }, [isOpen, currentOrgId, currentRoleCode, closeOnContextChange, onClose, onContextChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleWindowContextChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ role?: string; organizationId?: string; activeRoleCode?: string }>;
      if (isOpen) {
        onContextChange?.({
          organizationId: customEvent.detail?.organizationId,
          role: customEvent.detail?.role || customEvent.detail?.activeRoleCode,
        });
        if (closeOnContextChange) {
          onClose();
        }
      }
    };

    window.addEventListener('otp:role-context-change', handleWindowContextChange);
    return () => window.removeEventListener('otp:role-context-change', handleWindowContextChange);
  }, [isOpen, closeOnContextChange, onClose, onContextChange]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

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
    <div
      className="fixed inset-0 z-[1150] flex items-center justify-center p-3 sm:p-4"
      data-testid={testId}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Box */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-dialog-title' : undefined}
        className={cn(
          'relative w-full rounded-2xl bg-card border shadow-2xl z-10 flex flex-col max-h-[90vh] overflow-hidden',
          'animate-in zoom-in-95 duration-200 ease-out',
          MAX_WIDTH_MAP[maxWidth],
          className
        )}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b flex items-start justify-between gap-3 shrink-0 bg-card">
            <div className="min-w-0 flex-1">
              {title && (
                <h3 id="modal-dialog-title" className="text-xs sm:text-sm font-extrabold text-foreground truncate">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                  {subtitle}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition shrink-0 active:scale-95 mobile-touch-target"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 overscroll-contain text-xs">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-3 sm:p-4 border-t bg-muted/20 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

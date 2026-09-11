import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '@/lib/telemetry';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, { componentStack: errorInfo.componentStack || undefined });
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[300px] flex-col items-center justify-center p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive text-xl font-bold">
            ⚠️
          </div>
          <h2 className="mt-3 text-base font-bold text-foreground">Something went wrong</h2>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            An unexpected error occurred in this workspace pane. The error has been logged for resolution.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

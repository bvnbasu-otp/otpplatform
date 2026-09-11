import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { hasSentryDsn, reportError } from './lib/telemetry';
import './index.css';

// Show clear visual error if an unhandled error happens before React mounts
function showPreMountError(error: unknown) {
  const rootEl = document.getElementById('root');
  if (rootEl && !rootEl.hasChildNodes()) {
    const msg = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : String(error);
    rootEl.innerHTML = `
      <div style="font-family:system-ui,-apple-system,sans-serif;padding:32px;max-width:640px;margin:40px auto;background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;color:#9f1239;">
        <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;">Initialization Error</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#881337;">The application encountered an error during boot:</p>
        <pre style="margin:0 0 16px;padding:12px;background:#ffe4e6;border-radius:8px;font-size:12px;overflow:auto;white-space:pre-wrap;">${msg}</pre>
        <button onclick="window.location.reload()" style="padding:8px 16px;background:#e11d48;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;">Reload Application</button>
      </div>
    `;
  }
}

// Any unhandled rejection outside React (fetch, timers) still needs a home.
window.addEventListener('error', (event) => {
  reportError(event.error ?? event.message);
  showPreMountError(event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason);
});

// Sentry is loaded only when a DSN is present at build time, so the default
// bundle stays lean. Vite tree-shakes the import out otherwise.
if (hasSentryDsn()) {
  void import('./lib/telemetry-sentry')
    .then((m) => m.installSentry())
    .catch(() => {
      // If Sentry cannot boot, we still have the console fallback.
    });
}

// Initialize application root
try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Target container #root not found in document.');
  }

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (err) {
  reportError(err);
  showPreMountError(err);
}

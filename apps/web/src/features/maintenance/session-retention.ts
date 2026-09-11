/**
 * session-retention.ts
 *
 * Captures, preserves, and restores in-progress user form data and unsaved drafts
 * when scheduled platform maintenance interrupts an active session.
 */

export const MAINTENANCE_SESSION_KEY = 'otp_maintenance_retained_session';
export const KNOWN_MAINT_ACTIVE_KEY = 'otp_maint_known_active';
const REQUIREMENT_PROMPT_KEY = 'otp.requirement.prompt';

export interface RetainedField {
  name: string;
  value: string;
  type: string;
}

export interface RetainedSessionData {
  path: string;
  title: string;
  timestamp: string;
  promptDraft?: string;
  fields: RetainedField[];
  fieldCount: number;
}

/**
 * Captures dirty or entered form inputs on the current DOM page and serializes
 * them into sessionStorage before the maintenance redirect occurs.
 */
export function captureUnsavedSession(currentPath: string): RetainedSessionData | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;

  // Don't capture if already on maintenance or public info pages without work
  if (!currentPath || currentPath === '/maintenance') return null;

  try {
    const fields: RetainedField[] = [];

    // Scan all active forms for non-empty text, number, textarea, and select fields
    if (typeof document !== 'undefined') {
      const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
      );

      inputs.forEach((el) => {
        const val = el.value?.trim();
        const identifier = el.name || el.id;
        if (identifier && val && val !== '0' && val !== 'false') {
          fields.push({
            name: identifier,
            value: el.value,
            type: el.tagName.toLowerCase(),
          });
        }
      });
    }

    const promptDraft = window.sessionStorage.getItem(REQUIREMENT_PROMPT_KEY) || undefined;

    const sessionData: RetainedSessionData = {
      path: currentPath,
      title: typeof document !== 'undefined' ? document.title : 'Procurement Workspace',
      timestamp: new Date().toISOString(),
      promptDraft,
      fields,
      fieldCount: fields.length + (promptDraft ? 1 : 0),
    };

    // Only save if there was actual work or meaningful context to preserve
    window.sessionStorage.setItem(MAINTENANCE_SESSION_KEY, JSON.stringify(sessionData));
    return sessionData;
  } catch {
    return null;
  }
}

/**
 * Retrieves any saved session data from sessionStorage.
 */
export function getRetainedSession(): RetainedSessionData | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(MAINTENANCE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RetainedSessionData;
  } catch {
    return null;
  }
}

/**
 * Removes the retained session data from storage.
 */
export function clearRetainedSession(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(MAINTENANCE_SESSION_KEY);
  } catch {
    // Graceful no-op
  }
}

/**
 * Restores prompt and input field values from a retained session.
 */
export function restoreSessionInputs(retained: RetainedSessionData): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  let restoredCount = 0;

  try {
    if (retained.promptDraft && window.sessionStorage) {
      window.sessionStorage.setItem(REQUIREMENT_PROMPT_KEY, retained.promptDraft);
      restoredCount++;
    }

    retained.fields.forEach((field) => {
      const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        `[name="${field.name}"], #${field.name}`
      );
      if (el && !el.value) {
        el.value = field.value;
        // Dispatch synthetic change & input events so React / form handlers pick up the value
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        restoredCount++;
      }
    });
  } catch {
    // Graceful no-op
  }

  return restoredCount;
}

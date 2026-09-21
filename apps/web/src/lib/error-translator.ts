/**
 * =============================================================================
 * OTP Platform — Customer-Facing Error Translation Layer (Phase POL.1)
 * =============================================================================
 * Transforms low-level PostgreSQL RPC exceptions, database constraint codes,
 * and machine status validation codes into clear, empathetic, and actionable
 * UX messages for buyers and suppliers, while preserving diagnostic telemetry.
 * =============================================================================
 */

export interface TranslatedError {
  /** Customer-friendly message suitable for UI banners */
  message: string;
  /** Extracted machine code if present (e.g. 'PO-5C2-NOT-SETTLED') */
  code?: string;
  /** Actionable next-step suggestion for the user */
  actionHint?: string;
  /** Raw error text for developer logs and telemetry */
  raw: string;
}

interface ErrorMapping {
  message: string;
  actionHint?: string;
}

/**
 * Authoritative mapping of system error codes to user-friendly UX copy.
 */
const ERROR_CATALOG: Record<string, ErrorMapping> = {
  // PO Settlement & Completion Guards
  'PO-5C2-NOT-SETTLED': {
    message: 'This Purchase Order cannot be marked completed until all invoices are approved, fully paid, and financial obligations are settled.',
    actionHint: 'Please review the Settlement tab to verify all invoice payments and allocations are complete.',
  },
  'PO-5C2-UNAUTHORIZED': {
    message: 'You do not have permission to access or manage settlement details for this Purchase Order.',
    actionHint: 'Please contact your organization Owner or Manager for access.',
  },

  // Invoicing Validation Rules
  'INV-5A-OVERINVOICE': {
    message: 'The total invoiced amount cannot exceed the total authorized commitment value of the Purchase Order.',
    actionHint: 'Please check the remaining order balance and adjust the invoice amount accordingly.',
  },
  'INV-5A-MILESTONE-OVERINVOICE': {
    message: 'The cumulative invoiced amount for this milestone exceeds its allocated budget.',
    actionHint: 'Please review milestone progress and enter an amount within the milestone limit.',
  },
  'INV-5A-01': {
    message: 'The invoice must be associated with a valid, active Purchase Order.',
    actionHint: 'Please verify the order reference and try again.',
  },
  'INV-5A-02': {
    message: 'The associated Purchase Order could not be located in the database.',
    actionHint: 'Please refresh the page and verify the order exists.',
  },

  // Payment Recording & Allocations
  'PAY-5C-INV-NOT-PAYABLE': {
    message: 'Payment cannot be recorded because this invoice must be Approved before receiving payments.',
    actionHint: 'Please have the buyer review and approve the invoice first.',
  },
  'PAY-5C-OVERPAYMENT': {
    message: 'The payment amount exceeds the remaining balance due on this invoice.',
    actionHint: 'Please adjust the payment amount to match the outstanding invoice balance.',
  },
  'PAY-5C-INVOICE-OVERALLOC': {
    message: 'The allocated payment amount exceeds the remaining balance due on this invoice.',
    actionHint: 'Please verify the allocation amount against the invoice balance.',
  },
  'PAY-5C-OVERALLOC': {
    message: 'The total allocated payments exceed the total recorded remittance amount.',
    actionHint: 'Please verify the allocation breakdown across all invoices.',
  },
  'PAY-5C-INVALID-AMOUNT': {
    message: 'Payment amount must be strictly greater than ₹0.00.',
    actionHint: 'Please enter a valid payment amount.',
  },
  'PAY-5C-UNAUTHORIZED': {
    message: 'Only buyer organization Owners or Managers are authorized to record payments.',
    actionHint: 'Please request an authorized organization manager to record this payment.',
  },
  'PAY-5C-INV-NOT-FOUND': {
    message: 'The specified invoice could not be found.',
    actionHint: 'Please refresh the page and check the invoice list.',
  },
  'PAY-5C-NO-PO': {
    message: 'Could not resolve the associated Purchase Order for this invoice payment.',
    actionHint: 'Please contact support if this error persists.',
  },

  // Advance Payments & Allocations
  'ADV-5C2-INVALID-AMOUNT': {
    message: 'Advance allocation amount must be strictly greater than ₹0.00.',
    actionHint: 'Please enter a positive allocation amount.',
  },
  'ADV-5C2-PAY-OVERALLOC': {
    message: 'The allocation amount exceeds the available unallocated balance on this advance payment.',
    actionHint: 'Please select an amount within the remaining unallocated advance balance.',
  },
  'ADV-5C2-INV-OVERALLOC': {
    message: 'The allocation amount exceeds the remaining balance due on the target invoice.',
    actionHint: 'Please enter an allocation amount up to the invoice balance due.',
  },
  'ADV-5C2-INV-NOT-PAYABLE': {
    message: 'Target invoice must be approved before receiving advance payment allocations.',
    actionHint: 'Please approve the invoice before allocating advance funds.',
  },
  'ADV-5C2-PO-MISMATCH': {
    message: 'The advance payment and invoice belong to different Purchase Orders and cannot be linked.',
    actionHint: 'Advance funds can only be allocated within the same Purchase Order.',
  },
  'ADV-5C2-UNAUTHORIZED': {
    message: 'Only buyer organization Owners or Managers are authorized to allocate advance payments.',
    actionHint: 'Please ask an authorized manager to perform this allocation.',
  },
  'ADV-5C2-PAY-NOT-FOUND': {
    message: 'The advance payment record could not be found.',
    actionHint: 'Please refresh the page and verify the payment list.',
  },
  'ADV-5C2-INV-NOT-FOUND': {
    message: 'The target invoice for advance allocation could not be found.',
    actionHint: 'Please refresh the page and verify the invoice list.',
  },

  // Credit & Debit Notes / Adjustments
  'CDN-5C3-INVALID-AMOUNT': {
    message: 'Credit or debit note amount must be strictly greater than ₹0.00.',
    actionHint: 'Please enter a valid note amount.',
  },
  'CDN-5C3-INVALID-TYPE': {
    message: 'Invalid adjustment note type. Must be either a Credit Note or a Debit Note.',
    actionHint: 'Please select a valid note type.',
  },
  'CDN-5C3-INVALID-TAX': {
    message: 'Tax amount on the adjustment note cannot be negative.',
    actionHint: 'Please enter a valid non-negative tax amount.',
  },
  'CDN-5C3-INVALID-REASON': {
    message: 'A clear reason is required when issuing a credit or debit note.',
    actionHint: 'Please provide a brief justification.',
  },
  'CDN-5C3-UNAUTHORIZED': {
    message: 'Only buyer organization Owners or Managers are authorized to issue credit or debit notes.',
    actionHint: 'Please request an authorized manager to issue this note.',
  },
  'CDN-5C3-INV-NOT-FOUND': {
    message: 'The specified invoice for the credit or debit note could not be found.',
    actionHint: 'Please verify the invoice reference.',
  },
  'CDN-5C3-INVOICE-REJECTED': {
    message: 'Credit or debit notes cannot be issued against a rejected invoice.',
    actionHint: 'Adjustments can only be issued against approved or active invoices.',
  },
  'CDN-5C3-EXCEEDS-BALANCE': {
    message: 'The debit note amount exceeds the permissible invoice balance ceiling.',
    actionHint: 'Please reduce the note amount within allowable limits.',
  },

  // Statutory TDS Withholding
  'TDS-5C4-UNAUTHORIZED': {
    message: 'Only buyer organization Owners or Managers can apply statutory TDS withholding.',
    actionHint: 'Please request an authorized manager to record TDS deductions.',
  },
  'TDS-5C4-INVALID-STATUS': {
    message: 'TDS withholding can only be applied to invoices in APPROVED status.',
    actionHint: 'Please approve the invoice before applying TDS deductions.',
  },

  // Change Orders
  'CO-5C4-UNAUTHORIZED': {
    message: 'Only buyer organization Owners or Managers can commit Purchase Order change orders.',
    actionHint: 'Please request an authorized manager to commit this contract variation.',
  },
  'CO-5C4-ALREADY-COMMITTED': {
    message: 'This change order variation has already been committed to the Purchase Order.',
    actionHint: 'No further action is required.',
  },

  // Platform Fees & Rewards
  'FEE-5C5-UNAUTHORIZED': {
    message: 'You do not have permission to acknowledge or modify platform fee allocations.',
    actionHint: 'Please check your organizational permissions.',
  },
  'FEE-5C5-INVALID-PO-STATUS': {
    message: 'Platform fee acknowledgment is only permitted during initial order acceptance.',
    actionHint: 'Please contact platform support if you have questions regarding fees.',
  },
  'FEE-5C5-NO-POLICY': {
    message: 'No active platform fee schedule was found.',
    actionHint: 'Please contact platform support.',
  },

  // Database Constraint & System Errors
  '23505': {
    message: 'A record with these details already exists.',
    actionHint: 'Please verify your input to avoid duplicate submissions.',
  },
  '23503': {
    message: 'Cannot complete action because a required related record is missing.',
    actionHint: 'Please make sure all preceding procurement steps are completed.',
  },
  '42501': {
    message: 'Access denied: You do not have permission to perform this action.',
    actionHint: 'Please verify your account role or contact your organization administrator.',
  },
  'PGRST116': {
    message: 'The requested record was not found or has been removed.',
    actionHint: 'Please refresh the page.',
  },
  'PGRST301': {
    message: 'Access denied by security policies.',
    actionHint: 'Please ensure you are signed in with the correct organization account.',
  },
};

/**
 * Extracts a machine error code from an unknown error object or string.
 */
export function extractErrorCode(error: unknown): string | null {
  if (!error) return null;

  const text = typeof error === 'string'
    ? error
    : error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null
    ? ((error as any).code || (error as any).message || (error as any).error || JSON.stringify(error))
    : String(error);

  // 1. Check known uppercase machine code prefixes (PO-5C2-, INV-5A-, PAY-5C-, ADV-5C2-, etc.)
  const codeMatch = text.match(/\b([A-Z]{2,4}-[0-9A-Z]+(?:-[0-9A-Z]+)*)\b/);
  if (codeMatch && ERROR_CATALOG[codeMatch[1]]) {
    return codeMatch[1];
  }

  // 2. Check PostgreSQL numeric codes (e.g. '23505', '42501')
  const pgMatch = text.match(/\b(23505|23503|42501|PGRST116|PGRST301)\b/);
  if (pgMatch && ERROR_CATALOG[pgMatch[1]]) {
    return pgMatch[1];
  }

  // 3. Fallback: return the first matched prefix pattern even if not in catalog
  if (codeMatch) {
    return codeMatch[1];
  }

  return null;
}

/**
 * Translates any raw error into structured, user-friendly details.
 */
export function translateErrorDetails(error: unknown, fallbackMessage?: string): TranslatedError {
  if (!error) {
    return {
      message: fallbackMessage || 'An unexpected error occurred.',
      raw: '',
    };
  }

  const rawText = typeof error === 'string'
    ? error
    : error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null
    ? ((error as any).message || (error as any).error || JSON.stringify(error))
    : String(error);

  // Preserve raw diagnostics for console
  try {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[OTP Error Diagnostics]', { raw: rawText, error });
    }
  } catch {
    // Ignore logging errors in strict environments
  }

  // Check known catalog codes
  const code = extractErrorCode(error);
  if (code && ERROR_CATALOG[code]) {
    const entry = ERROR_CATALOG[code];
    return {
      message: entry.message,
      code,
      actionHint: entry.actionHint,
      raw: rawText,
    };
  }

  // Clean common database error wrappers
  let cleaned = rawText
    .replace(/^error:\s*/i, '')
    .replace(/^rpc error:\s*/i, '')
    .replace(/^graphql error:\s*/i, '')
    .replace(/\s*\(null\)\s*$/i, '')
    .trim();

  // Handle common standard web/database messages
  if (/not authenticated|jwt expired|invalid token/i.test(cleaned)) {
    return {
      message: 'Your session has expired. Please sign in again to continue.',
      actionHint: 'Please refresh or log in again.',
      raw: rawText,
    };
  }

  if (/network error|failed to fetch|unable to connect/i.test(cleaned)) {
    return {
      message: 'Unable to connect to the server. Please check your network connection.',
      actionHint: 'Check your internet connection and try again.',
      raw: rawText,
    };
  }

  if (/access denied|unauthorized|permission denied/i.test(cleaned)) {
    return {
      message: 'You do not have sufficient permissions to perform this action.',
      actionHint: 'Please contact your organization administrator.',
      raw: rawText,
    };
  }

  return {
    message: cleaned || fallbackMessage || 'An error occurred while processing your request.',
    code: code || undefined,
    raw: rawText,
  };
}

/**
 * Translates any error into a clean, customer-facing single string.
 */
export function translateError(error: unknown, fallbackMessage?: string): string {
  const details = translateErrorDetails(error, fallbackMessage);
  return details.message;
}

export class IdentityProtectedViolationError extends Error {
  readonly code = 'IDENTITY_PROTECTED_PAYLOAD_LEAK' as const;
  readonly field: string;

  constructor(field: string) {
    super(`Identity-protected payload violation: forbidden field "${field}" present`);
    this.name = 'IdentityProtectedViolationError';
    this.field = field;
  }
}

// Legacy alias
export class BlindViolationError extends IdentityProtectedViolationError {
  constructor(field: string) {
    super(field);
    this.name = 'BlindViolationError'; // Keep old name for backward compat
  }
}

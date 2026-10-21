import type { RoleContext } from './api/roles';

/**
 * Server-verified internal operator roles. These codes come from the console
 * catalog in migration 00301. They are not inferred from email or display name.
 */
const INTERNAL_ROLE_CODES = new Set([
  'SUPER_ADMIN',
  'INTERNAL_OPERATOR',
  'FINANCE_OPERATOR',
  'CATALOG_MANAGER',
  'SUPPORT_OPERATOR',
  'LEGAL_AUDITOR',
]);

type InternalSignals = Pick<RoleContext, 'isPlatformAdmin' | 'isFounder' | 'side' | 'activeRole'>;

/**
 * True when the signed-in role context is an internal operator.
 * Flags and side are copied from the server role-context payload.
 */
export function isInternalOperatorContext(context: InternalSignals): boolean {
  if (context.isPlatformAdmin || context.isFounder) return true;
  if (context.side === 'CONSOLE') return true;
  if (context.activeRole?.side === 'CONSOLE') return true;
  const code = context.activeRole?.code;
  return Boolean(code && INTERNAL_ROLE_CODES.has(code));
}

type CreationSignals = InternalSignals & Pick<RoleContext, 'signedIn'>;

/**
 * Customer requirement/order creation is offered only to signed-in buyer
 * personas (Individual, RWA, MSME). Internal operators and suppliers are excluded.
 * This is presentation only; publish_requirement remains the server boundary.
 */
export function canOfferCustomerRequirementCreation(context: CreationSignals): boolean {
  if (!context.signedIn) return false;
  if (isInternalOperatorContext(context)) return false;
  return context.side === 'BUYER';
}

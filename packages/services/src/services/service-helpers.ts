import type { OrganizationMemberRole } from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { ActorContext } from '../types/actor-context';
import { hasOrgRole, isSupplierFor } from '../types/actor-context';
import {
  ForbiddenError,
  TransitionError,
  ValidationError,
} from '../types/errors';
import { err, ok, type Result } from '../types/result';

export const JUSTIFICATION_MIN_LENGTH = 20;

export function requireOrgAccess(
  actor: ActorContext,
  organizationId: string,
  roles?: OrganizationMemberRole[],
): Result<void, ForbiddenError> {
  if (actor.isPlatformAdmin) return ok(undefined);
  if (actor.organizationId !== organizationId) {
    return err(new ForbiddenError('Organization mismatch'));
  }
  if (roles && !hasOrgRole(actor, roles)) {
    return err(new ForbiddenError('Insufficient role'));
  }
  return ok(undefined);
}

export function requireSupplierAccess(
  actor: ActorContext,
  supplierId: string,
): Result<void, ForbiddenError> {
  if (!isSupplierFor(actor, supplierId)) {
    return err(new ForbiddenError('Not authorized for this supplier'));
  }
  return ok(undefined);
}

export async function auditLog(
  audit: AuditService,
  actor: ActorContext,
  entityType: string,
  entityId: string,
  action: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await audit.log({
    actorId: actor.profileId,
    entityType,
    entityId,
    action,
    beforeState: before,
    afterState: after,
    metadata,
  });
}

export function assertTransition<T extends string>(
  canTransition: (from: T, to: T) => boolean,
  from: T,
  to: T,
  entity = 'entity',
): Result<void, TransitionError> {
  if (!canTransition(from, to)) {
    return err(new TransitionError(from, to, entity));
  }
  return ok(undefined);
}

export function validateJustification(text: string): Result<void, ValidationError> {
  if (text.trim().length < JUSTIFICATION_MIN_LENGTH) {
    return err(
      new ValidationError(
        `Justification must be at least ${JUSTIFICATION_MIN_LENGTH} characters`,
      ),
    );
  }
  return ok(undefined);
}

export function nextAnonymousLabel(existingCount: number): string {
  const letter = String.fromCharCode(65 + existingCount);
  return `Supplier ${letter}`;
}

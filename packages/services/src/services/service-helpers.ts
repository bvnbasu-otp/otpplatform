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
  organizationId?: string | null,
  roles?: OrganizationMemberRole[],
): Result<void, ForbiddenError> {
  if (actor.isPlatformAdmin) return ok(undefined);
  if (!organizationId) {
    return err(new ForbiddenError('Resource organizationId is required'));
  }
  if (actor.organizationId !== organizationId) {
    return err(new ForbiddenError('Organization mismatch'));
  }
  if (roles && !hasOrgRole(actor, roles)) {
    return err(new ForbiddenError('Insufficient role'));
  }
  return ok(undefined);
}

/**
 * Validates access to a buyer resource (Requirement, RFQ, Purchase Order).
 *
 * Core Invariants:
 * 1. For Organization resources (RWA, MSME): verifies actor belongs to target organization and has authorized role.
 * 2. For Individual buyer resources (organizationId is NULL): verifies actor is the creator (profileId) or Platform Admin.
 *    Zero committee, delegation, or quorum hurdles apply.
 */
export function requireBuyerResourceAccess(
  actor: ActorContext,
  resourceOrgId?: string | null,
  resourceCreatedBy?: string | null,
  roles?: OrganizationMemberRole[],
): Result<void, ForbiddenError> {
  if (actor.isPlatformAdmin) return ok(undefined);

  // If the resource belongs to an organization, check org membership & roles
  if (resourceOrgId && resourceOrgId.trim() !== '') {
    return requireOrgAccess(actor, resourceOrgId, roles);
  }

  // If the resource belongs to an Individual buyer (organizationId is NULL)
  if (resourceCreatedBy && resourceCreatedBy !== actor.profileId) {
    return err(
      new ForbiddenError(
        'Access denied: personal buyer resource belongs to another user',
      ),
    );
  }

  // Individual buyer operating on their own resource
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

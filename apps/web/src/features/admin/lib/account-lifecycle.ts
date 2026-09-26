import type { AccountBlockReason, AdminOrganizationItem, AdminUserItem } from '../types/admin';

/**
 * Pure rules for admin bulk account lifecycle (block/deactivate and reactivate).
 *
 * There is no delete here on purpose: legacy users/orgs are deactivated with a
 * recorded reason (reversible, audited server-side by admin_bulk_block_*), never
 * removed.
 */

export const MIN_LIFECYCLE_REASON_LENGTH = 8;

export interface LifecycleRow {
  id: string;
  isProtected?: boolean;
}

/** Super admins cannot be selected (server also refuses them). */
export function isProtectedAdminUser(user: Pick<AdminUserItem, 'isPlatformAdmin' | 'side' | 'role'>): boolean {
  return Boolean(user.isPlatformAdmin) || user.side === 'ADMIN' || user.role === 'SUPER_ADMIN';
}

export function isRowBlocked(row: {
  status?: string | null;
  blockedAt?: string | null;
  blocked_at?: string | null;
}): boolean {
  const s = (row.status || '').toUpperCase();
  return s === 'BLOCKED' || s === 'SUSPENDED' || Boolean(row.blockedAt) || Boolean(row.blocked_at);
}

/** Select-all is bounded to the rows currently visible under the active filters. */
export function selectAllFiltered<T extends LifecycleRow>(filteredRows: readonly T[]): Set<string> {
  const next = new Set<string>();
  for (const row of filteredRows) {
    if (!row.isProtected) next.add(row.id);
  }
  return next;
}

/** The ids a bulk action may touch: the selection intersected with the current filtered view. */
export function effectiveSelection<T extends LifecycleRow>(
  filteredRows: readonly T[],
  selectedIds: ReadonlySet<string>,
): string[] {
  return filteredRows.filter((r) => !r.isProtected && selectedIds.has(r.id)).map((r) => r.id);
}

/** Drops selections that are no longer visible after a filter/search change. */
export function pruneSelectionToFiltered<T extends LifecycleRow>(
  filteredRows: readonly T[],
  selectedIds: ReadonlySet<string>,
): Set<string> {
  return new Set(effectiveSelection(filteredRows, selectedIds));
}

export type LifecycleReasonValidation =
  | { ok: true; reason: string }
  | { ok: false; error: string };

/**
 * A reason category must be chosen explicitly and a written justification given;
 * the server RPC silently substitutes a generic reason for blanks, so the client
 * must refuse to send one.
 */
export function validateLifecycleReason(
  category: AccountBlockReason | '' | null | undefined,
  details: string | null | undefined,
): LifecycleReasonValidation {
  if (!category) return { ok: false, error: 'Choose a reason category.' };
  const note = (details ?? '').replace(/\s+/g, ' ').trim();
  if (note.length < MIN_LIFECYCLE_REASON_LENGTH) {
    return {
      ok: false,
      error: `Write a justification of at least ${MIN_LIFECYCLE_REASON_LENGTH} characters for the audit trail.`,
    };
  }
  return { ok: true, reason: `${category}: ${note}`.slice(0, 500) };
}

/** Buyer organisations and suppliers live in different tables and go to the RPC separately. */
export function partitionOrganizationTargets(
  organizations: readonly Pick<AdminOrganizationItem, 'id' | 'entity_type'>[],
  ids: readonly string[],
): { supplierIds: string[]; buyerOrgIds: string[] } {
  const wanted = new Set(ids);
  const supplierIds: string[] = [];
  const buyerOrgIds: string[] = [];
  for (const org of organizations) {
    if (!wanted.has(org.id)) continue;
    if (org.entity_type === 'SUPPLIER') supplierIds.push(org.id);
    else buyerOrgIds.push(org.id);
  }
  return { supplierIds, buyerOrgIds };
}

/**
 * Undo may only reactivate rows this action changed. Rows that were already
 * blocked before must stay blocked (their original reason would otherwise be lost).
 */
export function computeUndoTargets<T extends { id: string }>(
  rowsBeforeAction: readonly T[],
  targetIds: readonly string[],
  isBlocked: (row: T) => boolean,
): string[] {
  const wanted = new Set(targetIds);
  return rowsBeforeAction.filter((r) => wanted.has(r.id) && !isBlocked(r)).map((r) => r.id);
}
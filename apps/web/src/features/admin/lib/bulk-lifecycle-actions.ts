import type { AccountBlockReason, AdminBulkActionResult, AdminOrganizationItem } from '../types/admin';
import {
  bulkBlockOrganizations,
  bulkBlockUsers,
  bulkUnblockOrganizations,
  bulkUnblockUsers,
} from '../api/admin-ops';
import { partitionOrganizationTargets, validateLifecycleReason } from './account-lifecycle';

export type LifecycleEntityType = 'USERS' | 'ORGANIZATIONS';

export interface BulkLifecycleOutcome {
  ok: boolean;
  /** Rows the server reports it changed (not the number requested). */
  count: number;
  requested: number;
  error?: string;
}

function combine(results: AdminBulkActionResult[], requested: number): BulkLifecycleOutcome {
  const count = results.reduce((sum, r) => sum + (r.ok ? r.count ?? 0 : 0), 0);
  const failures = results.filter((r) => !r.ok);
  if (failures.length === 0) return { ok: true, count, requested };
  return {
    ok: false,
    count,
    requested,
    error: failures.map((f) => f.error || 'Request failed').join(' · '),
  };
}

async function runForOrganizations(
  organizations: readonly Pick<AdminOrganizationItem, 'id' | 'entity_type'>[],
  ids: readonly string[],
  run: (batch: string[], isSupplier: boolean) => Promise<AdminBulkActionResult>,
): Promise<AdminBulkActionResult[]> {
  const { supplierIds, buyerOrgIds } = partitionOrganizationTargets(organizations, ids);
  const results: AdminBulkActionResult[] = [];
  if (supplierIds.length > 0) results.push(await run(supplierIds, true));
  if (buyerOrgIds.length > 0) results.push(await run(buyerOrgIds, false));
  return results;
}

export async function executeBulkDeactivation(params: {
  type: LifecycleEntityType;
  ids: readonly string[];
  organizations?: readonly Pick<AdminOrganizationItem, 'id' | 'entity_type'>[];
  reasonCategory: AccountBlockReason | '';
  reasonDetails: string;
}): Promise<BulkLifecycleOutcome> {
  const requested = params.ids.length;
  const reason = validateLifecycleReason(params.reasonCategory, params.reasonDetails);
  if (!reason.ok) return { ok: false, count: 0, requested, error: reason.error };
  if (requested === 0) return { ok: false, count: 0, requested, error: 'Nothing selected.' };

  if (params.type === 'USERS') {
    return combine([await bulkBlockUsers([...params.ids], reason.reason)], requested);
  }
  const results = await runForOrganizations(params.organizations ?? [], params.ids, (batch, isSupplier) =>
    bulkBlockOrganizations(batch, isSupplier, reason.reason),
  );
  return combine(results, requested);
}

export async function executeBulkReactivation(params: {
  type: LifecycleEntityType;
  ids: readonly string[];
  organizations?: readonly Pick<AdminOrganizationItem, 'id' | 'entity_type'>[];
}): Promise<BulkLifecycleOutcome> {
  const requested = params.ids.length;
  if (requested === 0) return { ok: false, count: 0, requested, error: 'Nothing selected.' };
  if (params.type === 'USERS') {
    return combine([await bulkUnblockUsers([...params.ids])], requested);
  }
  const results = await runForOrganizations(params.organizations ?? [], params.ids, (batch, isSupplier) =>
    bulkUnblockOrganizations(batch, isSupplier),
  );
  return combine(results, requested);
}

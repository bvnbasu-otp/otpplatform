import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const readMigration = (filename: string) =>
  readFileSync(join(rootDir, 'supabase/migrations', filename), 'utf8').replace(/\r\n/g, '\n');

describe('Unsuccessful RFQ Retention & 30-Day Purge Lifecycle (Migration 00270)', () => {
  it('confirms migration file exists and adds legal_hold and tombstone columns', () => {
    const migrationPath = join(rootDir, 'supabase/migrations/00270_unsuccessful_rfq_retention_purge.sql');
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readMigration('00270_unsuccessful_rfq_retention_purge.sql');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS legal_hold boolean');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_purged boolean');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS purged_at timestamptz');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS purge_audit_tombstone jsonb');
    expect(sql).toContain('idx_rfqs_purge_lifecycle');
  });

  it('defines purge_expired_unsuccessful_rfqs RPC with strictly bounded terminal states', () => {
    const sql = readMigration('00270_unsuccessful_rfq_retention_purge.sql');

    expect(sql).toContain('FUNCTION public.purge_expired_unsuccessful_rfqs');
    expect(sql).toContain('p_retention_days integer DEFAULT 30');

    // Terminal statuses eligible for purge
    expect(sql).toContain("r.status::text IN ('UNSUCCESSFUL', 'CANCELLED', 'EXPIRED', 'CLOSED')");

    // Active & awarded statuses strictly protected from purge
    expect(sql).toContain("r.status::text NOT IN ('DRAFT', 'OPEN', 'CLARIFICATION', 'EVALUATING', 'AWARDED')");

    // Absolute immunity conditions
    expect(sql).toContain('r.legal_hold = false');
    expect(sql).toContain('NOT EXISTS (\n        SELECT 1 FROM public.purchase_orders po WHERE po.rfq_id = r.id\n      )');
    expect(sql).toContain("NOT EXISTS (\n        SELECT 1 FROM public.quotes q WHERE q.rfq_id = r.id AND q.status = 'SELECTED'\n      )");
  });

  it('verifies audit event creation and tombstone persistence on purge execution', () => {
    const sql = readMigration('00270_unsuccessful_rfq_retention_purge.sql');

    expect(sql).toContain("DELETE FROM public.quotes WHERE rfq_id = v_rfq.id;");
    expect(sql).toContain("DELETE FROM public.rfq_invitations WHERE rfq_id = v_rfq.id;");
    expect(sql).toContain("is_purged = true");
    expect(sql).toContain("purged_at = now()");
    expect(sql).toContain("purge_audit_tombstone = v_tombstone");
    expect(sql).toContain("'rfq.retention_purged'");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.purge_expired_unsuccessful_rfqs");
  });
});

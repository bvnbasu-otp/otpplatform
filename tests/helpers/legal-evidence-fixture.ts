import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

/** Not a counsel record. Used only inside rolled-back tests. */
export const TEST_EXTERNAL_REF = 'TEST-EVIDENCE-NOT-A-LEGAL-APPROVAL';

/** Clears the reviewer JWT so later statements are not still that profile. */
async function clearReviewerSession(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  await client.query(`SELECT set_config('request.jwt.claims', '', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
  await client.query(`SELECT set_config('request.jwt.claim.role', '', true)`);
}

/**
 * The reviewer RPCs trust the JWT subject, not the profile id argument.
 * The caller owns the transaction. This helper never BEGIN, COMMIT, or
 * ROLLBACK. A savepoint keeps SET LOCAL ROLE visible and undoes only this
 * attempt when the action throws. A read-only BEGIN is already a transaction;
 * committing it was the isolation bug.
 */
export async function asLegalReviewer<T>(
  client: Client,
  profileId: string,
  action: () => Promise<T>,
): Promise<T> {
  await client.query('SAVEPOINT otp_legal_reviewer');
  try {
    await client.query('RESET ROLE');
    const authUserId = (await client.query<{ auth_user_id: string }>(
      `SELECT auth_user_id FROM public.profiles WHERE id = $1`,
      [profileId],
    )).rows[0].auth_user_id;
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: authUserId, role: 'authenticated' }),
    ]);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
    await client.query('SET LOCAL ROLE authenticated');
    const result = await action();
    await clearReviewerSession(client);
    await client.query('RELEASE SAVEPOINT otp_legal_reviewer');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK TO SAVEPOINT otp_legal_reviewer');
      await client.query('RELEASE SAVEPOINT otp_legal_reviewer');
    } catch {
      /* the caller transaction is already aborted */
    }
    throw error;
  }
}

const SYNTHETIC_AGREEMENTS = [
  { type: 'CUSTOMER_EULA', version: 'v-test-buyer', body: 'buyer-frozen-text' },
  { type: 'SUPPLIER_EULA', version: 'v-test-supplier', body: 'supplier-frozen-text-distinct' },
] as const;

/** Makes an already-registered synthetic snapshot the current catalogue row. */
async function restoreSyntheticSnapshot(client: Client, type: string, version: string, body: string): Promise<boolean> {
  const found = await client.query<{ id: string }>(
    `SELECT id FROM public.legal_document_snapshots
     WHERE agreement_type = $1 AND version = $2 AND body = convert_to($3, 'UTF8')`,
    [type, version, body],
  );
  if ((found.rowCount ?? 0) === 0) return false;
  await client.query(`SELECT set_config('otp.legal_catalogue_write', 'on', true)`);
  await client.query(
    `UPDATE public.legal_document_versions
     SET retired_at = now()
     WHERE agreement_type = $1 AND retired_at IS NULL AND version IS DISTINCT FROM $2`,
    [type, version],
  );
  await client.query(
    `UPDATE public.legal_document_versions
     SET retired_at = NULL
     WHERE agreement_type = $1 AND version = $2`,
    [type, version],
  );
  await client.query(`SELECT set_config('otp.legal_catalogue_write', 'off', true)`);
  return true;
}

export async function ensureDistinctFrozenAgreements(client: Client): Promise<string> {
  await client.query('RESET ROLE');
  const buyer = await currentLegal(client, 'CUSTOMER_EULA');
  const supplier = await currentLegal(client, 'SUPPLIER_EULA');
  const hashesDiffer = Boolean(
    buyer?.document_hash && supplier?.document_hash && buyer.document_hash !== supplier.document_hash,
  );
  const existing = await client.query<{ profile_id: string }>(
    `SELECT profile_id FROM public.legal_review_grants
     WHERE revoked_at IS NULL AND can_register AND can_decide AND can_activate
     LIMIT 1`,
  );
  if (hashesDiffer && (existing.rowCount ?? 0) > 0) return existing.rows[0].profile_id;

  let id = existing.rows[0]?.profile_id;
  if (!id) {
    id = randomUUID();
    const email = `reviewer-${id}@example.test`;
    await client.query(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         confirmation_token, recovery_token, email_change_token_new, email_change,
         email_change_token_current, phone_change, phone_change_token, reauthentication_token,
         is_super_admin, is_sso_user, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       ) VALUES (
         '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
         extensions.crypt('not-a-login', extensions.gen_salt('bf')), now(),
         '', '', '', '', '', '', '', '', false, false, false,
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
       )`,
      [id, email],
    );
    await client.query(
      `INSERT INTO public.profiles (id, auth_user_id, email, full_name, is_platform_admin, is_demo)
       VALUES ($1, $1, $2, 'Test Reviewer', false, false)`,
      [id, email],
    );
    await client.query(
      `SELECT public.grant_legal_reviewer(NULL, $1, true, true, true, true, $2)`,
      [id, TEST_EXTERNAL_REF],
    );
  }
  if (hashesDiffer) return id;

  for (const spec of SYNTHETIC_AGREEMENTS) {
    const restored = await restoreSyntheticSnapshot(client, spec.type, spec.version, spec.body);
    if (restored) continue;
    await asLegalReviewer(client, id, () => client.query(
      `SELECT public.register_legal_snapshot(NULL, $1, $2, convert_to($3, 'UTF8'))`,
      [spec.type, spec.version, spec.body],
    ));
  }
  return id;
}

export async function catalogAcceptance(client: Client, side: 'BUYER' | 'SUPPLIER') {
  await ensureDistinctFrozenAgreements(client);
  const row = await currentLegal(client, side === 'SUPPLIER' ? 'SUPPLIER_EULA' : 'CUSTOMER_EULA');
  return {
    eula_accepted: true,
    eula_version: row.version,
    document_hash: row.document_hash,
  };
}

export async function approveCurrentSnapshots(client: Client): Promise<void> {
  await client.query('RESET ROLE');
  const actor = (await client.query<{ profile_id: string }>(
    `SELECT profile_id FROM public.legal_review_grants WHERE can_decide AND revoked_at IS NULL LIMIT 1`,
  )).rows[0].profile_id;
  const snaps = await client.query<{ snapshot_id: string }>(
    `SELECT snapshot_id FROM public.legal_document_versions
     WHERE retired_at IS NULL AND snapshot_id IS NOT NULL
       AND agreement_type IN ('CUSTOMER_EULA', 'SUPPLIER_EULA')`,
  );
  const pending = [];
  for (const row of snaps.rows) {
    const latest = await client.query<{ decision: string }>(
      `SELECT decision FROM public.legal_agreement_approvals
       WHERE snapshot_id = $1 ORDER BY decided_at DESC, id DESC LIMIT 1`,
      [row.snapshot_id],
    );
    if (latest.rows[0]?.decision === 'APPROVED') continue;
    pending.push(row.snapshot_id);
  }
  if (pending.length === 0) return;
  await asLegalReviewer(client, actor, async () => {
    for (const snapshotId of pending) {
      await client.query(
        `SELECT public.record_legal_decision(NULL, $1, 'APPROVED', $2, NULL)`,
        [snapshotId, TEST_EXTERNAL_REF],
      );
    }
  });
}

export function activateCall(rolloutSql: string): string {
  return `SELECT public.activate_legal_enforcement(${rolloutSql}, NULL)`;
}

/** Runs activation as the granted reviewer, then restores the owner role. */
export async function activateAsReviewer(client: Client, rolloutSql: string): Promise<void> {
  await client.query('RESET ROLE');
  const rollout = (await client.query<{ at: string }>(
    `SELECT (${rolloutSql})::timestamptz AS at`,
  )).rows[0].at;
  const actor = (await client.query<{ profile_id: string }>(
    `SELECT profile_id FROM public.legal_review_grants WHERE can_activate AND revoked_at IS NULL LIMIT 1`,
  )).rows[0]?.profile_id;
  const call = `SELECT public.activate_legal_enforcement($1::timestamptz, NULL)`;
  if (!actor) {
    await client.query(call, [rollout]);
    return;
  }
  await asLegalReviewer(client, actor, () => client.query(call, [rollout]));
}

export async function currentLegal(client: Client, agreementType: string): Promise<{ version: string; document_hash: string; snapshot_id: string }> {
  return (await client.query(
    `SELECT version, document_hash, snapshot_id
     FROM public.legal_document_versions
     WHERE agreement_type = $1 AND retired_at IS NULL`,
    [agreementType],
  )).rows[0];
}

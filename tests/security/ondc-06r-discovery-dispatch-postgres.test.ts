/**
 * Local Docker Postgres only (127.0.0.1:54322). Never a hosted database.
 * Skips database cases when that database is down or migration 00231 is not applied.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, type ClientConfig } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOndcDispatchLedger } from '@otp/domain';
import { executeOndcDiscoveryDispatch } from '../../packages/services/src/ondc/ondc-discovery-dispatch';
import { createRpcOndcDiscoveryDispatchStore } from '../../packages/services/src/ondc/ondc-discovery-dispatch-store';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MIGRATION = resolve(ROOT, 'supabase/migrations/00231_ondc_discovery_dispatches.sql');
const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

let dbUp = false;
let migrationApplied = false;
let skipReason = 'local postgres 127.0.0.1:54322 is not reachable';

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client(LOCAL_PG);
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

describe('00231 migration contract', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const dispatchTable = sql.slice(
    sql.indexOf('CREATE TABLE IF NOT EXISTS public.ondc_discovery_dispatches'),
    sql.indexOf('CREATE TABLE IF NOT EXISTS public.ondc_discovery_callback_replays'),
  );

  it('is the migration ceiling and keeps the CI fallback', () => {
    const files = readFileSync(resolve(ROOT, 'tests/security/verified-remediation-00216-redteam.test.ts'), 'utf8');
    const ci = readFileSync(resolve(ROOT, '.github/workflows/ci-cd.yml'), 'utf8');
    expect(files).toContain("const CEILING = '00247_revoke_record_verified_payment_client_execute.sql'");
    expect(ci).toContain('EXPECTED_CEILING="00247"');
    expect(ci).toContain("process.env.EXPECTED_CEILING || '00223'");
    expect(ci).not.toContain("process.env.EXPECTED_CEILING || '00230'");
    expect(ci).not.toContain("process.env.EXPECTED_CEILING || '00231'");
  });

  it('stores the search lifecycle without a seller, a signing key, or a default city', () => {
    expect(dispatchTable).not.toMatch(/provider_supplier_id|display_name|signing|callback_url|bpp_uri/i);
    expect(sql).not.toContain('std:080');
    expect(sql).not.toContain('560001');
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON TABLE public.ondc_discovery_dispatches FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.insert_ondc_discovery_dispatch');
    expect(sql).toContain('TO service_role');
    expect(sql).toContain("environment IN ('LOCAL', 'CI', 'PRE_PROD')");
    expect(sql).toContain("operation = 'SEARCH'");
    expect(sql).toContain('transaction_id_immutable');
    expect(sql).toContain('buyer_pin_immutable');
    expect(sql).toContain('real_network_unverified_insert');
    expect(sql).toContain('CALLBACK_PENDING');
    expect(sql).not.toContain('prod.gateway.ondc.org');
  });
});

describe('00231 ONDC discovery dispatches (local postgres)', () => {
  beforeAll(async () => {
    try {
      migrationApplied = await withPg(async (c) => {
        const addr = await c.query(`SELECT inet_server_addr()::text AS addr`);
        const host = String(addr.rows[0]?.addr ?? '');
        if (host && !host.startsWith('127.') && host !== '::1' && !host.includes('172.') && !host.includes('192.168.')) {
          skipReason = 'refusing non-local postgres address';
          return false;
        }
        dbUp = true;
        const reg = await c.query(
          `SELECT to_regprocedure('public.insert_ondc_discovery_dispatch(text,text,text,text,text,text,text,text,text,text,text,text,text,text)') AS reg`,
        );
        return Boolean(reg.rows[0]?.reg);
      });
      if (dbUp && !migrationApplied) skipReason = '00231 is not applied on local postgres';
    } catch {
      dbUp = false;
      migrationApplied = false;
    }
  });

  it('skips with a reason when local postgres or 00231 is unavailable', () => {
    if (!dbUp || !migrationApplied) {
      expect(skipReason.length).toBeGreaterThan(0);
      return;
    }
    expect(migrationApplied).toBe(true);
  });

  it('enforces uniqueness, role grants, provenance, and callback correlation', async () => {
    if (!dbUp || !migrationApplied) return;
    await withPg(async (c) => {
      const suppliersBefore = await c.query(`SELECT count(*)::int AS n FROM suppliers`);
      const invitationsBefore = await c.query(`SELECT count(*)::int AS n FROM rfq_invitations`);
      await c.query('BEGIN');
      try {
        const policies = await c.query(
          `SELECT count(*)::int AS n FROM pg_policies WHERE tablename IN ('ondc_discovery_dispatches', 'ondc_discovery_callback_replays')`,
        );
        expect(policies.rows[0].n).toBe(0);

        const suffix = `${Date.now()}`;
        const transactionId = `tx-00231-${suffix}`;
        const messageId = `msg-00231-${suffix}`;
        const correlationId = `corr-00231-${suffix}`;
        const idempotencyKey = `${transactionId}\u001fsearch\u001f560048\u001fONDC:RET12`;
        const digest = 'BLAKE-512=QUJDREVGRw==';
        const otherDigest = 'BLAKE-512=QUJDREVGUg==';

        await c.query('SET LOCAL ROLE service_role');
        const inserted = await c.query(
          `SELECT public.insert_ondc_discovery_dispatch($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS row`,
          [
            idempotencyKey,
            transactionId,
            messageId,
            correlationId,
            transactionId,
            '560048',
            'ONDC:RET12',
            'std:0421',
            'LOCAL',
            'MOCK',
            'mock.otp.test',
            'cotton yarn',
            'cotton_yarn',
            'PRODUCT_MATERIAL',
          ],
        );
        const again = await c.query(
          `SELECT public.insert_ondc_discovery_dispatch($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) AS row`,
          [
            idempotencyKey,
            `other-${transactionId}`,
            'msg-other',
            'corr-other',
            transactionId,
            '560048',
            'ONDC:RET12',
            'std:0421',
            'LOCAL',
            'MOCK',
            'mock.otp.test',
            'cotton yarn',
            'cotton_yarn',
            'PRODUCT_MATERIAL',
          ],
        );
        expect(again.rows[0].row.transaction_id).toBe(inserted.rows[0].row.transaction_id);
        expect(again.rows[0].row.message_id).toBe(messageId);
        expect(again.rows[0].row.recovered).toBe(true);
        expect(again.rows[0].row.real_network_verified).toBe(false);

        const observationsAfterInsert = await c.query(
          `SELECT count(*)::int AS n FROM ondc_discovery_observations o
             JOIN ondc_discovery_identities i ON i.id = o.identity_id
            WHERE o.correlation_id = $1`,
          [transactionId],
        );
        expect(observationsAfterInsert.rows[0].n).toBe(0);

        await c.query('SAVEPOINT rejected_insert');
        await expect(
          c.query(
            `SELECT public.insert_ondc_discovery_dispatch($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              `${idempotencyKey}-prod`,
              `prod-${suffix}`,
              messageId,
              correlationId,
              `prod-${suffix}`,
              '560048',
              'ONDC:RET12',
              'std:0421',
              'PRODUCTION',
              'REAL_NETWORK',
              'mock.otp.test',
              null,
              null,
              null,
            ],
          ),
        ).rejects.toThrow(/ondc_production_disabled|rejected_environment|rejected_provenance/);
        await c.query('ROLLBACK TO SAVEPOINT rejected_insert');

        await expect(
          c.query(
            `SELECT public.insert_ondc_discovery_dispatch($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              `${idempotencyKey}-mix`,
              `mix-${suffix}`,
              messageId,
              `corr-mix-${suffix}`,
              `mix-${suffix}`,
              '560048',
              'ONDC:RET12',
              'std:0421',
              'LOCAL',
              'REAL_NETWORK',
              'mock.otp.test',
              null,
              null,
              null,
            ],
          ),
        ).rejects.toThrow(/rejected_provenance/);
        await c.query('ROLLBACK TO SAVEPOINT rejected_insert');

        await c.query(`SELECT public.advance_ondc_discovery_dispatch($1, $2, 'CALLBACK_PENDING', NULL)`, [
          transactionId,
          messageId,
        ]);

        const candidate = JSON.stringify([
          {
            provider_supplier_id: `seller-${suffix}`,
            provider_participant_id: 'bpp.local.test',
            display_name: 'Local Reported Seller',
            correlation_id: transactionId,
            requested_pin: '641001',
            seller_pin: '641001',
            seller_city: 'Coimbatore',
          },
        ]);
        const accepted = await c.query(
          `SELECT public.accept_ondc_discovery_on_search($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) AS row`,
          [
            transactionId,
            messageId,
            'bpp.local.test',
            digest,
            '2026-10-04T03:40:00.000Z',
            'ONDC:RET12',
            'mock.otp.test',
            'LOCAL',
            'MOCK',
            candidate,
          ],
        );
        expect(accepted.rows[0].row.ok).toBe(true);
        expect(accepted.rows[0].row.real_network_verified).toBe(false);
        expect(accepted.rows[0].row.persistence).toBe('STORED_MOCK');

        const observed = await c.query(
          `SELECT o.requested_pin, o.seller_pin, o.source, o.environment, d.status, d.real_network_verified, d.buyer_requested_pin
             FROM ondc_discovery_observations o
             JOIN ondc_discovery_identities i ON i.id = o.identity_id
             JOIN ondc_discovery_dispatches d ON d.transaction_id = $2
            WHERE i.provider_supplier_id = $1`,
          [`seller-${suffix}`, transactionId],
        );
        expect(observed.rows).toHaveLength(1);
        expect(observed.rows[0].requested_pin).toBe('560048');
        expect(observed.rows[0].seller_pin).toBe('641001');
        expect(observed.rows[0].source).toBe('MOCK');
        expect(observed.rows[0].environment).toBe('LOCAL');
        expect(observed.rows[0].status).toBe('OBSERVED');
        expect(observed.rows[0].real_network_verified).toBe(false);
        expect(observed.rows[0].buyer_requested_pin).toBe('560048');

        const replay = await c.query(
          `SELECT public.accept_ondc_discovery_on_search($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) AS row`,
          [
            transactionId,
            messageId,
            'bpp.local.test',
            digest,
            '2026-10-04T03:20:00.000Z',
            'ONDC:RET12',
            'mock.otp.test',
            'LOCAL',
            'MOCK',
            candidate,
          ],
        );
        expect(replay.rows[0].row.ok).toBe(true);
        expect(replay.rows[0].row.replay).toBe(true);
        const observationCount = await c.query(
          `SELECT count(*)::int AS n FROM ondc_discovery_observations o
             JOIN ondc_discovery_identities i ON i.id = o.identity_id
            WHERE i.provider_supplier_id = $1`,
          [`seller-${suffix}`],
        );
        expect(observationCount.rows[0].n).toBe(1);
        const canonical = await c.query(
          `SELECT canonical_observed_at FROM ondc_discovery_dispatches WHERE transaction_id = $1`,
          [transactionId],
        );
        expect(new Date(canonical.rows[0].canonical_observed_at).toISOString()).toBe('2026-10-04T03:40:00.000Z');

        const changed = await c.query(
          `SELECT public.accept_ondc_discovery_on_search($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) AS row`,
          [
            transactionId,
            messageId,
            'bpp.local.test',
            otherDigest,
            '2026-10-04T04:40:00.000Z',
            'ONDC:RET12',
            'mock.otp.test',
            'LOCAL',
            'MOCK',
            candidate,
          ],
        );
        expect(changed.rows[0].row.ok).toBe(false);
        expect(changed.rows[0].row.reason).toBe('duplicate_message');

        const wrongBpp = await c.query(
          `SELECT public.accept_ondc_discovery_on_search($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) AS row`,
          [
            transactionId,
            messageId,
            'other-bpp.local.test',
            digest,
            '2026-10-04T03:40:00.000Z',
            'ONDC:RET12',
            'mock.otp.test',
            'LOCAL',
            'MOCK',
            candidate,
          ],
        );
        expect(wrongBpp.rows[0].row.ok).toBe(false);
        expect(wrongBpp.rows[0].row.reason).toBe('wrong_provider');

        const unknown = await c.query(
          `SELECT public.accept_ondc_discovery_on_search($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) AS row`,
          [
            `missing-${suffix}`,
            messageId,
            'bpp.local.test',
            digest,
            '2026-10-04T03:40:00.000Z',
            'ONDC:RET12',
            'mock.otp.test',
            'LOCAL',
            'MOCK',
            candidate,
          ],
        );
        expect(unknown.rows[0].row.ok).toBe(false);
        expect(unknown.rows[0].row.reason).toBe('unknown_transaction');
        const dispatchCount = await c.query(
          `SELECT count(*)::int AS n FROM ondc_discovery_dispatches WHERE transaction_id = $1`,
          [`missing-${suffix}`],
        );
        expect(dispatchCount.rows[0].n).toBe(0);

        await c.query('SAVEPOINT immutable_dispatch');
        await expect(
          c.query(`UPDATE ondc_discovery_dispatches SET transaction_id = 'changed' WHERE transaction_id = $1`, [transactionId]),
        ).rejects.toThrow(/transaction_id_immutable|untrusted_dispatch_update|permission denied/i);
        await c.query('ROLLBACK TO SAVEPOINT immutable_dispatch');
        await expect(
          c.query(`UPDATE ondc_discovery_dispatches SET observation_source = 'REAL_NETWORK' WHERE transaction_id = $1`, [transactionId]),
        ).rejects.toThrow(/observation_source_immutable|untrusted_dispatch_update|permission denied/i);
        await c.query('ROLLBACK TO SAVEPOINT immutable_dispatch');
        await expect(
          c.query(`UPDATE ondc_discovery_dispatches SET real_network_verified = true WHERE transaction_id = $1`, [transactionId]),
        ).rejects.toThrow(/real_network_unverified_update|untrusted_dispatch_update|permission denied/i);
        await c.query('ROLLBACK TO SAVEPOINT immutable_dispatch');
        await expect(
          c.query(`UPDATE ondc_discovery_dispatches SET buyer_requested_pin = '641001' WHERE transaction_id = $1`, [transactionId]),
        ).rejects.toThrow(/buyer_pin_immutable|untrusted_dispatch_update|permission denied/i);
        await c.query('ROLLBACK TO SAVEPOINT immutable_dispatch');

        await c.query('SAVEPOINT browser_role');
        await c.query('SET LOCAL ROLE anon');
        await expect(
          c.query(`INSERT INTO ondc_discovery_dispatches (transaction_id, message_id) VALUES ('fake', 'fake')`),
        ).rejects.toThrow(/permission denied/i);
        await c.query('ROLLBACK TO SAVEPOINT browser_role');
        await c.query('SET LOCAL ROLE anon');
        await expect(c.query(`SELECT public.insert_ondc_discovery_dispatch($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [
          'fake-key',
          'fake-tx',
          'fake-msg',
          'fake-corr',
          'fake-tx',
          '560048',
          'ONDC:RET12',
          'std:0421',
          'LOCAL',
          'MOCK',
          'mock.otp.test',
          null,
          null,
          null,
        ])).rejects.toThrow(/permission denied/i);
        await c.query('ROLLBACK TO SAVEPOINT browser_role');
        await c.query('SET LOCAL ROLE authenticated');
        await expect(
          c.query(`UPDATE ondc_discovery_dispatches SET transaction_id = 'browser' WHERE transaction_id = $1`, [transactionId]),
        ).rejects.toThrow(/permission denied/i);
        await c.query('ROLLBACK TO SAVEPOINT browser_role');
      } finally {
        await c.query('ROLLBACK');
      }
      const suppliersAfter = await c.query(`SELECT count(*)::int AS n FROM suppliers`);
      const invitationsAfter = await c.query(`SELECT count(*)::int AS n FROM rfq_invitations`);
      expect(suppliersAfter.rows[0].n).toBe(suppliersBefore.rows[0].n);
      expect(invitationsAfter.rows[0].n).toBe(invitationsBefore.rows[0].n);
    });
  });

  it('lets a second connection correlate a committed dispatch', async () => {
    if (!dbUp || !migrationApplied) return;
    const suffix = `cross-${Date.now()}`;
    const transactionId = `tx-${suffix}`;
    const messageId = `msg-${suffix}`;
    const sellerId = `seller-${suffix}`;
    const digest = 'BLAKE-512=QUJDREVGRw==';
    const candidate = JSON.stringify([
      {
        provider_supplier_id: sellerId,
        provider_participant_id: 'bpp.local.test',
        display_name: 'Local Reported Seller',
        correlation_id: transactionId,
        requested_pin: '641001',
        seller_pin: '641001',
      },
    ]);
    const writer = new Client(LOCAL_PG);
    await writer.connect();
    try {
      await writer.query(
        `SELECT public.insert_ondc_discovery_dispatch($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,NULL,NULL)`,
        [
          `key-${suffix}`,
          transactionId,
          messageId,
          `corr-${suffix}`,
          transactionId,
          '560048',
          'ONDC:RET12',
          'std:0421',
          'LOCAL',
          'MOCK',
          'mock.otp.test',
        ],
      );
      await writer.query(`SELECT public.advance_ondc_discovery_dispatch($1, $2, 'CALLBACK_PENDING', NULL)`, [
        transactionId,
        messageId,
      ]);
    } finally {
      await writer.end();
    }

    const reader = new Client(LOCAL_PG);
    try {
      await reader.connect();
      const found = await reader.query(
        `SELECT public.find_ondc_discovery_dispatch(NULL, $1, NULL) AS row`,
        [transactionId],
      );
      expect(found.rows[0].row.transaction_id).toBe(transactionId);
      expect(found.rows[0].row.message_id).toBe(messageId);
      expect(found.rows[0].row.real_network_verified).toBe(false);
      const accepted = await reader.query(
        `SELECT public.accept_ondc_discovery_on_search($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) AS row`,
        [
          transactionId,
          messageId,
          'bpp.local.test',
          digest,
          '2026-10-04T03:40:00.000Z',
          'ONDC:RET12',
          'mock.otp.test',
          'LOCAL',
          'MOCK',
          candidate,
        ],
      );
      expect(accepted.rows[0].row.ok).toBe(true);
      expect(accepted.rows[0].row.persistence).toBe('STORED_MOCK');
      const replay = await reader.query(
        `SELECT public.accept_ondc_discovery_on_search($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) AS row`,
        [
          transactionId,
          messageId,
          'bpp.local.test',
          digest,
          '2026-10-04T03:40:00.000Z',
          'ONDC:RET12',
          'mock.otp.test',
          'LOCAL',
          'MOCK',
          candidate,
        ],
      );
      expect(replay.rows[0].row.replay).toBe(true);
      const observations = await reader.query(
        `SELECT count(*)::int AS n, min(o.requested_pin) AS requested_pin
           FROM ondc_discovery_observations o
           JOIN ondc_discovery_identities i ON i.id = o.identity_id
          WHERE i.provider_supplier_id = $1`,
        [sellerId],
      );
      expect(observations.rows[0].n).toBe(1);
      expect(observations.rows[0].requested_pin).toBe('560048');
    } finally {
      await reader.end().catch(() => undefined);
      const cleanup = new Client(LOCAL_PG);
      await cleanup.connect();
      try {
        await cleanup.query(`ALTER TABLE public.ondc_discovery_callback_replays DISABLE TRIGGER ondc_discovery_callback_replays_guard`);
        await cleanup.query(`DELETE FROM ondc_discovery_callback_replays WHERE transaction_id = $1`, [transactionId]);
        await cleanup.query(`ALTER TABLE public.ondc_discovery_callback_replays ENABLE TRIGGER ondc_discovery_callback_replays_guard`);
        await cleanup.query(
          `DELETE FROM ondc_discovery_observations o
            USING ondc_discovery_identities i
           WHERE o.identity_id = i.id AND i.provider_supplier_id = $1`,
          [sellerId],
        );
        await cleanup.query(`DELETE FROM ondc_discovery_identities WHERE provider_supplier_id = $1`, [sellerId]);
        await cleanup.query(`DELETE FROM ondc_discovery_dispatches WHERE transaction_id = $1`, [transactionId]);
      } finally {
        await cleanup.end();
      }
    }
  });

  it('writes a MOCK dispatch through the service and reads it on another connection', async () => {
    if (!dbUp || !migrationApplied) return;
    const suffix = `svc-${Date.now()}`;
    const writer = new Client(LOCAL_PG);
    await writer.connect();
    let transactionId = `tx-${suffix}`;
    try {
      const store = createRpcOndcDiscoveryDispatchStore({
        async rpc(fn, args) {
          const values = Object.values(args);
          try {
            const { rows } = await writer.query(
              `SELECT public.${fn}(${values.map((_, index) => `$${index + 1}`).join(', ')}) AS result`,
              values,
            );
            return { data: rows[0]?.result ?? null, error: null };
          } catch (error) {
            return { data: null, error: { message: error instanceof Error ? error.message : 'dispatch_not_durable' } };
          }
        },
      });
      const dispatched = await executeOndcDiscoveryDispatch({
        request: {
          otpTransactionId: transactionId,
          subcategoryCode: 'cotton_yarn',
          requirementMode: 'PRODUCT_MATERIAL',
          buyerRequestedPin: '560048',
          cityCode: 'std:0421',
          itemName: 'MOCK cotton yarn',
          initiatorId: 'operator-mock',
        },
        categoryLabel: 'cotton yarn',
        environmentConfig: { environmentRaw: 'LOCAL', preprod: {}, production: {} },
        ledger: createOndcDispatchLedger(),
        dispatchStore: store,
        now: () => new Date('2026-10-04T03:30:00.000Z'),
        ids: { correlationId: `corr-${suffix}`, messageId: `msg-${suffix}` },
      });
      expect(dispatched.mockAcknowledged).toBe(true);
      expect(dispatched.realNetworkVerified).toBe(false);
      expect(dispatched.gatewayAcknowledged).toBe(false);
      transactionId = dispatched.transactionId;
    } finally {
      await writer.end();
    }

    const reader = new Client(LOCAL_PG);
    try {
      await reader.connect();
      const found = await reader.query(
        `SELECT public.find_ondc_discovery_dispatch(NULL, $1, NULL) AS row`,
        [transactionId],
      );
      expect(found.rows[0].row.status).toBe('CALLBACK_PENDING');
      expect(found.rows[0].row.observation_source).toBe('MOCK');
      expect(found.rows[0].row.real_network_verified).toBe(false);
      expect(found.rows[0].row.buyer_requested_pin).toBe('560048');
      const observations = await reader.query(
        `SELECT count(*)::int AS n FROM ondc_discovery_observations o
           JOIN ondc_discovery_identities i ON i.id = o.identity_id
          WHERE o.correlation_id = $1`,
        [transactionId],
      );
      expect(observations.rows[0].n).toBe(0);
    } finally {
      await reader.end().catch(() => undefined);
      const cleanup = new Client(LOCAL_PG);
      await cleanup.connect();
      try {
        await cleanup.query(`DELETE FROM ondc_discovery_dispatches WHERE transaction_id = $1`, [transactionId]);
      } finally {
        await cleanup.end();
      }
    }
  });

  it('rejects invalid provider, operation, city, and a duplicate replay row', async () => {
    if (!dbUp || !migrationApplied) return;
    await withPg(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(`SELECT set_config('otp.ondc_dispatch_writer', 'dispatch_insert', true)`);
        await c.query('SAVEPOINT bad_row');
        await expect(
          c.query(
            `INSERT INTO ondc_discovery_dispatches (
               provider, environment, observation_source, transaction_id, message_id, correlation_id,
               idempotency_key, otp_transaction_id, buyer_requested_pin, domain, city, operation, expected_bap_id
             ) VALUES (
               'GOOGLE_PLACES', 'LOCAL', 'MOCK', 'tx-provider', 'msg', 'corr', 'key-provider', 'tx-provider',
               '560048', 'ONDC:RET12', 'std:0421', 'SEARCH', 'mock.otp.test'
             )`,
          ),
        ).rejects.toThrow(/rejected_provider|provider|check constraint/i);
        await c.query('ROLLBACK TO SAVEPOINT bad_row');

        await expect(
          c.query(
            `INSERT INTO ondc_discovery_dispatches (
               provider, environment, observation_source, transaction_id, message_id, correlation_id,
               idempotency_key, otp_transaction_id, buyer_requested_pin, domain, city, operation, expected_bap_id, real_network_verified
             ) VALUES (
               'ONDC', 'LOCAL', 'MOCK', 'tx-verified', 'msg', 'corr-verified', 'key-verified', 'tx-verified',
               '560048', 'ONDC:RET12', 'std:0421', 'SEARCH', 'mock.otp.test', true
             )`,
          ),
        ).rejects.toThrow(/real_network_unverified_insert|check constraint/i);
        await c.query('ROLLBACK TO SAVEPOINT bad_row');

        await expect(
          c.query(
            `INSERT INTO ondc_discovery_dispatches (
               provider, environment, observation_source, transaction_id, message_id, correlation_id,
               idempotency_key, otp_transaction_id, buyer_requested_pin, domain, city, operation, expected_bap_id
             ) VALUES (
               'ONDC', 'LOCAL', 'MOCK', 'tx-op', 'msg', 'corr-op', 'key-op', 'tx-op',
               '560048', 'ONDC:RET12', 'std:0421', 'select', 'mock.otp.test'
             )`,
          ),
        ).rejects.toThrow(/rejected_operation|operation|check constraint/i);
        await c.query('ROLLBACK TO SAVEPOINT bad_row');

        await expect(
          c.query(
            `INSERT INTO ondc_discovery_dispatches (
               provider, environment, observation_source, transaction_id, message_id, correlation_id,
               idempotency_key, otp_transaction_id, buyer_requested_pin, domain, city, operation, expected_bap_id
             ) VALUES (
               'ONDC', 'LOCAL', 'MOCK', 'tx-city', 'msg', 'corr-city', 'key-city', 'tx-city',
               '560048', 'ONDC:RET12', '560001', 'SEARCH', 'mock.otp.test'
             )`,
          ),
        ).rejects.toThrow(/city|check constraint/i);
        await c.query('ROLLBACK TO SAVEPOINT bad_row');

        await expect(
          c.query(
            `INSERT INTO ondc_discovery_dispatches (
               provider, environment, observation_source, transaction_id, message_id, correlation_id,
               idempotency_key, otp_transaction_id, buyer_requested_pin, domain, city, operation, expected_bap_id
             ) VALUES (
               'ONDC', 'PRE_PROD', 'MOCK', 'tx-src', 'msg', 'corr-src', 'key-src', 'tx-src',
               '560048', 'ONDC:RET12', 'std:0421', 'SEARCH', 'mock.otp.test'
             )`,
          ),
        ).rejects.toThrow(/provenance|check constraint/i);
        await c.query('ROLLBACK TO SAVEPOINT bad_row');

        const suffix = `replay-${Date.now()}`;
        await c.query('SET LOCAL ROLE service_role');
        await c.query(
          `SELECT public.insert_ondc_discovery_dispatch($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,NULL,NULL)`,
          [
            `key-${suffix}`,
            `tx-${suffix}`,
            `msg-${suffix}`,
            `corr-${suffix}`,
            `tx-${suffix}`,
            '560048',
            'ONDC:RET12',
            'std:0421',
            'LOCAL',
            'MOCK',
            'mock.otp.test',
          ],
        );
        await c.query('RESET ROLE');
        await c.query(`SELECT set_config('otp.ondc_dispatch_writer', 'dispatch_callback', true)`);
        await c.query(
          `INSERT INTO ondc_discovery_callback_replays (transaction_id, message_id, callback_subscriber, body_digest)
           VALUES ($1, $2, 'bpp.local.test', 'BLAKE-512=QUJDREVGRw==')`,
          [`tx-${suffix}`, `msg-${suffix}`],
        );
        await expect(
          c.query(
            `INSERT INTO ondc_discovery_callback_replays (transaction_id, message_id, callback_subscriber, body_digest)
             VALUES ($1, $2, 'bpp.local.test', 'BLAKE-512=QUJDREVGRw==')`,
            [`tx-${suffix}`, `msg-${suffix}`],
          ),
        ).rejects.toThrow(/duplicate key|unique/i);
      } finally {
        await c.query('ROLLBACK');
      }
    });
  });
});

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const LOCAL_POSTGRES = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

const PIN_ONLY_CATEGORY = '__PIN_ONLY_WARMING__';

const completePlace = (placeId: string) => ({
  placeId,
  businessName: 'Migration 273 Test Supplier',
  formattedAddress: '12 Industrial Road, Bengaluru 560048',
  phone: '+919876543210',
  lat: 12.97,
  lng: 77.71,
  googleMapsUri: `https://maps.google.com/?cid=${placeId}`,
  businessStatus: 'OPERATIONAL',
  locations: [{
    pincode: '560048',
    city: 'Bengaluru',
    state: 'Karnataka',
    phone: '+919876543210',
    addressLine: '12 Industrial Road, Bengaluru 560048',
    latitude: 12.97,
    longitude: 77.71,
  }],
});

describe('00273 canonical supplier persistence (loopback PostgreSQL transaction)', () => {
  it('persists category-scoped Place IDs idempotently and keeps PIN-only warming out of supplier categories', async () => {
    const client = new Client(LOCAL_POSTGRES);
    try {
      await client.connect();
    } catch {
      console.warn('[SKIP REASON] local PostgreSQL is unavailable at 127.0.0.1:54322');
      return;
    }

    await client.query('BEGIN');
    try {
      const baseline = await client.query(`
        SELECT
          to_regclass('public.location_pin_coverage_scope') AS coverage_scope,
          to_regclass('public.supplier_provider_identities') AS provider_identities,
          to_regprocedure('private.ensure_supplier_from_pin_coverage(text,jsonb,text)') AS ensure_supplier,
          to_regprocedure('public.location_pin_coverage_upsert_suppliers(text,text,text,text,text,jsonb)') AS upsert_rpc
      `);
      const installed = baseline.rows[0];
      if (!installed.coverage_scope || !installed.provider_identities || !installed.ensure_supplier || !installed.upsert_rpc) {
        console.warn('[SKIP REASON] local PostgreSQL does not have the 00273 prerequisite schema');
        await client.query('ROLLBACK');
        return;
      }

      for (const migrationName of [
        '00273_persist_pin_coverage_in_canonical_suppliers.sql',
        '00274_location_pin_coverage_durable_recovery.sql',
        '00275_isolate_rfq_subcategory_recipients.sql',
      ]) {
        const migrationPath = resolve(process.cwd(), 'supabase/migrations', migrationName);
        const migration = readFileSync(migrationPath, 'utf8')
          .replace(/^\s*BEGIN;\s*/i, '')
          .replace(/\s*COMMIT;\s*$/i, '');
        await client.query(migration);
      }

      const taxonomy = await client.query(`
        SELECT c.id AS category_id, c.name AS category_name,
               s.id AS subcategory_id, s.name AS subcategory_name
        FROM public.requirement_categories c
        JOIN public.requirement_subcategories s ON s.category_id = c.id
        ORDER BY c.name, s.name
        LIMIT 1
      `);
      expect(taxonomy.rowCount).toBe(1);

      await client.query('SET LOCAL ROLE service_role');
      const placeId = `ChIJ_00273_${randomUUID()}`;
      const category = `${taxonomy.rows[0].category_name} > ${taxonomy.rows[0].subcategory_name}`;
      const scopeKey = `karnataka:bengaluru:560048:${category.toLowerCase()}`;
      const lockToken = randomUUID();
      await client.query(
        `INSERT INTO public.location_pin_coverage_scope (scope_key, state, city, pincode, category)
         VALUES ($1, 'Karnataka', 'Bengaluru', '560048', $2)`,
        [scopeKey, category],
      );
      const acquired = await client.query(
        `SELECT public.location_pin_coverage_try_acquire_generation($1, $2::uuid, 15) AS status`,
        [scopeKey, lockToken],
      );
      expect(acquired.rows[0].status).toBe('acquired');

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await client.query(
          `SELECT public.location_pin_coverage_upsert_suppliers($1, 'Karnataka', 'Bengaluru', '560048', $2, $3::jsonb)`,
          [scopeKey, category, JSON.stringify([completePlace(placeId)])],
        );
      }

      const canonical = await client.query(
        `SELECT id, status, lifecycle_state, verification_status, categories, external_place_id
         FROM public.suppliers WHERE external_place_id = $1`,
        [placeId],
      );
      expect(canonical.rowCount).toBe(1);
      expect(canonical.rows[0].status).toBe('PENDING');
      expect(canonical.rows[0].lifecycle_state).toBe('QUOTE_PARTICIPANT');
      expect(canonical.rows[0].verification_status).toBe('NOT_PROVIDED');
      expect(canonical.rows[0].categories).toEqual([
        taxonomy.rows[0].category_name,
        taxonomy.rows[0].subcategory_name,
      ]);
      expect(canonical.rows[0].categories).not.toContain(category);

      const identity = await client.query(
        `SELECT count(*)::int AS n FROM public.supplier_provider_identities
         WHERE provider = 'GOOGLE_PLACES' AND provider_supplier_id = $1 AND supplier_id = $2`,
        [placeId, canonical.rows[0].id],
      );
      expect(identity.rows[0].n).toBe(1);

      const rfqTaxonomy = await client.query(`
        SELECT c.id AS category_id, c.name AS category_name,
               sub.id AS subcategory_id, sub.name AS subcategory_name,
               sibling.id AS sibling_id, sibling.name AS sibling_name
        FROM public.requirement_categories c
        JOIN public.requirement_subcategories sub ON sub.category_id = c.id
        JOIN LATERAL (
          SELECT s.id, s.name FROM public.requirement_subcategories s
          WHERE s.category_id = c.id AND s.id <> sub.id ORDER BY s.name LIMIT 1
        ) sibling ON true
        ORDER BY c.name, sub.name
        LIMIT 1
      `);
      const owner = await client.query(`
        SELECT o.id AS organization_id, p.id AS profile_id
        FROM public.organizations o
        CROSS JOIN public.profiles p
        LIMIT 1
      `);
      expect(rfqTaxonomy.rowCount).toBe(1);
      expect(owner.rowCount).toBe(1);

      const preCompletionFreshness = await client.query(
        `SELECT last_successful_discovery_at FROM public.location_pin_coverage_scope WHERE scope_key = $1`,
        [scopeKey],
      );
      expect(preCompletionFreshness.rows[0].last_successful_discovery_at).toBeNull();
      await client.query(
        `SELECT public.location_pin_coverage_complete_generation($1, $2::uuid, 'completed', NULL)`,
        [scopeKey, lockToken],
      );
      const completedFreshness = await client.query(
        `SELECT last_successful_discovery_at FROM public.location_pin_coverage_scope WHERE scope_key = $1`,
        [scopeKey],
      );
      expect(completedFreshness.rows[0].last_successful_discovery_at).not.toBeNull();

      const googleRequirementId = randomUUID();
      const googleRfqId = randomUUID();
      await client.query(
        `INSERT INTO public.requirements (
           id, organization_id, created_by, title, status, requirement_type,
           delivery_city, delivery_pincode, category_id, subcategory_id, structured_specs
         ) VALUES (
           $1, $2, $3, 'Persisted Places RFQ', 'SUBMITTED', 'SERVICE',
           'Bengaluru', '560048', $4, $5,
           '{"deliveryLocation":{"state":"Karnataka","city":"Bengaluru","pincode":"560048"}}'::jsonb
         )`,
        [googleRequirementId, owner.rows[0].organization_id, owner.rows[0].profile_id,
          taxonomy.rows[0].category_id, taxonomy.rows[0].subcategory_id],
      );
      await client.query(
        `INSERT INTO public.rfqs (id, organization_id, created_by, requirement_id, title, status, is_demo)
         VALUES ($1, $2, $3, $4, 'Persisted Places RFQ', 'DRAFT', true)`,
        [googleRfqId, owner.rows[0].organization_id, owner.rows[0].profile_id, googleRequirementId],
      );
      await client.query(
        `SELECT public.discover_and_invite_for_rfq($1::uuid, 10, '{}'::uuid[], 'GOOGLE_PLACES')`,
        [googleRfqId],
      );
      const googleRecipients = await client.query(
        `SELECT s.external_place_id, i.supplier_id
         FROM public.rfq_invitations i JOIN public.suppliers s ON s.id = i.supplier_id
         WHERE i.rfq_id = $1 ORDER BY s.external_place_id`,
        [googleRfqId],
      );
      expect(googleRecipients.rows).toEqual([
        { external_place_id: placeId, supplier_id: canonical.rows[0].id },
      ]);
      const googleDispatches = await client.query(
        `SELECT count(*)::int AS n FROM public.supplier_notifications sn
         JOIN public.rfq_invitations i ON i.id = sn.invitation_id WHERE i.rfq_id = $1`,
        [googleRfqId],
      );
      expect(googleDispatches.rows[0].n).toBe(0);

      const requirementId = randomUUID();
      const rfqId = randomUUID();
      await client.query(
        `INSERT INTO public.requirements (
           id, organization_id, created_by, title, status, requirement_type,
           delivery_city, delivery_pincode, category_id, subcategory_id, structured_specs
         ) VALUES (
           $1, $2, $3, 'Isolated subcategory test', 'SUBMITTED', 'SERVICE',
           'Bengaluru', '560048', $4, $5,
           '{"deliveryLocation":{"state":"Karnataka","city":"Bengaluru","pincode":"560048"}}'::jsonb
         )`,
        [requirementId, owner.rows[0].organization_id, owner.rows[0].profile_id,
          rfqTaxonomy.rows[0].category_id, rfqTaxonomy.rows[0].subcategory_id],
      );
      await client.query(
        `INSERT INTO public.rfqs (id, organization_id, created_by, requirement_id, title, status, is_demo)
         VALUES ($1, $2, $3, $4, 'Isolated subcategory RFQ', 'DRAFT', true)`,
        [rfqId, owner.rows[0].organization_id, owner.rows[0].profile_id, requirementId],
      );
      await client.query(`SELECT set_config('otp.demo_staging', 'on', true)`);

      const suppliers = [
        { id: randomUUID(), categories: [rfqTaxonomy.rows[0].category_name, rfqTaxonomy.rows[0].subcategory_name], city: 'Bengaluru', pincode: '560048' },
        { id: randomUUID(), categories: [rfqTaxonomy.rows[0].category_name], city: 'Bengaluru', pincode: '560048' },
        { id: randomUUID(), categories: [rfqTaxonomy.rows[0].category_name, rfqTaxonomy.rows[0].sibling_name], city: 'Bengaluru', pincode: '560048' },
        { id: randomUUID(), categories: [rfqTaxonomy.rows[0].category_name, rfqTaxonomy.rows[0].subcategory_name], city: 'Coimbatore', pincode: '641001' },
      ];
      for (const supplier of suppliers) {
        await client.query(
          `INSERT INTO public.suppliers (
             id, business_name, source, status, lifecycle_state, verification_status, categories, city, pincode
           ) VALUES ($1, $2, 'DIRECT', 'ACTIVE', 'VERIFIED', 'VERIFIED', $3::text[], $4, $5)`,
          [supplier.id, `Scoped test ${supplier.id}`, supplier.categories, supplier.city, supplier.pincode],
        );
        await client.query(
          `INSERT INTO public.supplier_users (supplier_id, profile_id, role) VALUES ($1, $2, 'OWNER')`,
          [supplier.id, owner.rows[0].profile_id],
        );
        await client.query(
          `INSERT INTO public.supplier_service_areas (supplier_id, city, pincode, is_primary)
           VALUES ($1, $2, $3, true)`,
          [supplier.id, supplier.city, supplier.pincode],
        );
      }

      const rankedRecipients = await client.query(
        `SELECT supplier_id FROM private.rank_discovery_candidates($1::uuid, '{}'::uuid[])`,
        [rfqId],
      );
      expect(rankedRecipients.rows.map((row) => row.supplier_id)).toEqual([suppliers[0].id]);

      await client.query(
        `SELECT public.discover_and_invite_for_rfq($1::uuid, 10, '{}'::uuid[], 'OTP_REGISTERED')`,
        [rfqId],
      );
      const invitations = await client.query(
        `SELECT supplier_id FROM public.rfq_invitations WHERE rfq_id = $1 ORDER BY supplier_id`,
        [rfqId],
      );
      expect(invitations.rows.map((row) => row.supplier_id)).toEqual([suppliers[0].id]);
      const notifications = await client.query(
        `SELECT count(*)::int AS n FROM public.supplier_notifications sn
         JOIN public.rfq_invitations i ON i.id = sn.invitation_id
         WHERE i.rfq_id = $1`,
        [rfqId],
      );
      expect(notifications.rows[0].n).toBe(0);

      const discoverArgs = await client.query(`
        SELECT proargnames FROM pg_proc
        WHERE oid = 'public.discover_and_invite_for_rfq(uuid,integer,uuid[],text)'::regprocedure
      `);
      expect(discoverArgs.rows[0].proargnames).not.toContain('p_supplier_ids');
      expect(discoverArgs.rows[0].proargnames).not.toContain('p_recipient_ids');

      const invitationCount = await client.query(
        `SELECT count(*)::int AS n FROM public.rfq_invitations WHERE supplier_id = $1`,
        [canonical.rows[0].id],
      );
      const notificationCount = await client.query(
        `SELECT count(*)::int AS n FROM public.supplier_notifications WHERE supplier_id = $1`,
        [canonical.rows[0].id],
      );
      expect(invitationCount.rows[0].n).toBe(1);
      expect(notificationCount.rows[0].n).toBe(0);

      await client.query('SAVEPOINT anon_coverage_probe');
      await client.query('SET LOCAL ROLE anon');
      let anonCoverageReadBlocked = false;
      try {
        const anonRows = await client.query(
          `SELECT count(*)::int AS n FROM public.location_pin_coverage_supplier WHERE scope_key = $1`,
          [scopeKey],
        );
        anonCoverageReadBlocked = anonRows.rows[0].n === 0;
      } catch {
        anonCoverageReadBlocked = true;
      }
      await client.query('ROLLBACK TO SAVEPOINT anon_coverage_probe');
      expect(anonCoverageReadBlocked).toBe(true);

      await client.query('SAVEPOINT anon_rpc_probe');
      await client.query('SET LOCAL ROLE anon');
      let anonRpcDenied = false;
      try {
        await client.query(
          `SELECT public.location_pin_coverage_upsert_suppliers($1, 'Karnataka', 'Bengaluru', '560048', $2, $3::jsonb)`,
          [scopeKey, category, JSON.stringify([completePlace(placeId)])],
        );
      } catch (error) {
        anonRpcDenied = (error as { code?: string }).code === '42501';
      }
      await client.query('ROLLBACK TO SAVEPOINT anon_rpc_probe');
      expect(anonRpcDenied).toBe(true);
      await client.query('SET LOCAL ROLE service_role');

      const pinOnlyId = `ChIJ_00273_pin_only_${randomUUID()}`;
      const pinOnlyScope = `karnataka:bengaluru:560048:${PIN_ONLY_CATEGORY.toLowerCase()}`;
      await client.query(
        `INSERT INTO public.location_pin_coverage_scope (scope_key, state, city, pincode, category)
         VALUES ($1, 'Karnataka', 'Bengaluru', '560048', $2)`,
        [pinOnlyScope, PIN_ONLY_CATEGORY],
      );
      await client.query(
        `SELECT public.location_pin_coverage_upsert_suppliers($1, 'Karnataka', 'Bengaluru', '560048', $2, $3::jsonb)`,
        [pinOnlyScope, PIN_ONLY_CATEGORY, JSON.stringify([completePlace(pinOnlyId)])],
      );
      const pinOnlyCanonical = await client.query(
        `SELECT count(*)::int AS n FROM public.suppliers WHERE external_place_id = $1`,
        [pinOnlyId],
      );
      expect(pinOnlyCanonical.rows[0].n).toBe(0);

      const retryScope = `karnataka:bengaluru:560048:retry_${randomUUID()}`;
      await client.query(
        `INSERT INTO public.location_pin_coverage_scope (scope_key, state, city, pincode, category)
         VALUES ($1, 'Karnataka', 'Bengaluru', '560048', 'Retry Test')`,
        [retryScope],
      );
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        if (attempt > 1) {
          await client.query(
            `UPDATE public.location_pin_coverage_generation SET next_attempt_at = now() WHERE scope_key = $1`,
            [retryScope],
          );
        }
        const lock = randomUUID();
        const acquire = await client.query(
          `SELECT public.location_pin_coverage_try_acquire_generation($1, $2::uuid, 15) AS status`,
          [retryScope, lock],
        );
        expect(acquire.rows[0].status).toBe('acquired');
        await client.query(
          `SELECT public.location_pin_coverage_complete_generation($1, $2::uuid, 'failed', 'PROVIDER_ERROR')`,
          [retryScope, lock],
        );
      }

      const exhausted = await client.query(
        `SELECT status, retry_count, next_attempt_at FROM public.location_pin_coverage_generation WHERE scope_key = $1`,
        [retryScope],
      );
      expect(exhausted.rows[0].status).toBe('exhausted');
      expect(exhausted.rows[0].retry_count).toBe(5);
      expect(exhausted.rows[0].next_attempt_at).toBeNull();

      const manualRetry = await client.query(
        `SELECT public.location_pin_coverage_retry_generation($1) AS accepted`,
        [retryScope],
      );
      const repeatedManualRetry = await client.query(
        `SELECT public.location_pin_coverage_retry_generation($1) AS accepted`,
        [retryScope],
      );
      expect(manualRetry.rows[0].accepted).toBe(true);
      expect(repeatedManualRetry.rows[0].accepted).toBe(false);

      const quotaScope = `karnataka:bengaluru:560048:quota_${randomUUID()}`;
      await client.query(
        `INSERT INTO public.location_pin_coverage_scope (scope_key, state, city, pincode, category)
         VALUES ($1, 'Karnataka', 'Bengaluru', '560048', 'Quota Test')`,
        [quotaScope],
      );
      const quotaLock = randomUUID();
      await client.query(
        `SELECT public.location_pin_coverage_try_acquire_generation($1, $2::uuid, 15)`,
        [quotaScope, quotaLock],
      );
      await client.query(
        `SELECT public.location_pin_coverage_complete_generation($1, $2::uuid, 'failed', 'QUOTA_EXHAUSTED')`,
        [quotaScope, quotaLock],
      );
      const quotaRetry = await client.query(
        `SELECT status,
                next_attempt_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' + interval '1 day'
                  AS waits_for_budget_window
         FROM public.location_pin_coverage_generation WHERE scope_key = $1`,
        [quotaScope],
      );
      expect(quotaRetry.rows[0].status).toBe('queued');
      expect(quotaRetry.rows[0].waits_for_budget_window).toBe(true);

      const due = await client.query(
        `SELECT public.location_pin_coverage_list_due_retries(5) AS jobs`,
      );
      expect((due.rows[0].jobs as Array<{ scope_key: string }>).some((job) => job.scope_key === retryScope)).toBe(true);

      const visibleJobs = await client.query(
        `SELECT public.location_pin_coverage_list_recovery_jobs(50) AS jobs`,
      );
      expect((visibleJobs.rows[0].jobs as Array<{ scope_key: string }>).some((job) => job.scope_key === retryScope)).toBe(true);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
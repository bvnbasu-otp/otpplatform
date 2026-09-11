import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CANONICAL_ENUMS,
  EXPECTED_MIGRATIONS,
  MIGRATIONS_DIR,
  OTP_ROOT,
  SEED_EXPECTATIONS,
  SEED_IDS,
  migrationExists,
  readAllMigrations,
  readMigration,
} from '../helpers/migration-manifest';

describe('schema migrations', () => {
  it('includes all ordered migration files', () => {
    for (const name of EXPECTED_MIGRATIONS) {
      expect(migrationExists(name), `missing ${name}`).toBe(true);
    }
  });

  it('defines every canonical PostgreSQL enum value somewhere in the schema', () => {
    const all = readAllMigrations();

    for (const [enumName, values] of Object.entries(CANONICAL_ENUMS)) {
      expect(all, `${enumName} is never created`).toContain(
        `CREATE TYPE ${enumName} AS ENUM`,
      );

      for (const value of values) {
        // Either in the original CREATE TYPE or added later by ALTER TYPE.
        expect(all, `${enumName} is missing '${value}'`).toContain(`'${value}'`);
      }
    }
  });

  it('creates core tables with UUID primary keys and money columns', () => {
    const sql = readMigration('00002_core_tables.sql');

    const tables = [
      'organizations', 'profiles', 'organization_members', 'suppliers',
      'supplier_users', 'requirements', 'rfqs', 'rfq_invitations', 'quotes',
      'quote_versions', 'quote_evaluations', 'committee_assignments',
      'conflict_of_interest_declarations', 'committee_votes', 'approval_policies',
      'approval_instances', 'awards', 'purchase_orders', 'work_orders',
      'invoices', 'payments', 'procurement_performance_records',
      'audit_events', 'notifications', 'subscription_plans',
    ];

    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }

    expect(sql).toContain('numeric(14, 2)');
    expect(sql).toContain('REFERENCES auth.users');
    expect(sql).toContain('audit_events_no_update');
    expect(sql).toContain('audit_events_no_delete');
  });

  it('defines auth helper functions in private schema', () => {
    const sql = readMigration('00003_auth_helpers.sql');

    const helpers = [
      'get_profile_id',
      'is_platform_admin',
      'is_org_member',
      'get_org_role',
      'is_supplier_user_for',
      'get_supplier_ids_for_user',
      'rfq_org_id',
      'rfq_reveal_status',
      'can_access_rfq_as_buyer',
      'can_access_rfq_as_committee',
    ];

    for (const fn of helpers) {
      expect(sql).toContain(`private.${fn}`);
    }
  });

  it('enables RLS on all tables and blocks buyer quote base-table access', () => {
    const sql = readMigration('00004_rls_policies.sql');

    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toMatch(/CREATE POLICY quotes_select_buyer/);
    expect(sql).not.toMatch(/CREATE POLICY rfq_invitations_select_buyer/);
    expect(sql).toContain('committee_votes_no_update');
    expect(sql).toContain('quote_versions_no_update');
  });

  it('defines security barrier blind views', () => {
    const sql = readMigration('00005_blind_views.sql');

    expect(sql).toContain('quotes_blind');
    expect(sql).toContain('quotes_revealed');
    expect(sql).toContain('rfq_invitations_blind');
    expect(sql).toContain('rfq_invitations_manager');
    expect(sql).toContain('security_barrier = true');
    // quotes_blind SELECT list must not expose supplier_id
    const blindSection = sql.split('quotes_revealed')[0];
    expect(blindSection).not.toContain('q.supplier_id');
  });
});

/**
 * Every policy needs a privilege underneath it.
 *
 * 00005 grants DML on all tables in public, and "all tables" means the ones that
 * existed when it ran. A table added later starts with no privileges, so a policy
 * written for `authenticated` on that table narrows a permission nobody has: the
 * statement is refused with "permission denied" before RLS is consulted, and the
 * policy — which reads like the feature works — never runs at all.
 *
 * This is exactly how the clarification thread shipped unwritable. The check is
 * static so it runs everywhere, and it fails on the next table to do the same.
 */
describe('table privileges support the policies written against them', () => {
  const COMMANDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
  type Command = (typeof COMMANDS)[number];

  /** SQL with `--` comments removed, so prose about GRANT is not read as GRANT. */
  function statements(migration: string): string {
    return readMigration(migration).replace(/--[^\n]*/g, '');
  }

  const ALL_SQL = EXPECTED_MIGRATIONS.map(statements).join('\n');

  /** Every table, mapped to the migration that first creates it. */
  function tableOrigins(): Map<string, string> {
    const origins = new Map<string, string>();

    for (const migration of EXPECTED_MIGRATIONS) {
      const pattern = /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-z_][a-z0-9_]*)/gi;

      for (const match of statements(migration).matchAll(pattern)) {
        const table = match[1]!.toLowerCase();
        if (!origins.has(table)) origins.set(table, migration);
      }
    }

    return origins;
  }

  interface Grant {
    privileges: string[];
    objects: string;
    roles: string;
  }

  /** Every GRANT ... ON ... TO ... in the schema, object lists kept whole. */
  function grants(): Grant[] {
    const pattern = /GRANT\s+([A-Za-z, ]+?)\s+ON\s+(?:TABLE\s+)?([\s\S]*?)\s+TO\s+([^;]+);/gi;

    return [...ALL_SQL.matchAll(pattern)].map((match) => ({
      privileges: match[1]!.toUpperCase().split(/\s*,\s*/),
      objects: match[2]!.toLowerCase(),
      roles: match[3]!.toLowerCase(),
    }));
  }

  /**
   * Whether a role may issue one command against one table.
   *
   * Grant lists name several tables at a time, so the table has to be looked for
   * inside the object list rather than immediately after ON.
   */
  function isGranted(all: Grant[], table: string, command: Command, role: string): boolean {
    return all.some(
      (grant) =>
        (grant.privileges.includes(command) || grant.privileges.includes('ALL')) &&
        grant.roles.includes(role) &&
        new RegExp(`\\b${table}\\b`).test(grant.objects) &&
        !/all tables in schema/.test(grant.objects),
    );
  }

  interface Policy {
    table: string;
    command: Command;
    roles: string;
  }

  /**
   * Policies that name the command they are for.
   *
   * A policy written `FOR INSERT` is a statement that inserting is meant to be
   * possible, so a missing INSERT privilege is a contradiction. A policy with no
   * FOR clause is a catch-all visibility rule, and several read-only reference
   * tables pair one with a SELECT-only grant on purpose — there the grant is the
   * narrower control and the policy is not claiming anything about writing.
   */
  function declaredPolicies(): Policy[] {
    const pattern =
      /CREATE POLICY\s+[a-z_0-9]+\s+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)([\s\S]*?)(?=USING|WITH CHECK|;)/gi;

    return [...ALL_SQL.matchAll(pattern)]
      .map((match) => {
        const header = match[2]!;
        const command = /\bFOR\s+(SELECT|INSERT|UPDATE|DELETE)\b/i.exec(header)?.[1];

        return {
          table: match[1]!.toLowerCase(),
          command: command?.toUpperCase() as Command | undefined,
          roles: (/\bTO\s+([a-z_, ]+)/i.exec(header)?.[1] ?? '').toLowerCase(),
        };
      })
      .filter((policy): policy is Policy => policy.command !== undefined);
  }

  it('grants the privilege every policy assumes, for tables created after the blanket grant', () => {
    const origins = tableOrigins();
    const allGrants = grants();
    const unreachable: string[] = [];

    for (const policy of declaredPolicies()) {
      const origin = origins.get(policy.table);
      // 00005 covered everything that existed when it ran.
      if (!origin || origin <= '00005_blind_views.sql') continue;

      for (const role of ['authenticated', 'anon']) {
        if (!policy.roles.includes(role)) continue;

        if (!isGranted(allGrants, policy.table, policy.command, role)) {
          unreachable.push(`${policy.table}.${policy.command} for ${role} (from ${origin})`);
        }
      }
    }

    expect(
      [...new Set(unreachable)],
      'these tables have policies with no privilege underneath them, so the ' +
        'statement is refused before RLS is ever consulted',
    ).toEqual([]);
  });

  it('keeps the clarification thread readable and appendable, and nothing more', () => {
    const allGrants = grants();
    const table = 'rfq_clarification_messages';

    for (const role of ['authenticated', 'service_role']) {
      expect(isGranted(allGrants, table, 'SELECT', role), `${role} cannot read`).toBe(true);
      expect(isGranted(allGrants, table, 'INSERT', role), `${role} cannot post`).toBe(true);
      // A negotiation record that can be edited afterwards is not a record.
      expect(isGranted(allGrants, table, 'UPDATE', role), `${role} can rewrite`).toBe(false);
      expect(isGranted(allGrants, table, 'DELETE', role), `${role} can erase`).toBe(false);
    }
  });
});

describe('domain enums match canonical PostgreSQL enums', () => {
  it('RequirementStatus values in procurement.ts', () => {
    const src = readFileSync(
      `${OTP_ROOT}/packages/domain/src/enums/procurement.ts`,
      'utf8',
    );
    for (const value of CANONICAL_ENUMS.requirement_status) {
      expect(src).toContain(value);
    }
  });

  it('RfqStatus values in procurement.ts', () => {
    const src = readFileSync(
      `${OTP_ROOT}/packages/domain/src/enums/procurement.ts`,
      'utf8',
    );
    for (const value of CANONICAL_ENUMS.rfq_status) {
      expect(src).toContain(value);
    }
  });

  it('QuoteStatus values in procurement.ts', () => {
    const src = readFileSync(
      `${OTP_ROOT}/packages/domain/src/enums/procurement.ts`,
      'utf8',
    );
    for (const value of CANONICAL_ENUMS.quote_status) {
      expect(src).toContain(value);
    }
  });
});

describe('borewell seed expectations (static manifest)', () => {
  it('documents fixed seed UUIDs for golden path', () => {
    expect(SEED_IDS.greenviewOrg).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(SEED_IDS.borewellRfq).toBeTruthy();
    expect(SEED_IDS.supplierA).not.toBe(SEED_IDS.supplierB);
  });

  it('documents expected seed row counts', () => {
    expect(SEED_EXPECTATIONS.suppliers).toBeGreaterThanOrEqual(5);
    expect(SEED_EXPECTATIONS.demoQuotes).toBe(3);
    expect(SEED_EXPECTATIONS.subscriptionPlans).toBe(3);
  });

  it('seed files reference Greenview and horizontal pilots', () => {
    const seedPath = `${MIGRATIONS_DIR.replace('migrations', 'seed.sql')}`;
    const pilotsPath = `${MIGRATIONS_DIR.replace('migrations', 'seed_pilots_horizontals.sql')}`;
    const seed = readFileSync(seedPath, 'utf8');
    const pilots = readFileSync(pilotsPath, 'utf8');

    expect(seed).toContain('Greenview Apartments');
    expect(seed).toContain('COMMUNITY');
    expect(seed).toContain('COMMUNITY_SIMPLE_MAJORITY');
    expect(seed).toContain('Supplier A');
    expect(seed).toContain('Motor Winding');
    expect(pilots).toContain('Precision Tools Coimbatore');
    expect(pilots).toContain('Sri Krishna Spinners');
    expect(pilots).toContain('Malleswaram Electronics');
  });
});

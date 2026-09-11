import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const OTP_ROOT = resolve(import.meta.dirname, '../..');
export const MIGRATIONS_DIR = join(OTP_ROOT, 'supabase', 'migrations');

export const EXPECTED_MIGRATIONS = [
  '00001_enums.sql',
  '00002_core_tables.sql',
  '00003_auth_helpers.sql',
  '00004_rls_policies.sql',
  '00005_blind_views.sql',
  '00006_work_orders_insert_policy.sql',
  '00007_governance_quote_policies.sql',
  '00008_procurement_os.sql',
  '00009_supplier_network_summary.sql',
  '00010_quotes_revealed_rating.sql',
  '00011_buyer_flow_functions.sql',
  '00012_clarification_negotiation.sql',
  '00013_requirement_taxonomy.sql',
  '00014_requirement_intake_columns.sql',
  '00015_supplier_capabilities.sql',
  '00016_capability_discovery.sql',
  '00017_evaluation_weights_scoring.sql',
  '00018_attachments.sql',
  '00019_taxonomy_data.sql',
  '00020_taxonomy_backfill.sql',
  '00021_demo_foundation.sql',
  '00022_identity_protection.sql',
  '00023_award_lock_reveal.sql',
  '00024_weighted_voting.sql',
  '00025_demo_simulation.sql',
  '00026_demo_reset.sql',
  '00027_capability_capacity_source.sql',
  '00028_capacity_undeclared.sql',
  '00029_served_cities.sql',
  '00030_publish_requirement.sql',
  '00031_blind_breakdown_bands.sql',
  '00032_attachment_rfq_link.sql',
  '00033_demo_board.sql',
  '00034_demo_staging_window.sql',
  '00035_signup_requests.sql',
  '00036_messaging_channel_schema.sql',
  '00037_messaging_gateway.sql',
  '00038_messaging_demo.sql',
  '00039_role_based_access.sql',
  '00040_signup_role_choice.sql',
  '00041_phase_engine.sql',
  '00042_clarification_redaction.sql',
  '00043_clarification_grants.sql',
  '00044_manager_check_null_fix.sql',
  '00045_award_closeout_mutual_reveal.sql',
  '00046_messaging_body_redaction.sql',
  '00047_direct_supplier_invitations.sql',
  '00048_market_intel_on_requirement.sql',
] as const;

export function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
}

export function migrationExists(name: string): boolean {
  return existsSync(join(MIGRATIONS_DIR, name));
}

/** Every migration concatenated, for assertions about the schema as a whole. */
export function readAllMigrations(): string {
  return EXPECTED_MIGRATIONS.map(readMigration).join('\n');
}

/**
 * Canonical PostgreSQL enum values mirrored in packages/domain.
 *
 * An enum's base values are declared in 00001, but later migrations extend
 * some of them with ALTER TYPE ... ADD VALUE, so a value belongs to the schema
 * as a whole rather than to one file.
 */
export const CANONICAL_ENUMS: Record<string, readonly string[]> = {
  requirement_status: [
    'DRAFT', 'SUBMITTED', 'RFQ_CREATED', 'QUOTING', 'NEGOTIATION', 'EVALUATION',
    'AWARDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
  ],
  rfq_status: ['DRAFT', 'OPEN', 'CLARIFICATION', 'CLOSED', 'EVALUATING', 'AWARDED', 'CANCELLED'],
  rfq_reveal_status: ['BLIND', 'REVEALED'],
  quote_status: [
    'DRAFT', 'SUBMITTED', 'REVISED', 'FINAL', 'SELECTED', 'NOT_SELECTED', 'WITHDRAWN',
  ],
  invite_status: ['INVITED', 'VIEWED', 'DECLINED', 'QUOTED'],
  award_status: ['LOCKED', 'PENDING_REVEAL', 'REVEALED'],
  purchase_order_status: [
    'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'ACCEPTED',
    'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
  ],
  requirement_mode: [
    'PRODUCT_MATERIAL', 'SERVICE', 'REPAIR_MAINTENANCE', 'JOB_WORK',
    'PROJECT_CONTRACT', 'RENTAL_HIRE', 'AMC', 'COMMODITY_TRADING', 'LOGISTICS',
    'PROFESSIONAL_SERVICE', 'OTHER',
  ],
  sourcing_mode: [
    'OPEN_RFQ', 'IDENTITY_PROTECTED', 'INVITE_SELECTED', 'NETWORK_DISCOVERY',
    'PREVIOUS_SUPPLIERS',
  ],
  fulfilment_mode: [
    'SUPPLIER_DELIVERY', 'BUYER_PICKUP', 'SUPPLIER_ONSITE', 'REMOTE',
    'LOGISTICS_REQUIRED',
  ],
  required_by_mode: ['IMMEDIATE', 'WITHIN_DAYS', 'SPECIFIC_DATE', 'FLEXIBLE'],
  supplier_verification_status: [
    'UNVERIFIED', 'SELF_DECLARED', 'DOCUMENT_VERIFIED', 'PLATFORM_VERIFIED',
  ],
};

export const SEED_EXPECTATIONS = {
  organizations: 1,
  suppliers: 5,
  profiles: 9,
  subscriptionPlans: 3,
  rfqInvitations: 5,
  demoQuotes: 3,
} as const;

export const SEED_IDS = {
  greenviewOrg: 'a0000000-0000-4000-8000-000000000001',
  borewellRfq: 'f1000000-0000-4000-8000-000000000001',
  supplierA: 'd0000000-0000-4000-8000-000000000001',
  supplierB: 'd0000000-0000-4000-8000-000000000002',
} as const;

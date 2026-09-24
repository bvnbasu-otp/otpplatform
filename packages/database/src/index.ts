/**
 * @otp/database — repository and data-access layer.
 * Identity-protected RFQ reads MUST go through identity-protected view repositories, never base quote tables.
 */

export type { DatabaseClient } from './client';
export { createRepositoryContext } from './context';
export type { RepositoryContext } from './context';

export { createSupabaseClient } from './client/supabase-client';
export type { TypedSupabaseClient } from './client/supabase-client';

export {
  resolveDatabaseConnectionTopology,
  validateConnectionTopology,
  parsePostgresUri,
  buildPostgresUri,
  ConnectionPoolConcurrencySimulator,
} from './client/connection-pool';
export type {
  DatabaseConnectionConfig,
  ConnectionTopologyOptions,
  ConnectionTopologyRole,
  ConnectionPoolMode,
  SimulatedConnection,
  ConcurrencySimulationReport,
} from './client/connection-pool';

export type { Database } from './generated/supabase';

export { mapIdentityProtectedQuoteRow, identityProtectedQuoteToRecord, mapBlindQuoteRow, blindQuoteToRecord } from './mappers/blind-quote-mapper';
export type { QuotesBlindRow } from './mappers/blind-quote-mapper';
export { mapRevealedQuoteRow } from './mappers/revealed-quote-mapper';
export type { QuotesRevealedRow } from './mappers/revealed-quote-mapper';
export { mapBlindInvitationRow } from './mappers/blind-invitation-mapper';
export type { BlindInvitation } from './mappers/blind-invitation-mapper';
export { mapManagerInvitationRow } from './mappers/manager-invitation-mapper';
export type { ManagerInvitation } from './mappers/manager-invitation-mapper';
export { mapBuyerAddressRow, buyerAddressToRecord } from './mappers/buyer-address-mapper';
export type { BuyerAddressRow } from './mappers/buyer-address-mapper';
export { mapOrgRoleAssignmentRow, mapOrgGovernanceActionAuditRow } from './mappers/org-role-lifecycle-mapper';
export type { OrgRoleAssignmentRow, OrgGovernanceActionAuditRow } from './mappers/org-role-lifecycle-mapper';

export type {
  IdentityProtectedQuoteRepository,
  RevealedQuoteRepository,
  IdentityProtectedInvitationRepository,
  ManagerInvitationRepository,
  IdentityProtectedViewRepositories,
  RfqRevealStatusReader,
  BuyerAddressRepository,
  OrgRoleLifecycleRepository,
  // Legacy aliases
  BlindQuoteRepository,
  BlindInvitationRepository,
  BlindViewRepositories,
} from './repositories/interfaces';

export {
  createBlindViewRepositories,
  SupabaseIdentityProtectedQuoteRepository,
  SupabaseRevealedQuoteRepository,
  SupabaseBlindQuoteRepository, // Legacy alias
  SupabaseBlindInvitationRepository,
  SupabaseManagerInvitationRepository,
  SupabaseRfqRevealStatusReader,
  SupabaseBuyerAddressRepository,
  SupabaseOrgRoleLifecycleRepository,
} from './repositories/index';

/**
 * Abstraction over Supabase client for repositories.
 * Concrete implementation wired in apps/web and Edge Functions.
 */
export interface DatabaseClient {
  from(table: string): unknown;
  rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: Error | null }>;
}

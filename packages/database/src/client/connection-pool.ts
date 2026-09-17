/**
 * @otp/database — Database Infrastructure, Topology & PgBouncer Connection Pooling
 * 
 * Production Topology:
 * - Application Traffic: PgBouncer Transaction-Mode Connection Pooling (Port 6543).
 * - DDL Migrations & SRE Maintenance: Direct PostgreSQL Connection (Port 5432).
 */

export type ConnectionTopologyRole = 'application' | 'migration' | 'sre';
export type ConnectionPoolMode = 'transaction' | 'session' | 'direct';

export interface DatabaseConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl: boolean | { rejectUnauthorized?: boolean };
  poolMode: ConnectionPoolMode;
  maxConnections: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  role: ConnectionTopologyRole;
  connectionString: string;
}

export interface ConnectionTopologyOptions {
  env?: Record<string, string | undefined>;
  role?: ConnectionTopologyRole;
  maxConnections?: number;
}

const DEFAULT_DIRECT_PORT = 5432;
const DEFAULT_POOLER_PORT = 6543;
const DEFAULT_MAX_CONNECTIONS = 50;
const DEFAULT_IDLE_TIMEOUT_MS = 10000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5000;

/**
 * Parses a PostgreSQL connection URI into component properties.
 */
export function parsePostgresUri(uri: string): {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl: boolean;
} {
  try {
    const parsed = new URL(uri);
    const host = parsed.hostname || '127.0.0.1';
    const port = parsed.port ? parseInt(parsed.port, 10) : DEFAULT_DIRECT_PORT;
    const database = parsed.pathname ? parsed.pathname.replace(/^\//, '') || 'postgres' : 'postgres';
    const user = parsed.username ? decodeURIComponent(parsed.username) : 'postgres';
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    const sslParam = parsed.searchParams.get('sslmode');
    const ssl = sslParam !== 'disable';

    return { host, port, database, user, password, ssl };
  } catch {
    return {
      host: '127.0.0.1',
      port: DEFAULT_DIRECT_PORT,
      database: 'postgres',
      user: 'postgres',
      ssl: false,
    };
  }
}

/**
 * Constructs a PostgreSQL connection URI with explicit port and parameters.
 */
export function buildPostgresUri(options: {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
}): string {
  const auth = options.password ? `${encodeURIComponent(options.user)}:${encodeURIComponent(options.password)}@` : `${encodeURIComponent(options.user)}@`;
  const sslParam = options.ssl === false ? '?sslmode=disable' : '';
  return `postgresql://${auth}${options.host}:${options.port}/${options.database}${sslParam}`;
}

/**
 * Resolves database connection topology according to the target role.
 * Application connections are routed to PgBouncer Transaction Pooling (Port 6543).
 * DDL migrations and SRE scripts are routed to Direct PostgreSQL (Port 5432).
 */
export function resolveDatabaseConnectionTopology(
  options: ConnectionTopologyOptions = {}
): DatabaseConnectionConfig {
  const env = options.env ?? (typeof process !== 'undefined' ? process.env : {});
  const role: ConnectionTopologyRole = options.role ?? 'application';
  const isDirectRole = role === 'migration' || role === 'sre';

  const rawUri = isDirectRole
    ? env.DATABASE_DIRECT_URL || env.DATABASE_URL
    : env.DATABASE_POOLER_URL || env.DATABASE_URL;

  let host = env.PGHOST || env.DB_HOST || '127.0.0.1';
  let database = env.PGDATABASE || env.DB_NAME || 'postgres';
  let user = env.PGUSER || env.DB_USER || 'postgres';
  let password = env.PGPASSWORD || env.POSTGRES_PASSWORD;
  let ssl = env.PGSSLMODE ? env.PGSSLMODE !== 'disable' : false;
  let port = isDirectRole ? DEFAULT_DIRECT_PORT : DEFAULT_POOLER_PORT;

  if (rawUri && (rawUri.startsWith('postgresql://') || rawUri.startsWith('postgres://'))) {
    const parsed = parsePostgresUri(rawUri);
    host = parsed.host;
    database = parsed.database;
    user = parsed.user;
    if (parsed.password) password = parsed.password;
    ssl = parsed.ssl;
    
    // Explicit port override based on role if rawUri port is default or unspecified
    if (isDirectRole) {
      port = parsed.port === DEFAULT_POOLER_PORT ? DEFAULT_DIRECT_PORT : parsed.port;
    } else {
      port = parsed.port === DEFAULT_DIRECT_PORT ? DEFAULT_POOLER_PORT : parsed.port;
    }
  }

  const poolMode: ConnectionPoolMode = isDirectRole ? 'direct' : 'transaction';
  const maxConnections = options.maxConnections ?? (isDirectRole ? 10 : DEFAULT_MAX_CONNECTIONS);
  const connectionString = buildPostgresUri({ host, port, database, user, password, ssl });

  return {
    host,
    port,
    database,
    user,
    password,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    poolMode,
    maxConnections,
    idleTimeoutMillis: DEFAULT_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DEFAULT_CONNECTION_TIMEOUT_MS,
    role,
    connectionString,
  };
}

/**
 * Validates connection topology configuration against role invariants.
 */
export function validateConnectionTopology(
  config: DatabaseConnectionConfig,
  expectedRole: ConnectionTopologyRole
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (expectedRole === 'application') {
    if (config.port !== DEFAULT_POOLER_PORT && config.port !== 54321 && config.port !== 54322) {
      // If not on local dev/test ports, production app must use 6543
      if (config.port === DEFAULT_DIRECT_PORT) {
        errors.push(`Application traffic must use PgBouncer pooler port ${DEFAULT_POOLER_PORT}, not direct port ${DEFAULT_DIRECT_PORT}`);
      }
    }
    if (config.poolMode !== 'transaction') {
      errors.push(`Application poolMode must be 'transaction', received '${config.poolMode}'`);
    }
    if (config.maxConnections < 20) {
      errors.push(`Application connection pool size too low for production workload: ${config.maxConnections} (min 20)`);
    }
  } else {
    // Migration or SRE
    if (config.port === DEFAULT_POOLER_PORT) {
      errors.push(`DDL Migrations and SRE scripts must NOT use PgBouncer port ${DEFAULT_POOLER_PORT}. Use direct port ${DEFAULT_DIRECT_PORT}`);
    }
    if (config.poolMode === 'transaction') {
      errors.push(`DDL Migrations require direct or session connection mode, not transaction pooling`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * High-Concurrency Connection Pool Simulator for 50-Connection Concurrency Validation.
 */
export interface SimulatedConnection {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  transactionCount: number;
  inTransaction: boolean;
  tenantId?: string;
}

export interface ConcurrencySimulationReport<T> {
  concurrency: number;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  peakActiveConnections: number;
  leakedConnections: number;
  connectionExhaustionCount: number;
  transactionCorruptions: number;
  results: T[];
  durationMs: number;
}

export class ConnectionPoolConcurrencySimulator {
  private activeConnections: Map<string, SimulatedConnection> = new Map();
  private idleConnections: SimulatedConnection[] = [];
  private totalAllocated = 0;
  private peakActive = 0;
  private exhaustedAttempts = 0;
  private transactionCorruptions = 0;

  constructor(
    private maxConnections: number = DEFAULT_MAX_CONNECTIONS,
    private poolMode: ConnectionPoolMode = 'transaction'
  ) {}

  public async acquireConnection(tenantId?: string): Promise<SimulatedConnection> {
    // Re-use idle connection if available
    let conn = this.idleConnections.pop();

    if (!conn) {
      if (this.activeConnections.size >= this.maxConnections) {
        this.exhaustedAttempts++;
        throw new Error(`Connection pool exhausted: maximum ${this.maxConnections} connections reached`);
      }

      this.totalAllocated++;
      conn = {
        id: `conn-pool-${this.totalAllocated}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        transactionCount: 0,
        inTransaction: false,
        tenantId,
      };
    }

    conn.lastUsedAt = Date.now();
    conn.tenantId = tenantId;
    this.activeConnections.set(conn.id, conn);

    if (this.activeConnections.size > this.peakActive) {
      this.peakActive = this.activeConnections.size;
    }

    return conn;
  }

  public releaseConnection(conn: SimulatedConnection, hadError = false): void {
    if (!this.activeConnections.has(conn.id)) {
      return; // Already released
    }

    this.activeConnections.delete(conn.id);

    // In transaction pooling mode, reset session state and transaction status before returning to idle pool
    if (conn.inTransaction) {
      this.transactionCorruptions++;
      conn.inTransaction = false;
    }
    conn.tenantId = undefined;

    if (!hadError && this.idleConnections.length < this.maxConnections) {
      this.idleConnections.push(conn);
    }
  }

  public async executeInTransaction<T>(
    tenantId: string,
    operation: (conn: SimulatedConnection) => Promise<T>
  ): Promise<T> {
    const conn = await this.acquireConnection(tenantId);
    conn.inTransaction = true;
    conn.transactionCount++;

    try {
      const result = await operation(conn);
      conn.inTransaction = false;
      this.releaseConnection(conn, false);
      return result;
    } catch (err) {
      conn.inTransaction = false;
      this.releaseConnection(conn, true);
      throw err;
    }
  }

  public async runConcurrentWorkload<T>(
    concurrency: number,
    worker: (index: number, simulator: ConnectionPoolConcurrencySimulator) => Promise<T>
  ): Promise<ConcurrencySimulationReport<T>> {
    const startTime = Date.now();
    const tasks = Array.from({ length: concurrency }, (_, i) => i);
    const results: T[] = [];
    let successfulOperations = 0;
    let failedOperations = 0;

    await Promise.all(
      tasks.map(async (i) => {
        try {
          const res = await worker(i, this);
          results.push(res);
          successfulOperations++;
        } catch {
          failedOperations++;
        }
      })
    );

    return {
      concurrency,
      totalOperations: concurrency,
      successfulOperations,
      failedOperations,
      peakActiveConnections: this.peakActive,
      leakedConnections: this.activeConnections.size,
      connectionExhaustionCount: this.exhaustedAttempts,
      transactionCorruptions: this.transactionCorruptions,
      results,
      durationMs: Date.now() - startTime,
    };
  }

  public getStats() {
    return {
      activeConnections: this.activeConnections.size,
      idleConnections: this.idleConnections.length,
      totalAllocated: this.totalAllocated,
      peakActive: this.peakActive,
      exhaustedAttempts: this.exhaustedAttempts,
      transactionCorruptions: this.transactionCorruptions,
      poolMode: this.poolMode,
      maxConnections: this.maxConnections,
    };
  }
}

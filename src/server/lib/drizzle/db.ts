import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
const betterAuthSchema = process.env.BETTER_AUTH_DB_SCHEMA?.trim() || 'better_auth';

if (!connectionString) {
  throw new Error('Missing DATABASE_URL');
}

function parsePositiveInt(
  rawValue: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const poolMax = parsePositiveInt(process.env.PG_POOL_MAX, 4);
const connectionTimeoutMillis = parsePositiveInt(
  process.env.PG_CONNECTION_TIMEOUT_MS,
  5_000,
);
const idleTimeoutMillis = parsePositiveInt(
  process.env.PG_IDLE_TIMEOUT_MS,
  20_000,
);
const lockTimeoutMillis = parsePositiveInt(
  process.env.PG_LOCK_TIMEOUT_MS,
  3_000,
);
const statementTimeoutMillis = parsePositiveInt(
  process.env.PG_STATEMENT_TIMEOUT_MS,
  30_000,
);
const idleInTransactionTimeoutMillis = parsePositiveInt(
  process.env.PG_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  60_000,
);

const postgresOptions = [
  `-c search_path=${betterAuthSchema},public`,
  '-c application_name=daoyou-api',
  `-c lock_timeout=${lockTimeoutMillis}`,
  `-c statement_timeout=${statementTimeoutMillis}`,
  `-c idle_in_transaction_session_timeout=${idleInTransactionTimeoutMillis}`,
].join(' ');

const globalForDb = globalThis as typeof globalThis & {
  __daoyouPgPool?: Pool;
  __daoyouDb?: ReturnType<typeof drizzle<typeof schema>>;
  __daoyouPgPoolListenersAttached?: boolean;
};

export const pgPool =
  globalForDb.__daoyouPgPool ??
  new Pool({
    connectionString,
    max: poolMax,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    options: postgresOptions,
  });

if (!globalForDb.__daoyouPgPoolListenersAttached) {
  pgPool.on('error', (error) => {
    console.error('[postgres-pool] idle client error', {
      postgresCode: (error as Error & { code?: string }).code ?? null,
      poolTotal: pgPool.totalCount,
      poolIdle: pgPool.idleCount,
      poolWaiting: pgPool.waitingCount,
      error,
    });
  });
  globalForDb.__daoyouPgPoolListenersAttached = true;
}

const drizzleDb =
  globalForDb.__daoyouDb ?? drizzle(pgPool, { schema });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__daoyouPgPool = pgPool;
  globalForDb.__daoyouDb = drizzleDb;
}

export const db = () => drizzleDb;

export type DbClient = ReturnType<typeof db>;

export type DbTransaction = Parameters<
  Parameters<ReturnType<typeof db>['transaction']>[0]
>[0];

export type DbExecutor = DbClient | DbTransaction;

export function getExecutor(tx?: DbTransaction): DbExecutor {
  return tx ?? db();
}

export function getQueryConcurrency(): number {
  return poolMax;
}

export function getPoolMetrics(): {
  poolTotal: number;
  poolIdle: number;
  poolWaiting: number;
} {
  return {
    poolTotal: pgPool.totalCount,
    poolIdle: pgPool.idleCount,
    poolWaiting: pgPool.waitingCount,
  };
}

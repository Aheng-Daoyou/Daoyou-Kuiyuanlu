import { betterAuthSchema } from '@server/lib/auth/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
const maxConnections = Number(process.env.DB_MAX_CONNECTIONS || 20);

if (!connectionString) {
  throw new Error('Missing DATABASE_URL');
}

const postgresOptions = [
  '-c search_path=better_auth,public',
  '-c application_name=daoyou-api',
  '-c lock_timeout=3s',
  '-c statement_timeout=30s',
  '-c idle_in_transaction_session_timeout=60s',
].join(' ');

const pool = new Pool({
  // PostgreSQL 连接地址；数据库相关环境变量仅保留 DATABASE_URL。
  connectionString,
  // 单个应用实例允许同时建立的最大物理连接数。
  max: maxConnections,
  // 空闲连接保留 5 分钟后回收，减少低频流量下的连接反复创建。
  idleTimeoutMillis: 300_000,
  // 建立新连接最多等待 30 秒，超时后让当前查询快速失败。
  connectionTimeoutMillis: 30_000,
  // 当前部署环境强制使用非 TLS 连接。
  ssl: false,
  // 以下 PostgreSQL 启动参数会应用到连接池中的每条物理连接。
  options: postgresOptions,
});

pool.on('error', (error) => {
  console.error('[postgres-pool] idle client error', {
    postgresCode: (error as Error & { code?: string }).code ?? null,
    poolTotal: pool.totalCount,
    poolIdle: pool.idleCount,
    poolWaiting: pool.waitingCount,
    error,
  });
});

export const db = drizzle(pool, {
  schema: {
    ...schema,
    ...betterAuthSchema,
  },
});

export type DbClient = typeof db;

export type DbTransaction = Parameters<
  Parameters<DbClient['transaction']>[0]
>[0];

export type DbExecutor = DbClient | DbTransaction;

export function getExecutor(tx?: DbTransaction): DbExecutor {
  return tx ?? db;
}

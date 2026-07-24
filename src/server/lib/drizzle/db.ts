import { betterAuthSchema } from '@server/lib/auth/schema';
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing DATABASE_URL');
}

const client = new SQL({
  // PostgreSQL 连接地址；数据库相关环境变量仅保留 DATABASE_URL。
  url: connectionString,
  // 单个应用实例允许同时建立的最大物理连接数。
  max: 20,
  // 空闲连接保留 5 分钟后回收，减少低频流量下的连接反复创建。
  idleTimeout: 300,
  // 建立新连接最多等待 30 秒，超时后让当前查询快速失败。
  connectionTimeout: 30,
  // 当前部署环境强制使用非 TLS 连接。
  tls: false,
  // 以下 PostgreSQL 启动参数会应用到连接池中的每条物理连接。
  connection: {
    // 默认先查找 Better Auth 表，再查找 public 中的业务表。
    search_path: 'better_auth,public',
    // 在 PostgreSQL 活动连接和慢查询日志中标识当前服务。
    application_name: 'daoyou-api',
    // 获取数据库锁最多等待 3 秒，避免请求长时间阻塞。
    lock_timeout: '3s',
    // 单条 SQL 最多执行 30 秒。
    statement_timeout: '30s',
    // 事务开启后若持续空闲 60 秒，由 PostgreSQL 主动终止。
    idle_in_transaction_session_timeout: '60s',
  },
  // 每条物理连接建立完成后记录结果。
  onconnect(error) {
    if (error) {
      console.error('[postgres] connection failed', error);
      return;
    }
    console.info('[postgres] connected');
  },
  // 每条物理连接关闭时区分正常回收与非预期故障。
  onclose(error) {
    if (
      (error as (Error & { code?: string }) | null)?.code ===
      'ERR_POSTGRES_IDLE_TIMEOUT'
    ) {
      console.info('[postgres] idle connection recycled');
      return;
    }
    if (error) {
      console.error('[postgres] connection closed with error', error);
      return;
    }
    console.info('[postgres] connection closed');
  },
});

export const db = drizzle(client, {
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

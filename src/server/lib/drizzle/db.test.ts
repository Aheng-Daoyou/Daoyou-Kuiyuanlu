import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: { options?: Record<string, unknown> } = {};
  const sqlClient = { kind: 'bun-sql-client' };
  const dbInstance = { kind: 'drizzle-db' };
  const SQL = vi.fn(function (
    this: unknown,
    options: Record<string, unknown>,
  ) {
    state.options = options;
    return sqlClient;
  });
  const drizzle = vi.fn(() => dbInstance);

  return { state, sqlClient, dbInstance, SQL, drizzle };
});

vi.mock('bun', () => ({ SQL: mocks.SQL }));
vi.mock('drizzle-orm/bun-sql', () => ({ drizzle: mocks.drizzle }));

const originalDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.state.options = undefined;
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/daoyou';
});

afterEach(() => {
  process.env.DATABASE_URL = originalDatabaseUrl;
});

describe('database singleton', () => {
  it('fails fast when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;

    await expect(import('./db')).rejects.toThrow('Missing DATABASE_URL');
    expect(mocks.SQL).not.toHaveBeenCalled();
  });

  it('creates one Bun SQL pool and one Drizzle database with fixed options', async () => {
    const module = await import('./db');

    expect(mocks.SQL).toHaveBeenCalledOnce();
    expect(mocks.state.options).toMatchObject({
      url: 'postgres://user:pass@localhost:5432/daoyou',
      max: 20,
      idleTimeout: 300,
      connectionTimeout: 30,
      tls: false,
      connection: {
        search_path: 'better_auth,public',
        application_name: 'daoyou-api',
        lock_timeout: '3s',
        statement_timeout: '30s',
        idle_in_transaction_session_timeout: '60s',
      },
    });
    expect(mocks.state.options).not.toHaveProperty('maxLifetime');
    expect(mocks.drizzle).toHaveBeenCalledOnce();
    expect(mocks.drizzle).toHaveBeenCalledWith(
      mocks.sqlClient,
      expect.objectContaining({
        schema: expect.objectContaining({
          user: expect.anything(),
          session: expect.anything(),
          account: expect.anything(),
          verification: expect.anything(),
        }),
      }),
    );
    expect(module.db).toBe(mocks.dbInstance);
  });

  it('returns the singleton database unless a transaction is supplied', async () => {
    const module = await import('./db');
    const transaction = { kind: 'transaction' };

    expect(module.getExecutor()).toBe(mocks.dbInstance);
    expect(module.getExecutor(transaction as never)).toBe(transaction);
  });

  it('logs connection lifecycle outcomes', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    await import('./db');
    const options = mocks.state.options as {
      onconnect: (error: Error | null) => void;
      onclose: (error: Error | null) => void;
    };

    options.onconnect(null);
    options.onclose(null);
    options.onconnect(new Error('connect failed'));
    options.onclose(new Error('connection lost'));
    options.onclose(
      Object.assign(new Error('idle timeout'), {
        code: 'ERR_POSTGRES_IDLE_TIMEOUT',
      }),
    );

    expect(info).toHaveBeenCalledWith('[postgres] connected');
    expect(info).toHaveBeenCalledWith('[postgres] connection closed');
    expect(info).toHaveBeenCalledWith('[postgres] idle connection recycled');
    expect(error).toHaveBeenCalledTimes(2);
  });
});

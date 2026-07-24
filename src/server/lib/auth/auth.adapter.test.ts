import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const db = { kind: 'database' };
  const adapter = { kind: 'better-auth-adapter' };

  return {
    db,
    adapter,
    drizzleAdapter: vi.fn(() => adapter),
    betterAuth: vi.fn((options) => ({ options })),
  };
});

vi.mock('@better-auth/drizzle-adapter', () => ({
  drizzleAdapter: mocks.drizzleAdapter,
}));
vi.mock('@better-auth/i18n', () => ({
  i18n: vi.fn(() => ({ id: 'i18n' })),
}));
vi.mock('better-auth', () => ({
  betterAuth: mocks.betterAuth,
}));
vi.mock('better-auth/plugins/email-otp', () => ({
  emailOTP: vi.fn(() => ({ id: 'email-otp' })),
}));
vi.mock('../drizzle/db', () => ({ db: mocks.db }));
vi.mock('../admin/smtp', () => ({ sendViaSmtp: vi.fn() }));
vi.mock('../http/origins', () => ({
  getPublicWebOrigins: vi.fn(() => ['http://localhost:5173']),
}));
vi.mock('../repositories/accountDeletionRepository', () => ({
  markAccountDeletionCompleted: vi.fn(),
  recordPendingAccountDeletion: vi.fn(),
}));
vi.mock('./cookieDomain', () => ({
  getCookieDomainConfig: vi.fn(() => undefined),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.BETTER_AUTH_SECRET = 'test-secret';
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
});

describe('Better Auth database adapter', () => {
  it('uses the shared Drizzle database with transactional pg settings', async () => {
    const { betterAuthSchema } = await import('./schema');
    const { auth, authSchemaName } = await import('./auth');

    expect(authSchemaName).toBe('better_auth');
    expect(mocks.drizzleAdapter).toHaveBeenCalledWith(mocks.db, {
      provider: 'pg',
      schema: betterAuthSchema,
      camelCase: true,
      transaction: true,
    });
    expect(mocks.betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({ database: mocks.adapter }),
    );
    expect(auth).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({ database: mocks.adapter }),
      }),
    );
  });
});

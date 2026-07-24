import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
  BETTER_AUTH_SCHEMA_NAME,
  betterAuthSchema,
} from './schema';

describe('Better Auth Drizzle schema', () => {
  it('maps the four Better Auth models to the fixed schema', () => {
    expect(BETTER_AUTH_SCHEMA_NAME).toBe('better_auth');
    expect(betterAuthSchema).toMatchObject({
      user: authUsers,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    });

    const tables = [
      authUsers,
      authSessions,
      authAccounts,
      authVerifications,
    ];
    expect(tables.map((table) => getTableConfig(table).name)).toEqual([
      'user',
      'session',
      'account',
      'verification',
    ]);
    for (const table of tables) {
      expect(getTableConfig(table).schema).toBe('better_auth');
    }
  });

  it('preserves the existing camelCase columns', () => {
    expect(getTableConfig(authUsers).columns.map((column) => column.name)).toEqual(
      [
        'id',
        'name',
        'email',
        'emailVerified',
        'image',
        'createdAt',
        'updatedAt',
      ],
    );
    expect(
      getTableConfig(authSessions).columns.map((column) => column.name),
    ).toContain('userId');
    expect(
      getTableConfig(authAccounts).columns.map((column) => column.name),
    ).toContain('accessTokenExpiresAt');
    expect(authUsers.id.getSQLType()).toBe('uuid');
    expect(authSessions.userId.getSQLType()).toBe('uuid');
    expect(authUsers.createdAt.getSQLType()).toBe('timestamp with time zone');
    expect(authSessions.expiresAt.getSQLType()).toBe(
      'timestamp with time zone',
    );
  });

  it('preserves foreign-key and index names from the existing database', () => {
    const [sessionForeignKey] = getTableConfig(authSessions).foreignKeys;
    const [accountForeignKey] = getTableConfig(authAccounts).foreignKeys;
    expect(sessionForeignKey?.getName()).toBe('session_userId_fkey');
    expect(sessionForeignKey?.reference()).toMatchObject({
      columns: [authSessions.userId],
      foreignColumns: [authUsers.id],
      foreignTable: authUsers,
    });
    expect(accountForeignKey?.getName()).toBe('account_userId_fkey');
    expect(accountForeignKey?.reference()).toMatchObject({
      columns: [authAccounts.userId],
      foreignColumns: [authUsers.id],
      foreignTable: authUsers,
    });
    expect(authUsers.email).toMatchObject({
      isUnique: true,
      uniqueName: 'user_email_key',
    });
    expect(authSessions.token).toMatchObject({
      isUnique: true,
      uniqueName: 'session_token_key',
    });
    expect(
      getTableConfig(authSessions).indexes.map((entry) => entry.config.name),
    ).toEqual(['session_userId_idx']);
    expect(
      getTableConfig(authAccounts).indexes.map((entry) => entry.config.name),
    ).toEqual(['account_userId_idx']);
    expect(
      getTableConfig(authVerifications).indexes.map(
        (entry) => entry.config.name,
      ),
    ).toEqual(['verification_identifier_idx']);
  });
});

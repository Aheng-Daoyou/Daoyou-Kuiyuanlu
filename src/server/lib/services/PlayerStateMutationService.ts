import { createHash } from 'node:crypto';
import { db, type DbTransaction } from '@server/lib/drizzle/db';
import {
  redisLockKeys,
  withRedisLock,
  type RedisLeaseContext,
} from '@server/lib/redis/lock';
import {
  bumpStateVersions,
  findPlayerMutationRequest,
  getOrCreateStateVersion,
  insertPlayerMutationRequest,
  insertStateEvents,
  lockCultivatorForStateMutation,
} from '@server/lib/repositories/playerStateRepository';
import { publishPlayerStateEvents } from '@server/lib/services/playerStateBroadcaster';
import type {
  PlayerStateDomain,
  PlayerStateDomainVersions,
  PlayerStateMutationMeta,
  PlayerStateMutationResponse,
} from '@shared/contracts/player';

const RETRYABLE_TRANSACTION_CODES = new Set(['40P01', '40001', '55P03']);
const MAX_TRANSACTION_ATTEMPTS = 3;
const SLOW_TRANSACTION_THRESHOLD_MS = 500;

export type StateChangeDescriptor = {
  domain: PlayerStateDomain;
  eventType: string;
  patch?: unknown;
  invalidates?: PlayerStateDomain[];
};

export class PlayerStateIdempotencyError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';
  readonly status = 409;
}

export type PlayerStateMutationArgs<T> = {
  userId: string;
  cultivatorId: string;
  source: string;
  requestId?: string | null;
  idempotency?: {
    key: string;
    fingerprint: string;
  };
  allowEmpty?: boolean;
  run: (tx: DbTransaction) => Promise<{
    result: T;
    changes: StateChangeDescriptor[];
  }>;
};

export type PlayerStateMutationCoordination =
  | {
      mode: 'redis';
      lease: RedisLeaseContext;
    }
  | {
      mode: 'database-only';
    };

type CommittedPlayerStateMutation<T> = {
  result: T;
  state: PlayerStateMutationMeta;
};

export async function commitPlayerStateMutation<T>(
  args: PlayerStateMutationArgs<T> & {
    coordination: PlayerStateMutationCoordination;
  },
): Promise<CommittedPlayerStateMutation<T>> {
  const lease =
    args.coordination.mode === 'redis'
      ? args.coordination.lease
      : undefined;
  lease?.assertHeld();
  return commitPlayerStateMutationTransaction(args, lease);
}

export async function commitPlayerStateMutationWithLock<T>(
  args: PlayerStateMutationArgs<T>,
): Promise<CommittedPlayerStateMutation<T>> {
  const lockKey = redisLockKeys.cultivatorMutation(args.cultivatorId);
  return withRedisLock(
    {
      key: lockKey,
      context: `player-state:${args.source}`,
      timeoutMs: 30_000,
      renewEveryMs: 10_000,
      retries: 0,
    },
    (lease) =>
      commitPlayerStateMutation({
        ...args,
        coordination: { mode: 'redis', lease },
      }),
  );
}

async function commitPlayerStateMutationTransaction<T>(
  args: PlayerStateMutationArgs<T>,
  lease?: RedisLeaseContext,
): Promise<CommittedPlayerStateMutation<T>> {
  const idempotency = args.idempotency
    ? normalizePlayerMutationIdempotency(args.idempotency)
    : undefined;
  const eventRequestId = normalizeNullablePlayerMutationField(
    args.requestId ?? idempotency?.key ?? null,
  );
  const committed = await runRetryableStateTransaction(async (retryAttempt) => {
    const startedAt = Date.now();

    try {
      const result = await db.transaction(async (tx) => {
        await lockCultivatorForStateMutation(tx, args.cultivatorId);

        if (idempotency) {
          const existing = await findPlayerMutationRequest(
            args.cultivatorId,
            args.source,
            idempotency.key,
            tx,
          );
          if (existing) {
            if (existing.requestFingerprint !== idempotency.fingerprint) {
              throw new PlayerStateIdempotencyError(
                '同一幂等键不能用于不同的玩家状态事务',
              );
            }
            const version = await getOrCreateStateVersion(
              args.cultivatorId,
              tx,
            );
            const replayed = {
              result: existing.result as T,
              state: {
                cultivatorId: args.cultivatorId,
                globalVersion: version.globalVersion,
                domainVersions: {},
                events: [],
                replayed: true,
              },
            };
            lease?.assertHeld();
            return replayed;
          }
        }

        const { result, changes } = await args.run(tx);

        if (changes.length === 0) {
          if (args.allowEmpty) {
            const version = await getOrCreateStateVersion(
              args.cultivatorId,
              tx,
            );
            const committed = {
              result,
              state: {
                cultivatorId: args.cultivatorId,
                globalVersion: version.globalVersion,
                domainVersions: {},
                events: [],
              },
            };
            if (idempotency)
              await insertPlayerMutationRequest(
                {
                  cultivatorId: args.cultivatorId,
                  source: args.source,
                  requestId: idempotency.key,
                  requestFingerprint: idempotency.fingerprint,
                  result,
                },
                tx,
              );
            lease?.assertHeld();
            return committed;
          }
          throw new Error('玩家状态写操作缺少状态变更描述');
        }

        const versions = await bumpStateVersions(
          tx,
          args.cultivatorId,
          changes.map((change) => change.domain),
        );
        const events = await insertStateEvents(tx, {
          userId: args.userId,
          cultivatorId: args.cultivatorId,
          globalVersion: versions.globalVersion,
          domainVersions: versions.domainVersions,
          events: changes.map((change) => ({
            ...change,
            source: args.source,
            requestId: eventRequestId,
          })),
        });

        const committed = {
          result,
          state: {
            cultivatorId: args.cultivatorId,
            globalVersion: versions.globalVersion,
            domainVersions: pickChangedDomainVersions(
              versions.domainVersions,
              changes.map((change) => change.domain),
            ),
            events,
          },
        };
        if (idempotency)
          await insertPlayerMutationRequest(
            {
              cultivatorId: args.cultivatorId,
              source: args.source,
              requestId: idempotency.key,
              requestFingerprint: idempotency.fingerprint,
              result,
            },
            tx,
          );
        lease?.assertHeld();
        return committed;
      });

      logTransaction('completed', args, retryAttempt, startedAt);
      return result;
    } catch (error) {
      logTransaction('failed', args, retryAttempt, startedAt, error);
      throw error;
    }
  });

  if (committed.state.events.length > 0) {
    publishPlayerStateEvents(args.cultivatorId, committed.state.events);
  }

  return committed;
}

export function toPlayerStateMutationResponse<T>(committed: {
  result: T;
  state: PlayerStateMutationMeta;
}): PlayerStateMutationResponse<T> {
  return {
    success: true,
    data: committed.result,
    state: committed.state,
  };
}

function pickChangedDomainVersions(
  domainVersions: PlayerStateDomainVersions,
  domains: PlayerStateDomain[],
): Partial<PlayerStateDomainVersions> {
  const uniqueDomains = Array.from(new Set(domains));
  return uniqueDomains.reduce<Partial<PlayerStateDomainVersions>>(
    (acc, domain) => {
      acc[domain] = domainVersions[domain];
      return acc;
    },
    {},
  );
}

function normalizePlayerMutationIdempotency(idempotency: {
  key: string;
  fingerprint: string;
}): {
  key: string;
  fingerprint: string;
} {
  return {
    key: normalizePlayerMutationField(idempotency.key),
    fingerprint: normalizePlayerMutationField(idempotency.fingerprint),
  };
}

function normalizeNullablePlayerMutationField(
  value: string | null,
): string | null {
  return value === null ? null : normalizePlayerMutationField(value);
}

function normalizePlayerMutationField(value: string): string {
  if (Buffer.byteLength(value, 'utf8') <= 128) {
    return value;
  }
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function runRetryableStateTransaction<T>(
  run: (attempt: number) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      if (
        attempt >= MAX_TRANSACTION_ATTEMPTS ||
        !isRetryableTransactionError(error)
      ) {
        throw error;
      }

      await sleep(getRetryDelayMs(attempt));
    }
  }

  throw lastError;
}

function logTransaction(
  outcome: 'completed' | 'failed',
  args: {
    source: string;
    cultivatorId: string;
    requestId?: string | null;
  },
  retryAttempt: number,
  startedAt: number,
  error?: unknown,
): void {
  const durationMs = Date.now() - startedAt;
  const details = {
    outcome,
    source: args.source,
    cultivatorId: args.cultivatorId,
    requestId: args.requestId ?? null,
    durationMs,
    retryAttempt,
    postgresCode: getPostgresErrorCode(error),
  };

  if (outcome === 'failed') {
    console.error('[player-state-transaction]', details);
    return;
  }
  if (durationMs >= SLOW_TRANSACTION_THRESHOLD_MS) {
    console.info('[player-state-transaction]', details);
  }
}

function getPostgresErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    RETRYABLE_TRANSACTION_CODES.has(
      String((error as { code?: unknown }).code ?? ''),
    )
  );
}

function getRetryDelayMs(attempt: number): number {
  const baseDelayMs = 25 * 2 ** (attempt - 1);
  return baseDelayMs + Math.floor(Math.random() * 15);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

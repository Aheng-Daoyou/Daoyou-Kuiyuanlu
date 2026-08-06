import type {
  BattleMatchCoordinator,
  BattleMatchLockPort,
  BattleMatchRepositoryPort,
} from '@shared/engine/battle-v5/match/BattleMatchCoordinator';
import type { BattleRoundResolutionV1 } from '@shared/engine/battle-v5/round/types';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '@server/lib/drizzle/db';
import { battleMatchResolutions, battleMatches } from '@server/lib/drizzle/schema';
import { BattleMatchCoordinator as BattleMatchCoordinatorImpl } from '@shared/engine/battle-v5/match/BattleMatchCoordinator';
import type { BattleMatchStateV1 } from '@shared/engine/battle-v5/match/types';
import { getRedisClient, redis } from '@server/lib/redis';
import { withRedisLock, redisLockKeys } from '@server/lib/redis/lock';
import { parseRedisJson } from '@server/lib/redis/json';
import {
  encodeNatsSubjectToken,
  publishNatsCoreMessage,
} from './natsCorePubSub';
import { createPubSubEnvelope } from './pubSubEnvelope';
import type { BattleMatchPublisherPort, BattleMatchCoordinatorEventV1 } from '@shared/engine/battle-v5/match/BattleMatchCoordinator';

const MATCH_KEY_PREFIX = 'battle:match:v1';

function matchKey(matchId: string): string {
  const normalized = matchId.trim();
  if (!normalized || normalized.includes(':')) {
    throw new Error('Battle match id is invalid');
  }
  return `${MATCH_KEY_PREFIX}:${normalized}`;
}

function assertState(state: BattleMatchStateV1): void {
  if (
    !state ||
    state.version !== 'battle_match_state_v1' ||
    !state.matchId ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0
  ) {
    throw new Error('Invalid battle match state');
  }
}

export class RedisBattleMatchRepository implements BattleMatchRepositoryPort {
  async listMatchIds(): Promise<string[]> {
    const client = getRedisClient();
    const ids: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        `${MATCH_KEY_PREFIX}:*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      ids.push(...keys.map((key) => key.slice(`${MATCH_KEY_PREFIX}:`.length)));
    } while (cursor !== '0');
    return ids;
  }

  async create(state: BattleMatchStateV1): Promise<boolean> {
    assertState(state);
    const result = await redis.set(
      matchKey(state.matchId),
      JSON.stringify(state),
      'NX',
    );
    return result === 'OK';
  }

  async load(matchId: string): Promise<BattleMatchStateV1 | null> {
    const state = parseRedisJson<BattleMatchStateV1>(
      await redis.get(matchKey(matchId)),
      `battle match ${matchId}`,
    );
    if (state) assertState(state);
    return state;
  }

  async save(
    state: BattleMatchStateV1,
    expectedRevision: number,
  ): Promise<boolean> {
    assertState(state);
    const key = matchKey(state.matchId);
    const client = getRedisClient();
    await client.watch(key);
    try {
      const current = parseRedisJson<BattleMatchStateV1>(
        await client.get(key),
        `battle match ${state.matchId}`,
      );
      if (!current || current.revision !== expectedRevision) {
        await client.unwatch();
        return false;
      }
      const result = await client.multi().set(key, JSON.stringify(state)).exec();
      return result !== null;
    } finally {
      await client.unwatch();
    }
  }
}

export class PostgresBattleMatchRepository implements BattleMatchRepositoryPort {
  async listExpiredMatchIds(now = new Date()): Promise<string[]> {
    const rows = await db
      .select({ matchId: battleMatches.matchId })
      .from(battleMatches)
      .where(
        and(
          eq(battleMatches.status, 'planning'),
          lte(battleMatches.deadlineAt, now),
        ),
      );
    return rows.map((row) => row.matchId);
  }

  async listResolvingMatchIds(): Promise<string[]> {
    const rows = await db
      .select({ matchId: battleMatches.matchId })
      .from(battleMatches)
      .where(eq(battleMatches.status, 'resolving'));
    return rows.map((row) => row.matchId);
  }

  async create(state: BattleMatchStateV1): Promise<boolean> {
    assertState(state);
    const inserted = await db
      .insert(battleMatches)
      .values(toMatchRow(state))
      .onConflictDoNothing({ target: battleMatches.matchId })
      .returning({ matchId: battleMatches.matchId });
    return inserted.length > 0;
  }

  async load(matchId: string): Promise<BattleMatchStateV1 | null> {
    const [row] = await db
      .select({ state: battleMatches.state })
      .from(battleMatches)
      .where(eq(battleMatches.matchId, matchId))
      .limit(1);
    if (!row) return null;
    assertState(row.state);
    return row.state;
  }

  async save(
    state: BattleMatchStateV1,
    expectedRevision: number,
  ): Promise<boolean> {
    assertState(state);
    const updated = await db
      .update(battleMatches)
      .set(toMatchRow(state))
      .where(
        and(
          eq(battleMatches.matchId, state.matchId),
          eq(battleMatches.revision, expectedRevision),
        ),
      )
      .returning({ matchId: battleMatches.matchId });
    return updated.length > 0;
  }

  async recordResolution(
    matchId: string,
    resolution: BattleRoundResolutionV1,
  ): Promise<void> {
    await db
      .insert(battleMatchResolutions)
      .values({
        matchId,
        round: resolution.round,
        commandSetId: resolution.commandSetId,
        checkpointRevision: resolution.checkpoint.checkpointRevision,
        resolution,
      })
      .onConflictDoNothing({
        target: [
          battleMatchResolutions.matchId,
          battleMatchResolutions.commandSetId,
        ],
      });
  }
}

function toMatchRow(state: BattleMatchStateV1) {
  return {
    matchId: state.matchId,
    status: state.status,
    revision: state.revision,
    checkpointRevision: state.battle.checkpoint.checkpointRevision,
    state,
    deadlineAt: state.planning ? new Date(state.planning.deadlineAt) : null,
    updatedAt: new Date(state.updatedAt),
  };
}

export class RedisBattleMatchLock implements BattleMatchLockPort {
  constructor(private readonly timeoutMs = 15_000) {}

  runExclusive<T>(matchId: string, operation: () => Promise<T>): Promise<T> {
    return withRedisLock(
      {
        key: redisLockKeys.battleMatch(matchId),
        timeoutMs: this.timeoutMs,
        context: `battle-match:${matchId}`,
      },
      async () => operation(),
    );
  }
}

export class NatsBattleMatchPublisher implements BattleMatchPublisherPort {
  publish(event: BattleMatchCoordinatorEventV1): Promise<void> {
    const subject = `daoyou.realtime.battle-match.${encodeNatsSubjectToken(event.matchId)}`;
    return publishNatsCoreMessage(
      subject,
      JSON.stringify(createPubSubEnvelope(event)),
    );
  }
}

export function createRedisBattleMatchCoordinator(): BattleMatchCoordinator {
  return new BattleMatchCoordinatorImpl({
    repository: new RedisBattleMatchRepository(),
    lock: new RedisBattleMatchLock(),
    publisher: new NatsBattleMatchPublisher(),
  });
}

export function createPostgresBattleMatchCoordinator(): BattleMatchCoordinator {
  return new BattleMatchCoordinatorImpl({
    repository: new PostgresBattleMatchRepository(),
    lock: new RedisBattleMatchLock(),
    publisher: new NatsBattleMatchPublisher(),
  });
}

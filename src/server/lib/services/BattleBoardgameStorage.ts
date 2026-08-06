import type { LogEntry, Server, State, StorageAPI } from 'boardgame.io';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '@server/lib/drizzle/db';
import {
  battleMatchGameStates,
  battleMatchResolutions,
  battleMatches,
} from '@server/lib/drizzle/schema';
import type { BattleBoardgameG } from './BattleBoardgameAdapter';
import {
  resolveBoardgameTimeout,
  resumeBoardgameResolution,
} from './BattleBoardgameAdapter';
import type { BattleMatchStateV1 } from '@shared/engine/battle-v5/match/types';
import { ROUND_PLANNING_TIMEOUT_MS } from '@shared/engine/battle-v5/round/types';
import type { BattleMatchSessionV1 } from '@shared/contracts/battle-matches';
import { isDeepStrictEqual } from 'node:util';

type StoredState = State<BattleBoardgameG>;

export type BattleBoardgamePlayerSessionV1 = BattleMatchSessionV1;

/** boardgame.io StorageAPI backed by the battle match tables. */
export class PostgresBattleBoardgameStorage implements StorageAPI.Async {
  type(): 1 {
    return 1;
  }

  async connect(): Promise<void> {}

  async hasMatch(matchID: string): Promise<boolean> {
    const [row] = await db
      .select({ matchId: battleMatchGameStates.matchId })
      .from(battleMatchGameStates)
      .where(eq(battleMatchGameStates.matchId, matchID))
      .limit(1);
    return Boolean(row);
  }

  async getPlayerSession(
    matchID: string,
    applicationPlayerId: string,
  ): Promise<BattleBoardgamePlayerSessionV1 | null> {
    const [row] = await db
      .select({ state: battleMatchGameStates.state, metadata: battleMatchGameStates.metadata })
      .from(battleMatchGameStates)
      .where(eq(battleMatchGameStates.matchId, matchID))
      .limit(1);
    if (!row) return null;
    const state = row.state as StoredState;
    const boardgameId = Object.entries(state.G.playerIdByBoardgameId).find(
      ([, playerId]) => playerId === applicationPlayerId,
    )?.[0];
    if (!boardgameId) return null;
    const metadata = row.metadata as Server.MatchData;
    const playerIndex = Number(boardgameId);
    if (!Number.isSafeInteger(playerIndex) || playerIndex < 0) return null;
    const player = metadata.players?.[playerIndex];
    if (!player?.name || typeof player.credentials !== 'string') return null;
    return {
      gameName: 'battle-v5-match',
      matchID,
      playerID: boardgameId,
      playerCredentials: player.credentials,
      serverOrigin: process.env.BATTLE_SERVER_PUBLIC_ORIGIN ?? 'http://localhost:3100',
    };
  }

  async createMatch(
    matchID: string,
    opts: StorageAPI.CreateMatchOpts,
  ): Promise<void> {
    const state = normalizeBoardgameState(matchID, opts.initialState as StoredState);
    const battle = toBattleState(state.G);
    await db.transaction(async (tx) => {
      await tx.insert(battleMatches).values(toBattleRow(battle));
      await tx.insert(battleMatchGameStates).values({
        matchId: matchID,
        state,
        initialState: state,
        metadata: opts.metadata,
        log: [],
      });
    });
  }

  async setState(
    matchID: string,
    state: State,
    deltalog: LogEntry[] = [],
  ): Promise<void> {
    const boardgameState = state as StoredState;
    const battle = toBattleState(boardgameState.G);
    if (battle.matchId !== matchID) {
      throw new Error('Boardgame match id does not match battle state');
    }
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          revision: battleMatches.revision,
          battleState: battleMatches.state,
          boardgameState: battleMatchGameStates.state,
          log: battleMatchGameStates.log,
        })
        .from(battleMatches)
        .innerJoin(
          battleMatchGameStates,
          eq(battleMatchGameStates.matchId, battleMatches.matchId),
        )
        .where(eq(battleMatches.matchId, matchID))
        .limit(1);
      if (!current) {
        throw new Error('Unknown battle boardgame match');
      }
      const previousBoardgameState = current.boardgameState as StoredState;
      if (boardgameState._stateID <= previousBoardgameState._stateID) {
        return;
      }
      if (boardgameState._stateID !== previousBoardgameState._stateID + 1) {
        throw new Error('Battle boardgame state id conflict');
      }
      const advancesBattle = current.revision === battle.revision - 1;
      const repeatsBattle =
        current.revision === battle.revision &&
        isDeepStrictEqual(current.battleState, battle);
      if (!advancesBattle && !repeatsBattle) {
        throw new Error('Battle boardgame state revision conflict');
      }
      if (advancesBattle) {
        const updated = await tx
          .update(battleMatches)
          .set(toBattleRow(battle))
          .where(
            and(
              eq(battleMatches.matchId, matchID),
              eq(battleMatches.revision, battle.revision - 1),
            ),
          )
          .returning({ matchId: battleMatches.matchId });
        if (updated.length === 0) {
          throw new Error('Battle boardgame state revision conflict');
        }
      }
      const previousLog = Array.isArray(current.log) ? current.log : [];
      const gameStateUpdated = await tx
        .update(battleMatchGameStates)
        .set({
          state: boardgameState,
          log: [...previousLog, ...deltalog],
          updatedAt: new Date(battle.updatedAt),
        })
        .where(eq(battleMatchGameStates.matchId, matchID))
        .returning({ matchId: battleMatchGameStates.matchId });
      if (gameStateUpdated.length === 0) {
        throw new Error('Battle boardgame state persistence failed');
      }
      const resolution = boardgameState.G.latestResolution;
      if (resolution) {
        await tx
          .insert(battleMatchResolutions)
          .values({
            matchId: matchID,
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
    });
  }

  async setMetadata(
    matchID: string,
    metadata: Server.MatchData,
  ): Promise<void> {
    await db
      .update(battleMatchGameStates)
      .set({ metadata })
      .where(eq(battleMatchGameStates.matchId, matchID));
  }

  async acceptPlayer(matchID: string, playerID: string, now = Date.now()): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const fetched = await this.fetch(matchID, { state: true });
      const current = fetched.state as StoredState;
      if (!current.G.playerIdByBoardgameId[playerID]) throw new Error('Unknown battle player slot');
      const accepted = current.G.acceptedBoardgamePlayerIds ?? Object.keys(current.G.playerIdByBoardgameId);
      if (accepted.includes(playerID)) return false;
      const acceptedBoardgamePlayerIds = [...accepted, playerID].sort();
      const allAccepted = acceptedBoardgamePlayerIds.length === current.G.controllers.length;
      const next: StoredState = {
        ...current,
        G: {
          ...current.G,
          acceptedBoardgamePlayerIds,
          planning: current.G.planning && allAccepted
            ? { ...current.G.planning, deadlineAt: now + ROUND_PLANNING_TIMEOUT_MS }
            : current.G.planning,
          revision: allAccepted ? current.G.revision + 1 : current.G.revision,
          updatedAt: allAccepted ? now : current.G.updatedAt,
        },
        _stateID: current._stateID + 1,
      };
      try {
        await this.setState(matchID, next);
        return true;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('state id conflict') || attempt === 2) throw error;
      }
    }
    return false;
  }

  async fetch<O extends StorageAPI.FetchOpts>(
    matchID: string,
    opts: O,
  ): Promise<StorageAPI.FetchResult<O>> {
    const [row] = await db
      .select()
      .from(battleMatchGameStates)
      .where(eq(battleMatchGameStates.matchId, matchID))
      .limit(1);
    if (!row) throw new Error(`Unknown boardgame match: ${matchID}`);
    const result: Record<string, unknown> = {};
    if (opts.state) result.state = row.state;
    if (opts.initialState) result.initialState = row.initialState;
    if (opts.metadata) result.metadata = row.metadata;
    if (opts.log) result.log = row.log;
    return result as StorageAPI.FetchResult<O>;
  }

  async wipe(matchID: string): Promise<void> {
    await db
      .delete(battleMatches)
      .where(eq(battleMatches.matchId, matchID));
  }

  async listMatches(): Promise<string[]> {
    const rows = await db
      .select({ matchId: battleMatchGameStates.matchId })
      .from(battleMatchGameStates);
    return rows.map((row) => row.matchId);
  }

  async listExpiredMatchIds(now = new Date()): Promise<string[]> {
    const rows = await db
      .select({ matchId: battleMatchGameStates.matchId })
      .from(battleMatchGameStates)
      .innerJoin(
        battleMatches,
        eq(battleMatches.matchId, battleMatchGameStates.matchId),
      )
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
      .select({ matchId: battleMatchGameStates.matchId })
      .from(battleMatchGameStates)
      .innerJoin(
        battleMatches,
        eq(battleMatches.matchId, battleMatchGameStates.matchId),
      )
      .where(eq(battleMatches.status, 'resolving'));
    return rows.map((row) => row.matchId);
  }

  async resolveExpired(matchID: string, now = Date.now()): Promise<boolean> {
    const fetched = await this.fetch(matchID, { state: true });
    const current = fetched.state as StoredState;
    if (
      current.G.status !== 'planning' ||
      !current.G.planning ||
      current.G.planning.deadlineAt > now
    ) {
      return false;
    }
    const next = resolveBoardgameTimeout(current.G, now);
    if (next === current.G) return false;
    await this.setState(matchID, {
      ...current,
      G: next,
      _stateID: current._stateID + 1,
      ctx:
        next.status === 'finished'
          ? {
              ...current.ctx,
              gameover: { result: next.latestResolution?.outcome },
            }
          : current.ctx,
    });
    return true;
  }

  async resumeResolving(matchID: string, now = Date.now()): Promise<boolean> {
    const fetched = await this.fetch(matchID, { state: true });
    const current = fetched.state as StoredState;
    if (current.G.status !== 'resolving' || !current.G.resolving) return false;
    const next = resumeBoardgameResolution(current.G, now);
    await this.setState(matchID, {
      ...current,
      G: next,
      _stateID: current._stateID + 1,
      ctx:
        next.status === 'finished'
          ? {
              ...current.ctx,
              gameover: { result: next.latestResolution?.outcome },
            }
          : current.ctx,
    });
    return true;
  }
}

function toBattleState(G: BattleBoardgameG): BattleMatchStateV1 {
  const battle = JSON.parse(JSON.stringify(G)) as Record<string, unknown>;
  delete battle.playerIdByBoardgameId;
  delete battle.acceptedBoardgamePlayerIds;
  return battle as unknown as BattleMatchStateV1;
}

function normalizeBoardgameState(
  matchID: string,
  state: StoredState,
): StoredState {
  if (!matchID || state.G.version !== 'battle_match_state_v1') {
    throw new Error('Invalid boardgame battle state');
  }
  return {
    ...state,
    G: { ...state.G, matchId: matchID },
  };
}

function toBattleRow(state: BattleMatchStateV1) {
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

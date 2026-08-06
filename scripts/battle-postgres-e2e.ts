import { Client } from 'boardgame.io/client';
import { SocketIO } from 'boardgame.io/multiplayer';
import { AttributeType, type TeamSlot } from '@shared/engine/battle-v5/core/types';
import { BattleRoster } from '@shared/engine/battle-v5/core/BattleRoster';
import { BattleRuntime } from '@shared/engine/battle-v5/runtime/BattleRuntime';
import { Unit } from '@shared/engine/battle-v5/units/Unit';
import { captureBattleCheckpoint, createBattleBlueprint } from '@shared/engine/battle-v5/persistence/BattleStateCodec';
import type { BattleSaveV1 } from '@shared/engine/battle-v5/persistence/types';
import { createBattleMatchState, transitionBattleMatch } from '@shared/engine/battle-v5/match/BattleMatchStateMachine';
import type { BattleMatchStateV1 } from '@shared/engine/battle-v5/match/types';
import { battleBoardgameClientGame } from '@shared/online-battle/BattleBoardgameClientGame';
import type { BattleMatchPlayerViewV1 } from '@shared/engine/battle-v5/match/types';

const baseUrl = process.env.BATTLE_SERVER_URL ?? 'http://127.0.0.1:3110';
const token = process.env.BATTLE_SERVER_API_TOKEN ?? 'e2e-token';
const gameName = 'battle-v5-match';

function createSave(matchId: string, teamSize: number): BattleSaveV1 {
  const runtime = new BattleRuntime();
  const units = ['a', 'b'].flatMap((teamId) =>
    Array.from({ length: teamSize }, (_, slot) =>
      new Unit(
        `${teamId}${slot}`,
        `${teamId}${slot}`,
        slot === 0 ? { [AttributeType.SPEED]: 10 } : {},
        { runtime, teamId, slot: slot as TeamSlot },
      ),
    ),
  );
  const roster = new BattleRoster(units);
  const blueprint = createBattleBlueprint(matchId, roster);
  return {
    version: 'battle_save_v1',
    blueprint,
    checkpoint: captureBattleCheckpoint({
      blueprint,
      roster,
      runtime,
      round: 0,
      checkpointRevision: 0,
    }),
  };
}

function makeState(matchId: string, deadlineAt: number): BattleMatchStateV1 {
  const save = createSave(matchId, 4);
  return createBattleMatchState({
    matchId,
    battle: save,
    controllers: save.blueprint.teams.flatMap((team) =>
      team.units.map((unit) => ({
        playerId: `user-${unit.id}`,
        teamId: team.id,
        unitIds: [unit.id],
      })),
    ),
    now: Date.now(),
    planningTimeoutMs: Math.max(1, deadlineAt - Date.now()),
  });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as T & { error?: string };
  if (!response.ok) throw new Error(`${response.status}: ${body?.error ?? 'request failed'}`);
  return body;
}

async function waitUntil(check: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('E2E wait timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function createAndJoin(state: BattleMatchStateV1, acceptedBoardgamePlayerIds?: readonly string[]) {
  const mapping = Object.fromEntries(
    state.controllers.map((controller, index) => [String(index), controller.playerId]),
  );
  const created = await request<{ matchID: string }>(`/games/${gameName}/create`, {
    method: 'POST',
    body: JSON.stringify({
      numPlayers: state.controllers.length,
      unlisted: true,
      setupData: { state, playerIdByBoardgameId: mapping, acceptedBoardgamePlayerIds },
    }),
  });
  const joined: Array<{ playerID: string; playerCredentials: string }> = [];
  for (const [index, controller] of state.controllers.entries()) {
    joined.push(
      await request(`/games/${gameName}/${created.matchID}/join`, {
        method: 'POST',
        body: JSON.stringify({ playerID: String(index), playerName: controller.playerId }),
      }),
    );
  }
  return { matchID: created.matchID, joined };
}

async function runInviteAcceptanceGate() {
  const state = makeState(`e2e-invite-${Date.now()}`, Date.now() + 30_000);
  const { matchID, joined } = await createAndJoin(state, ['0']);
  const invitedIndex = 1;
  const unitId = state.controllers[invitedIndex].unitIds[0];
  const client = Client({
    game: battleBoardgameClientGame,
    multiplayer: SocketIO({ server: baseUrl }),
    matchID,
    playerID: joined[invitedIndex].playerID,
    credentials: joined[invitedIndex].playerCredentials,
    debug: false,
  });
  try {
    client.start();
    await waitUntil(() => client.getState()?.isConnected === true);
    client.moves.submitIntent({ requestId: 'before-accept', unitId, intent: { kind: 'pass' } });
    await new Promise((resolve) => setTimeout(resolve, 250));
    let view = client.getState()?.G as BattleMatchPlayerViewV1 | undefined;
    if (view?.ownSubmissions[unitId]) throw new Error('invited player moved before accepting');
    await request(`/internal/battle-matches/${matchID}/accept`, {
      method: 'POST', body: JSON.stringify({ playerID: joined[invitedIndex].playerID }),
    });
    client.moves.submitIntent({ requestId: 'after-accept', unitId, intent: { kind: 'pass' } });
    await waitUntil(() => {
      view = client.getState()?.G as BattleMatchPlayerViewV1 | undefined;
      return view?.ownSubmissions[unitId]?.kind === 'pass';
    });
    console.log('postgres e2e invitation acceptance gate passed', { matchID });
  } finally {
    client.stop();
  }
}

async function runLockedOnline() {
  const state = makeState(`e2e-locked-${Date.now()}`, Date.now() + 30_000);
  const { matchID, joined } = await createAndJoin(state);
  const clients = joined.map((entry) =>
    Client({
      game: battleBoardgameClientGame,
      multiplayer: SocketIO({ server: baseUrl }),
      matchID,
      playerID: entry.playerID,
      credentials: entry.playerCredentials,
      debug: false,
    }),
  );
  try {
    clients.forEach((client) => client.start());
    await waitUntil(() => clients.every((client) => client.getState()?.isConnected));
    for (const [index, controller] of state.controllers.entries()) {
      for (const unitId of controller.unitIds) {
        clients[index].moves.submitIntent({
          requestId: `intent-${unitId}`,
          unitId,
          intent: { kind: 'pass' },
        });
      }
      clients[index].moves.lockPlayer({ requestId: `lock-${controller.playerId}` });
    }
    await waitUntil(() => {
      const view = clients[0].getState()?.G as BattleMatchPlayerViewV1 | undefined;
      return view?.latestResolution?.round === 1;
    });
    console.log('postgres e2e 4v4 locked online passed', { matchID });
  } finally {
    clients.forEach((client) => client.stop());
  }
}

async function runTimeout() {
  const state = makeState(`e2e-timeout-${Date.now()}`, Date.now() + 500);
  const { matchID, joined } = await createAndJoin(state);
  const client = Client({
    game: battleBoardgameClientGame,
    multiplayer: SocketIO({ server: baseUrl }),
    matchID,
    playerID: joined[0].playerID,
    credentials: joined[0].playerCredentials,
    debug: false,
  });
  try {
    client.start();
    await waitUntil(() => client.getState()?.isConnected === true);
    await waitUntil(() => {
      const view = client.getState()?.G as BattleMatchPlayerViewV1 | undefined;
      return view?.latestResolution?.round === 1;
    }, 8_000);
    console.log('postgres e2e timeout worker passed', { matchID });
  } finally {
    client.stop();
  }
}

async function runResolvingRecovery() {
  const initial = makeState(`e2e-recovery-${Date.now()}`, Date.now() - 1);
  const transition = transitionBattleMatch(initial, {
    type: 'resolve_planning_timeout',
    matchId: initial.matchId,
    requestId: 'recovery-timeout',
    expectedMatchRevision: initial.revision,
    expectedCheckpointRevision: initial.battle.checkpoint.checkpointRevision,
  }, Date.now());
  if (transition.state.status !== 'resolving') throw new Error('failed to build resolving fixture');
  const { matchID, joined } = await createAndJoin(transition.state);
  const client = Client({
    game: battleBoardgameClientGame,
    multiplayer: SocketIO({ server: baseUrl }),
    matchID,
    playerID: joined[0].playerID,
    credentials: joined[0].playerCredentials,
    debug: false,
  });
  try {
    client.start();
    await waitUntil(() => client.getState()?.isConnected === true);
    await waitUntil(() => {
      const view = client.getState()?.G as BattleMatchPlayerViewV1 | undefined;
      return view?.latestResolution?.round === 1;
    }, 8_000);
    console.log('postgres e2e resolving recovery passed', { matchID });
  } finally {
    client.stop();
  }
}

await runLockedOnline();
await runInviteAcceptanceGate();
await runTimeout();
await runResolvingRecovery();

import { describe, expect, it } from 'vitest';
import type { BattleMatchPlayerViewV1 } from '@shared/engine/battle-v5/match/types';
import {
  createBattlePresentationSnapshot,
} from './BattlePresentation';

function view(): BattleMatchPlayerViewV1 {
  return {
    version: 'battle_match_player_view_v1',
    matchId: 'online-test',
    status: 'planning',
    revision: 4,
    playerId: 'p-a',
    teamId: 'alpha',
    controlledUnitIds: ['a0'],
    round: 2,
    checkpointRevision: 3,
    deadlineAt: 40_000,
    serverNow: 15_000,
    publicSnapshot: {
      version: 'battle_public_snapshot_v1',
      battleId: 'online-test',
      round: 2,
      checkpointRevision: 3,
      units: [
        {
          unitId: 'a0',
          teamId: 'alpha',
          slot: 0,
          name: '甲',
          alive: true,
          hp: { current: 90, max: 100, percent: 90 },
          mp: { current: 40, max: 60, percent: 66.67 },
          shield: 5,
          effects: [{
            id: 'focus-buff',
            label: '凝神',
            statusType: 'buff',
            layers: 2,
            remainingActions: 2,
            permanent: false,
          }],
          combatResources: [{ id: 'sword', name: '剑意', icon: '剑', current: 2, max: 5 }],
          actionStates: [{ id: 'queued:slash', type: 'queued_action', label: '蓄势', remainingActions: 1 }],
        },
        {
          unitId: 'b0',
          teamId: 'beta',
          slot: 0,
          name: '乙',
          alive: false,
          hp: { current: 0, max: 100, percent: 0 },
          mp: { current: 20, max: 60, percent: 33.33 },
          shield: 0,
          effects: [],
          combatResources: [],
          actionStates: [],
        },
      ],
    },
    ownSubmissions: {},
    lockedPlayerIds: [],
  };
}

describe('BattlePresentation', () => {
  it('maps the viewer team to allies and the opponent to enemies', () => {
    const snapshot = createBattlePresentationSnapshot(view());
    expect(snapshot.version).toBe('battle_presentation_snapshot_v1');
    expect(snapshot.entities.map((entity) => entity.team)).toEqual([
      'allies',
      'enemies',
    ]);
    expect(snapshot.entities[0]).toMatchObject({
      id: 'a0',
      hp: 90,
      qi: 40,
      shield: 5,
      effects: [expect.objectContaining({ id: 'focus-buff', tone: 'buff' })],
      combatResources: [expect.objectContaining({ id: 'sword', current: 2 })],
      actionStates: [expect.objectContaining({ id: 'queued:slash', tone: 'preparing' })],
    });
    expect(snapshot.elapsedMs).toBe(5_000);
    expect(snapshot.focusedEntityId).toBe('a0');
  });

  it('preserves a valid focus while falling back to a live owned unit', () => {
    const next = createBattlePresentationSnapshot(view(), 'b0');
    expect(next.focusedEntityId).toBe('b0');

    const fallback = createBattlePresentationSnapshot(view(), 'missing');
    expect(fallback.focusedEntityId).toBe('a0');
  });
});

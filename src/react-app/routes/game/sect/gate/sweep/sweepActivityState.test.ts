import type { SectTasksData, SectTaskViewData } from '@shared/contracts/sect';
import { describe, expect, it } from 'vitest';
import {
  resolveSweepActivityMode,
  sweepActivityMessage,
} from './sweepActivityState';

function tasksWith(state: SectTaskViewData['state']): SectTasksData {
  return {
    dateKey: '2026-07-23',
    weekKey: '2026-W30',
    items: [
      {
        id: 'record',
        definitionId: 'gate_sweep',
        kind: 'daily',
        state,
        periodKey: '2026-07-23',
        progress: {
          current: state === 'claimable' || state === 'claimed' ? 1 : 0,
          target: 1,
        },
        difficulty: 'easy',
        reward: {
          policyKey: 'sect.reward.realm-task',
          policyVersion: 1,
          difficulty: 'easy',
          contribution: 25,
          cultivationExp: 100,
          spiritStones: 1_000,
          summary: [],
        },
        presentation: {
          title: '清扫山门',
          description: '清理山门步道。',
          metadata: ['日常委托'],
        },
        actions: [],
      },
    ],
  };
}

describe('sweep activity mode', () => {
  it('uses reward mode only for an accepted active sweep task', () => {
    expect(resolveSweepActivityMode(tasksWith('active'))).toMatchObject({
      kind: 'reward',
      task: { definitionId: 'gate_sweep' },
    });
  });

  it('keeps offered, settled and locked tasks playable as practice', () => {
    expect(resolveSweepActivityMode(tasksWith('offered'))).toMatchObject({
      kind: 'practice',
      reason: 'not_accepted',
    });
    expect(resolveSweepActivityMode(tasksWith('claimable'))).toMatchObject({
      kind: 'practice',
      reason: 'settled',
    });
    expect(resolveSweepActivityMode(tasksWith('locked'))).toMatchObject({
      kind: 'practice',
      reason: 'locked',
    });
  });

  it('makes the no-reward boundary explicit', () => {
    const mode = resolveSweepActivityMode(tasksWith('claimed'));
    expect(sweepActivityMessage(mode)).toContain('自由练习');
    expect(sweepActivityMessage(mode)).toContain('不会重复结算');
  });
});

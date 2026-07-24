import { describe, expect, it } from 'vitest';
import {
  SECT_TASK_DIFFICULTY_MULTIPLIER_BPS,
  calculateRealmSectTaskReward,
} from './taskRewards';

describe('sect task rewards', () => {
  it('uses ordered difficulty multipliers', () => {
    expect(Object.values(SECT_TASK_DIFFICULTY_MULTIPLIER_BPS)).toEqual([
      10_000, 11_500, 13_500, 16_000,
    ]);
    const rewards = (['easy', 'normal', 'hard', 'elite'] as const).map(
      (difficulty) =>
        calculateRealmSectTaskReward({
          realm: '金丹',
          realmStage: '初期',
          difficulty,
          reward: { baseContribution: 40, frequencyBps: 10_000 },
        }),
    );
    expect(rewards.map((item) => item.contribution)).toEqual([40, 46, 54, 64]);
    expect(rewards.map((item) => item.spiritStones)).toEqual([
      3_000, 3_500, 4_100, 4_800,
    ]);
  });

  it('increases rewards for higher realms and weekly frequency', () => {
    const daily = calculateRealmSectTaskReward({
      realm: '筑基',
      realmStage: '中期',
      difficulty: 'normal',
      reward: { baseContribution: 30, frequencyBps: 10_000 },
    });
    const weekly = calculateRealmSectTaskReward({
      realm: '元婴',
      realmStage: '中期',
      difficulty: 'normal',
      reward: { baseContribution: 30, frequencyBps: 30_000 },
    });
    expect(weekly.spiritStones).toBeGreaterThan(daily.spiritStones);
    expect(weekly.cultivationExp).toBeGreaterThan(daily.cultivationExp);
  });
});

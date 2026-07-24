import { calculateSceneCultivationExp } from '@shared/engine/cultivation/ExpBudgetCalculator';
import type { DailyTaskDifficulty } from '@shared/engine/cultivation/exp-gain-strategies/types';
import {
  REALM_ORDER,
  type RealmStage,
  type RealmType,
} from '@shared/types/constants';
import { z } from 'zod';

export const SECT_TASK_DIFFICULTY_MULTIPLIER_BPS = {
  easy: 10_000,
  normal: 11_500,
  hard: 13_500,
  elite: 16_000,
} as const satisfies Record<DailyTaskDifficulty, number>;

export const SectTaskRewardSnapshotSchema = z
  .object({
    policyKey: z.string().min(1).max(128),
    policyVersion: z.number().int().positive(),
    difficulty: z.enum(['easy', 'normal', 'hard', 'elite']),
    contribution: z.number().int().nonnegative(),
    cultivationExp: z.number().int().nonnegative(),
    spiritStones: z.number().int().nonnegative(),
    summary: z.array(z.string().min(1).max(128)).max(8),
  })
  .strict();

export type SectTaskRewardSnapshot = z.infer<
  typeof SectTaskRewardSnapshotSchema
>;

export interface RealmTaskRewardInput {
  baseContribution: number;
  frequencyBps: number;
}

function safeRound(value: number, label: string): number {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || rounded < 0)
    throw new Error(`宗门任务${label}奖励无效`);
  return rounded;
}

export function calculateRealmSectTaskReward(input: {
  realm: RealmType;
  realmStage: RealmStage;
  difficulty: DailyTaskDifficulty;
  reward: RealmTaskRewardInput;
}): SectTaskRewardSnapshot {
  if (
    !Number.isSafeInteger(input.reward.baseContribution) ||
    input.reward.baseContribution < 0 ||
    !Number.isSafeInteger(input.reward.frequencyBps) ||
    input.reward.frequencyBps <= 0
  )
    throw new Error('宗门任务奖励配置无效');
  const difficultyBps = SECT_TASK_DIFFICULTY_MULTIPLIER_BPS[input.difficulty];
  const contribution = safeRound(
    (input.reward.baseContribution * difficultyBps) / 10_000,
    '贡献',
  );
  const frequencyMultiplier = input.reward.frequencyBps / 10_000;
  const realmStoneBase = (REALM_ORDER[input.realm] + 1) * 1_000;
  const spiritStones = safeRound(
    Math.round(
      (realmStoneBase * input.reward.frequencyBps * difficultyBps) /
        10_000_000_000,
    ) * 100,
    '灵石',
  );
  const cultivationExp = safeRound(
    calculateSceneCultivationExp('daily_task', {
      realm: input.realm,
      realmStage: input.realmStage,
      difficulty: input.difficulty,
    }).baseExp * frequencyMultiplier,
    '修为',
  );
  return SectTaskRewardSnapshotSchema.parse({
    policyKey: 'sect.reward.realm-task',
    policyVersion: 1,
    difficulty: input.difficulty,
    contribution,
    cultivationExp,
    spiritStones,
    summary: [
      `宗门贡献 +${contribution}`,
      `修为 +${cultivationExp}`,
      `灵石 +${spiritStones}`,
    ],
  });
}

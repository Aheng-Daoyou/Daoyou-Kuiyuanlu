import type { DailyTaskDifficulty } from '@shared/engine/cultivation/exp-gain-strategies/types';
import {
  REALM_STAGE_VALUES,
  REALM_VALUES,
  type RealmStage,
  type RealmType,
} from '@shared/types/constants';
import { z } from 'zod';
import {
  SectDeliveryRequirementSchema,
  type SectDeliveryRequirement,
} from './taskRequirements';
import {
  SectTaskRewardSnapshotSchema,
  type SectTaskRewardSnapshot,
} from './taskRewards';

export const SectTaskOfferSnapshotSchema = z
  .object({
    schemaVersion: z.literal(2),
    rulesVersion: z.number().int().positive(),
    anchorRealm: z.enum(REALM_VALUES),
    anchorRealmStage: z.enum(REALM_STAGE_VALUES),
    periodKey: z.string().min(1).max(32),
    executorKey: z.string().min(1).max(128),
    requirement: SectDeliveryRequirementSchema.optional(),
    difficulty: z.enum(['easy', 'normal', 'hard', 'elite']),
    reward: SectTaskRewardSnapshotSchema.optional(),
  })
  .strict();

export type SectTaskOfferSnapshot = z.infer<
  typeof SectTaskOfferSnapshotSchema
>;

export const SectSubmittedItemSnapshotSchema = z
  .object({
    itemId: z.string().min(1).max(128),
    kind: z.enum(['pill', 'artifact', 'material']),
    name: z.string().min(1).max(100),
    quality: z.string().min(1).max(20),
    quantity: z.number().int().positive().max(99),
    matchedFacts: z.array(z.string().min(1).max(128)).max(16),
  })
  .strict();

export type SectSubmittedItemSnapshot = z.infer<
  typeof SectSubmittedItemSnapshotSchema
>;

const SectTaskCompletionDataSchema = z
  .object({
    submittedItems: z
      .array(SectSubmittedItemSnapshotSchema)
      .min(1)
      .max(99),
  })
  .strict();

export const SectTaskRecordPayloadSchema = z
  .object({
    schemaVersion: z.literal(2),
    target: z.number().int().positive(),
    offer: SectTaskOfferSnapshotSchema,
    executorData: z.record(z.string(), z.unknown()),
    completionData: SectTaskCompletionDataSchema.optional(),
  })
  .strict();

export type SectTaskRecordPayload = z.infer<
  typeof SectTaskRecordPayloadSchema
>;

export function createSectTaskOfferSnapshot(input: {
  rulesVersion: number;
  anchorRealm: RealmType;
  anchorRealmStage: RealmStage;
  periodKey: string;
  executorKey: string;
  requirement?: SectDeliveryRequirement;
  difficulty: DailyTaskDifficulty;
  reward?: SectTaskRewardSnapshot;
}): SectTaskOfferSnapshot {
  return SectTaskOfferSnapshotSchema.parse({
    schemaVersion: 2,
    rulesVersion: input.rulesVersion,
    anchorRealm: input.anchorRealm,
    anchorRealmStage: input.anchorRealmStage,
    periodKey: input.periodKey,
    executorKey: input.executorKey,
    ...(input.requirement ? { requirement: input.requirement } : {}),
    difficulty: input.difficulty,
    ...(input.reward ? { reward: input.reward } : {}),
  });
}

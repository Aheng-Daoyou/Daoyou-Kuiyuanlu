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

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function revisionHash(value: unknown): string {
  const source = canonicalize(value);
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

export const SectTaskOfferSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    rulesVersion: z.number().int().positive(),
    offerRevision: z.string().min(16).max(64),
    anchorRealm: z.enum(REALM_VALUES),
    anchorRealmStage: z.enum(REALM_STAGE_VALUES),
    periodKey: z.string().min(1).max(32),
    executorKey: z.string().min(1).max(128),
    requirement: SectDeliveryRequirementSchema.optional(),
    difficulty: z.enum(['easy', 'normal', 'hard', 'elite']),
    reward: SectTaskRewardSnapshotSchema.optional(),
  })
  .strict();

export type SectTaskOfferSnapshot = z.infer<typeof SectTaskOfferSnapshotSchema>;

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

export const SectTaskRecordPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    target: z.number().int().positive(),
    offer: SectTaskOfferSnapshotSchema,
    executorData: z.record(z.string(), z.unknown()),
    completionData: z
      .object({
        submittedItem: SectSubmittedItemSnapshotSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SectTaskRecordPayload = z.infer<typeof SectTaskRecordPayloadSchema>;

export function createSectTaskOfferSnapshot(input: {
  rulesVersion: number;
  membershipId: string;
  taskId: string;
  anchorRealm: RealmType;
  anchorRealmStage: RealmStage;
  periodKey: string;
  executorKey: string;
  requirement?: SectDeliveryRequirement;
  difficulty: DailyTaskDifficulty;
  reward?: SectTaskRewardSnapshot;
}): SectTaskOfferSnapshot {
  const base = {
    schemaVersion: 1 as const,
    rulesVersion: input.rulesVersion,
    anchorRealm: input.anchorRealm,
    anchorRealmStage: input.anchorRealmStage,
    periodKey: input.periodKey,
    executorKey: input.executorKey,
    ...(input.requirement ? { requirement: input.requirement } : {}),
    difficulty: input.difficulty,
    ...(input.reward ? { reward: input.reward } : {}),
  };
  return SectTaskOfferSnapshotSchema.parse({
    ...base,
    offerRevision: revisionHash({
      ...base,
      membershipId: input.membershipId,
      taskId: input.taskId,
    }),
  });
}

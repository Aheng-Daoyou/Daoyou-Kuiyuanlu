import { SectDeliveryRequirementSchema } from '@shared/engine/sect/core/organization/taskRequirements';
import { SectTaskRewardSnapshotSchema } from '@shared/engine/sect/core/organization/taskRewards';
import { z } from 'zod';
import type {
  SectConstructionBoardData,
  SectConstructionMemberData,
  SectContributionRankingData,
  SectContextData,
  SectInfrastructureData,
  SectMembersData,
  SectProgressionData,
  SectShopData,
  SectTasksData,
} from '../sect';

export const SECT_RESOURCE_TOPICS = [
  'sect.membership',
  'sect.members',
  'sect.contribution-ranking',
  'sect.infrastructure',
  'sect.progression',
  'sect.tasks',
  'sect.shop',
  'sect.construction-board',
  'sect.construction-member',
] as const;

export type SectResourceTopic = (typeof SECT_RESOURCE_TOPICS)[number];

export interface SectResourceDataMap {
  'sect.membership': SectContextData;
  'sect.members': SectMembersData;
  'sect.contribution-ranking': SectContributionRankingData;
  'sect.infrastructure': SectInfrastructureData;
  'sect.progression': SectProgressionData;
  'sect.tasks': SectTasksData;
  'sect.shop': SectShopData;
  'sect.construction-board': SectConstructionBoardData;
  'sect.construction-member': SectConstructionMemberData;
}

const sectPathStateSchema = z
  .object({
    pathId: z.string(),
    unlockedLayerIds: z.array(z.string()),
    tacticId: z.string(),
    activeMeridianSlot: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    meridianLoadouts: z.array(
      z
        .object({
          slot: z.union([z.literal(1), z.literal(2), z.literal(3)]),
          nodeIds: z.array(z.string()),
          version: z.number(),
        })
        .strict(),
    ),
  })
  .strict();
const sectTaskDialoguePresentationSchema = z
  .object({
    offeredReply: z.string(),
    activeReply: z.string(),
    claimableReply: z.string(),
    claimedReply: z.string(),
    instruction: z
      .array(
        z
          .object({
            text: z.string(),
            emphasis: z
              .enum(['quantity', 'quality', 'effect', 'appearance', 'warning'])
              .optional(),
          })
          .strict(),
      )
      .readonly(),
  })
  .strict();
export const sectTaskViewSchema = z
  .object({
    id: z.string(),
    definitionId: z.string(),
    kind: z.enum(['daily', 'weekly', 'promotion']),
    state: z.enum(['offered', 'active', 'claimable', 'claimed', 'locked']),
    periodKey: z.string(),
    progress: z.object({ current: z.number(), target: z.number() }).strict(),
    difficulty: z.enum(['easy', 'normal', 'hard', 'elite']).optional(),
    requirement: SectDeliveryRequirementSchema.optional(),
    reward: SectTaskRewardSnapshotSchema.optional(),
    presentation: z
      .object({
        title: z.string(),
        description: z.string(),
        dialogue: sectTaskDialoguePresentationSchema,
      })
      .strict(),
    actions: z.array(
      z
        .object({
          key: z.string(),
          renderer: z.string(),
          label: z.string(),
          enabled: z.boolean(),
          disabledReason: z.string().optional(),
          parameters: z.record(z.string(), z.json()).optional(),
        })
        .strict(),
    ),
  })
  .strict();
const sectShopItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    requiredRank: z.enum(['registered', 'outer', 'inner', 'true']),
    price: z.number(),
    stock: z.number(),
    purchased: z.number(),
    kind: z.string(),
    rotating: z.boolean(),
  })
  .strict();

export const SECT_RESOURCE_DATA_SCHEMAS = {
  'sect.membership': z
    .object({
      sectId: z.string(),
      membershipId: z.string(),
      status: z.enum(['prospect', 'active']),
      joinedAt: z.string().optional(),
      discipleRank: z.enum(['registered', 'outer', 'inner', 'true']),
      contribution: z.number(),
      office: z.enum(['none', 'steward', 'protector', 'elder']),
      promotedAt: z.string().optional(),
      permissions: z.record(
        z.string(),
        z
          .object({
            granted: z.boolean(),
            requiredRank: z
              .enum(['registered', 'outer', 'inner', 'true'])
              .optional(),
            reason: z.string().optional(),
            reasonCode: z
              .enum(['rank_locked', 'version_locked', 'content_locked'])
              .optional(),
          })
          .strict(),
      ),
      configVersion: z.number().int().nonnegative(),
    })
    .strict(),
  'sect.members': z
    .object({
      items: z.array(
        z
          .object({
            cultivatorId: z.string().uuid(),
            name: z.string(),
            realm: z.string(),
            realmStage: z.string(),
            discipleRank: z.enum(['registered', 'outer', 'inner', 'true']),
            office: z.enum(['none', 'steward', 'protector', 'elder']),
            joinedAt: z.string().optional(),
            activityState: z.enum([
              'online',
              'active_today',
              'active_7d',
              'inactive',
            ]),
          })
          .strict(),
      ),
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      total: z.number().int().nonnegative(),
    })
    .strict(),
  'sect.contribution-ranking': z
    .object({
      metric: z.literal('current_balance'),
      generatedAt: z.string(),
      entries: z
        .array(
          z
            .object({
              rank: z.number().int().positive(),
              cultivatorId: z.string().uuid(),
              name: z.string(),
              discipleRank: z.enum(['registered', 'outer', 'inner', 'true']),
              office: z.enum(['none', 'steward', 'protector', 'elder']),
              contribution: z.number().int().nonnegative(),
            })
            .strict(),
        )
        .max(20),
      currentMember: z
        .object({
          rank: z.number().int().positive(),
          cultivatorId: z.string().uuid(),
          name: z.string(),
          discipleRank: z.enum(['registered', 'outer', 'inner', 'true']),
          office: z.enum(['none', 'steward', 'protector', 'elder']),
          contribution: z.number().int().nonnegative(),
        })
        .strict(),
    })
    .strict(),
  'sect.infrastructure': z
    .object({
      facilities: z.array(
        z
          .object({
            key: z.string(),
            level: z.number(),
            updatedAt: z.string().optional(),
          })
          .strict(),
      ),
      project: z
        .object({
          id: z.string(),
          sectId: z.string(),
          facilityKey: z.string(),
          targetLevel: z.number(),
          progress: z.number(),
          target: z.number(),
          status: z.enum(['active', 'completed']),
          startedWeekKey: z.string(),
          completedAt: z.string().optional(),
        })
        .strict()
        .nullable(),
    })
    .strict(),
  'sect.progression': z
    .object({
      activePathId: z.string().optional(),
      methods: z.record(z.string(), z.number()),
      paths: z.array(sectPathStateSchema),
      abilityLoadout: z.tuple([
        z.string().nullable(),
        z.string().nullable(),
        z.string().nullable(),
        z.string().nullable(),
      ]),
    })
    .strict(),
  'sect.tasks': z
    .object({
      dateKey: z.string(),
      weekKey: z.string(),
      items: z.array(sectTaskViewSchema),
    })
    .strict(),
  'sect.shop': z
    .object({
      weekKey: z.string(),
      contribution: z.number(),
      items: z.array(sectShopItemSchema),
    })
    .strict(),
  'sect.construction-board': z
    .object({
      demands: z.array(
        z
          .object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            kind: z.string(),
            quantity: z.number(),
            contribution: z.number(),
            constructionPoints: z.number(),
            minQuality: z.string().optional(),
            pillFamily: z.string().optional(),
          })
          .strict(),
      ),
      dailyContributionCap: z.number(),
      recentActivity: z.array(
        z
          .object({
            id: z.string(),
            memberName: z.string(),
            demandId: z.string(),
            contribution: z.number(),
            constructionPoints: z.number(),
            createdAt: z.string(),
          })
          .strict(),
      ),
    })
    .strict(),
  'sect.construction-member': z
    .object({ donatedContributionToday: z.number() })
    .strict(),
} satisfies {
  [TTopic in SectResourceTopic]: z.ZodType<SectResourceDataMap[TTopic]>;
};

import {
  createSectTaskOfferSnapshot,
  SectTaskRecordPayloadSchema,
  type SectTaskDefinition,
  type SectTaskOfferPolicyDefinition,
  type SectTaskOfferSnapshot,
  type SectTaskRecordPayload,
} from '@shared/engine/sect';
import type { RealmStage, RealmType } from '@shared/types/constants';
import { organizationError } from './applicationSupport';
import type {
  SectTaskOfferPolicyRegistry,
  SectTaskRewardPolicyRegistry,
} from './SectTaskSettlement';

export class SectTaskOfferService {
  constructor(
    private readonly offers: SectTaskOfferPolicyRegistry,
    private readonly rewards: SectTaskRewardPolicyRegistry,
  ) {}

  create(input: {
    definition: SectTaskDefinition;
    membershipId: string;
    periodKey: string;
    realm: RealmType;
    realmStage: RealmStage;
    executorKey: string;
    offer?: SectTaskOfferPolicyDefinition;
  }): SectTaskOfferSnapshot {
    const offerDefinition = input.offer;
    const offerPolicy = offerDefinition
      ? this.offers.require(offerDefinition.policy)
      : undefined;
    const rewardDefinition = input.definition.reward;
    const rewardPolicy = rewardDefinition
      ? this.rewards.require(rewardDefinition.policy)
      : undefined;
    const rulesVersion =
      1 + (offerPolicy?.version ?? 0) * 100 + (rewardPolicy?.version ?? 0);
    const offerResult = offerPolicy
      ? (() => {
          const parsed = offerPolicy.inputSchema.safeParse(
            offerDefinition?.input ?? {},
          );
          if (!parsed.success)
            organizationError(
              `宗门任务告示配置无效：${offerDefinition?.policy}`,
              500,
            );
          return offerPolicy.create(
            {
              membershipId: input.membershipId,
              taskId: input.definition.id,
              periodKey: input.periodKey,
              realm: input.realm,
              realmStage: input.realmStage,
              rulesVersion,
            },
            parsed.data,
          );
        })()
      : { difficulty: 'easy' as const };
    const reward = rewardPolicy
      ? (() => {
          const parsed = rewardPolicy.inputSchema.safeParse(
            rewardDefinition?.input ?? {},
          );
          if (!parsed.success)
            organizationError(
              `宗门任务奖励配置无效：${rewardDefinition?.policy}`,
              500,
            );
          return rewardPolicy.calculate(
            {
              realm: input.realm,
              realmStage: input.realmStage,
              difficulty: offerResult.difficulty,
            },
            parsed.data,
          );
        })()
      : undefined;
    return createSectTaskOfferSnapshot({
      rulesVersion,
      membershipId: input.membershipId,
      taskId: input.definition.id,
      anchorRealm: input.realm,
      anchorRealmStage: input.realmStage,
      periodKey: input.periodKey,
      executorKey: input.executorKey,
      requirement: offerResult.requirement,
      difficulty: offerResult.difficulty,
      reward,
    });
  }

  payload(
    definition: SectTaskDefinition,
    offer: SectTaskOfferSnapshot,
  ): SectTaskRecordPayload {
    return SectTaskRecordPayloadSchema.parse({
      schemaVersion: 1,
      target: definition.target,
      offer,
      executorData: {},
    });
  }
}

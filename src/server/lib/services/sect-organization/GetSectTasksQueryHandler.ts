import type { SectTasksData, SectTaskViewData } from '@shared/contracts/sect';
import type {
  SectTaskDefinition,
  SectTaskOfferSnapshot,
} from '@shared/engine/sect';
import type { RealmStage, RealmType } from '@shared/types/constants';
import { SectCapabilityAuthorizer } from './SectCapabilityAuthorizer';
import {
  requireSectMembership,
  resolveCurrentSectTaskExecution,
  sectTaskPeriodKey,
} from './SectTaskApplicationSupport';
import { SectTaskOfferService } from './SectTaskOfferService';
import type {
  SectTaskOfferPolicyRegistry,
  SectTaskProgressRegistry,
  SectTaskRewardPolicyRegistry,
} from './SectTaskSettlement';
import { toSectTaskView } from './SectTaskViewAssembler';
import type {
  SectMembershipRecord,
  SectQueryContext,
  SectTaskRecord,
} from './ports';
import type { SectTaskExecutorRegistry } from './task-executors/SectTaskExecutor';

function syntheticRecord(
  membership: SectMembershipRecord,
  definition: SectTaskDefinition,
  periodKey: string,
  offer: SectTaskOfferSnapshot,
  offers: SectTaskOfferService,
): SectTaskRecord {
  return {
    id: `offered:${definition.id}`,
    membershipId: membership.id,
    taskId: definition.id,
    kind: definition.kind,
    periodKey,
    status: 'active',
    progress: 0,
    payload: offers.payload(definition, offer),
  };
}

export class GetSectTasksQueryHandler {
  private readonly offers: SectTaskOfferService;

  constructor(
    private readonly executors: SectTaskExecutorRegistry,
    private readonly progress: SectTaskProgressRegistry,
    offerPolicies: SectTaskOfferPolicyRegistry,
    rewardPolicies: SectTaskRewardPolicyRegistry,
    private readonly authorizer = new SectCapabilityAuthorizer(),
  ) {
    this.offers = new SectTaskOfferService(offerPolicies, rewardPolicies);
  }

  async execute(
    input: {
      cultivatorId: string;
      realm: RealmType;
      realmStage: RealmStage;
    },
    context: SectQueryContext,
  ): Promise<SectTasksData> {
    const membership = await requireSectMembership(input.cultivatorId, context);
    const organization = context.modules.require(membership.sectId);
    this.authorizer.assertOrganization(
      organization,
      membership.discipleRank,
      'sect.tasks.use',
    );
    const records = await context.tasks.list(membership.id);
    const dateKey = context.clock.dateKey();
    const weekKey = context.clock.weekKey();
    const definitions = [
      ...organization.tasks.listDaily(),
      ...organization.tasks.listWeekly(),
      ...organization.tasks.listPromotion(),
    ];
    const items = await Promise.all(
      definitions.map(async (definition): Promise<SectTaskViewData> => {
        const periodKey = sectTaskPeriodKey(definition, context);
        const persisted = records.find(
          (record) =>
            record.taskId === definition.id && record.periodKey === periodKey,
        );
        const currentExecution = persisted
          ? undefined
          : resolveCurrentSectTaskExecution(definition, context);
        const executor = this.executors.require(
          persisted?.payload.offer.executorKey ?? currentExecution!.executorKey,
        );
        const offer =
          persisted?.payload.offer ??
          this.offers.create({
            definition,
            membershipId: membership.id,
            periodKey,
            realm: input.realm,
            realmStage: input.realmStage,
            executorKey: currentExecution!.executorKey,
            offer: currentExecution!.offer,
          });
        const record =
          persisted ??
          syntheticRecord(
            membership,
            definition,
            periodKey,
            offer,
            this.offers,
          );
        if (!persisted && definition.progress)
          record.progress = Math.min(
            definition.target,
            await this.progress
              .require(definition.progress.strategy)
              .current({ membership, definition, context }),
          );
        const capability = executor.requiredCapability(definition);
        const enabled = organization.capabilities.allows(
          membership.discipleRank,
          capability,
        );
        const permission = organization.capabilities.snapshot(
          membership.discipleRank,
        )[capability];
        const state: SectTaskViewData['state'] = !enabled
          ? 'locked'
          : persisted?.status === 'completed'
            ? persisted.claimedAt
              ? 'claimed'
              : 'claimable'
            : !persisted && definition.enrollment === 'manual'
              ? 'offered'
              : 'active';
        return toSectTaskView({
          definition,
          record,
          executor,
          state,
          enabled,
          disabledReason: enabled
            ? undefined
            : (permission?.reason ?? '当前弟子职阶尚未开放'),
        });
      }),
    );
    return { dateKey, weekKey, items };
  }
}

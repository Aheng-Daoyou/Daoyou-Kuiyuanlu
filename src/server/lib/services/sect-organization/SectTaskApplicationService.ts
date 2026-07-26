import type { SectTaskActionData } from '@shared/contracts/sect';
import {
  SectTask,
  SectTaskRecordPayloadSchema,
  type SectTaskDefinition,
} from '@shared/engine/sect';
import { z } from 'zod';
import { ClaimSectTaskRewardHandler } from './ClaimSectTaskRewardHandler';
import { SectCapabilityAuthorizer } from './SectCapabilityAuthorizer';
import type { SectDomainEventDispatcherFactory } from './SectDomainEventDispatcher';
import {
  invalidSectTask,
  requireSectMembership,
  resolveCurrentSectTaskExecution,
  sectTaskPeriodKey,
} from './SectTaskApplicationSupport';
import { SectTaskOfferService } from './SectTaskOfferService';
import type {
  SectTaskOfferPolicyRegistry,
  SectTaskRewardPolicyRegistry,
} from './SectTaskSettlement';
import { toSectTaskView } from './SectTaskViewAssembler';
import type {
  SectCommandContext,
  SectMembershipRecord,
  SectTaskRecord,
} from './ports';
import type { SectTaskExecutorRegistry } from './task-executors/SectTaskExecutor';

export class FulfillSectTaskHandler {
  constructor(private readonly events: SectDomainEventDispatcherFactory) {}

  async execute(args: {
    userId: string;
    cultivatorId: string;
    membership: SectMembershipRecord;
    definition: SectTaskDefinition;
    record: SectTaskRecord;
    context: SectCommandContext;
  }): Promise<SectTaskRecord> {
    const aggregate = SectTask.rehydrate({
      id: args.record.id,
      definitionId: args.record.taskId,
      membershipId: args.record.membershipId,
      kind: args.record.kind,
      periodKey: args.record.periodKey,
      target: args.record.payload.target,
      state: 'active',
      progress: args.record.progress,
    });
    if (!aggregate.complete()) invalidSectTask('该宗门任务已经达成');
    const completed = await args.context.tasks.complete(
      args.record.id,
      args.definition.target,
    );
    if (!completed) invalidSectTask('该宗门任务已经达成');
    await this.events
      .forTask({
        userId: args.userId,
        cultivatorId: args.cultivatorId,
        membership: args.membership,
        command: args.context,
      })
      .dispatch(aggregate.pullEvents());
    return completed;
  }
}

const acceptInput = z.object({
  offerRevision: z.string().min(16).max(64),
});

export class ExecuteSectTaskActionHandler {
  private readonly offers: SectTaskOfferService;

  constructor(
    private readonly executors: SectTaskExecutorRegistry,
    private readonly fulfillment: FulfillSectTaskHandler,
    private readonly claims: ClaimSectTaskRewardHandler,
    offerPolicies: SectTaskOfferPolicyRegistry,
    rewardPolicies: SectTaskRewardPolicyRegistry,
    private readonly authorizer = new SectCapabilityAuthorizer(),
  ) {
    this.offers = new SectTaskOfferService(offerPolicies, rewardPolicies);
  }

  async execute(
    command: {
      userId: string;
      cultivatorId: string;
      taskId: string;
      actionKey: string;
      requestId: string;
      input: Record<string, unknown>;
    },
    context: SectCommandContext,
  ): Promise<SectTaskActionData> {
    const membership = await requireSectMembership(
      command.cultivatorId,
      context,
    );
    const organization = context.modules.require(membership.sectId);
    const definition = organization.tasks.get(command.taskId);
    if (!definition) invalidSectTask('未知宗门委托', 400);
    const periodKey = sectTaskPeriodKey(definition, context);
    let record = await context.tasks.find(
      membership.id,
      periodKey,
      definition.id,
    );

    if (command.actionKey === 'accept') {
      if (definition.enrollment !== 'manual')
        invalidSectTask('该任务不需要领取', 400);
      const execution = resolveCurrentSectTaskExecution(definition, context);
      const executor = this.executors.require(execution.executorKey);
      this.authorizer.assertOrganization(
        organization,
        membership.discipleRank,
        executor.requiredCapability(definition),
      );
      const progress = await context.cultivators.loadProgress(
        command.cultivatorId,
      );
      if (!progress) invalidSectTask('角色境界状态不存在', 500);
      const offer = this.offers.create({
        definition,
        membershipId: membership.id,
        periodKey,
        realm: progress.realm,
        realmStage: progress.stage,
        executorKey: execution.executorKey,
        offer: execution.offer,
      });
      const parsed = acceptInput.safeParse(command.input);
      if (!parsed.success) invalidSectTask('告示凭据无效', 400);
      if (parsed.data.offerRevision !== offer.offerRevision)
        invalidSectTask('告示内容已经更新，请刷新后重试');
      if (record) invalidSectTask('该宗门任务本周期已经领取');
      record = await context.tasks.create({
        membershipId: membership.id,
        taskId: definition.id,
        kind: definition.kind,
        periodKey,
        payload: this.offers.payload(definition, offer),
      });
      return {
        task: toSectTaskView({
          definition,
          record,
          executor,
          state: 'active',
          enabled: true,
        }),
        outcome: {
          renderer: 'sect.outcome.accepted',
          data: { accepted: true },
        },
      };
    }

    let executor;
    if (!record) {
      const execution = resolveCurrentSectTaskExecution(definition, context);
      executor = this.executors.require(execution.executorKey);
      this.authorizer.assertOrganization(
        organization,
        membership.discipleRank,
        executor.requiredCapability(definition),
      );
      if (definition.enrollment === 'manual')
        invalidSectTask('尚未领取对应宗门委托', 400);
      const progress = await context.cultivators.loadProgress(
        command.cultivatorId,
      );
      if (!progress) invalidSectTask('角色境界状态不存在', 500);
      const offer = this.offers.create({
        definition,
        membershipId: membership.id,
        periodKey,
        realm: progress.realm,
        realmStage: progress.stage,
        executorKey: execution.executorKey,
        offer: execution.offer,
      });
      record = await context.tasks.create({
        membershipId: membership.id,
        taskId: definition.id,
        kind: definition.kind,
        periodKey,
        payload: this.offers.payload(definition, offer),
      });
    } else {
      executor = this.executors.require(record.payload.offer.executorKey);
      this.authorizer.assertOrganization(
        organization,
        membership.discipleRank,
        executor.requiredCapability(definition),
      );
    }

    if (command.actionKey === 'claim')
      return this.claims.execute({
        command,
        context,
        membership,
        definition,
        executor,
        record,
      });
    if (record.status === 'completed')
      invalidSectTask(
        record.claimedAt ? '该宗门任务已经结清' : '该宗门任务奖励待领取',
      );
    const parsed = executor
      .inputSchema(command.actionKey)
      .safeParse(command.input);
    if (!parsed.success)
      invalidSectTask(
        parsed.error.issues[0]?.message ?? '任务操作参数无效',
        400,
      );
    const decision = await executor.execute(
      command.actionKey,
      {
        userId: command.userId,
        cultivatorId: command.cultivatorId,
        requestId: command.requestId,
        membership,
        record,
        definition,
        ports: context,
      },
      parsed.data,
    );
    if (!decision.completed && decision.completionSettlement === 'claim-reward')
      invalidSectTask('未达成的宗门任务不能结算奖励', 500);
    if (decision.payload) {
      const updated = await context.tasks.updatePayload(
        record.id,
        SectTaskRecordPayloadSchema.parse(decision.payload),
      );
      if (!updated) invalidSectTask('任务状态已经变化，请重试');
      record = updated;
    }
    if (decision.completed) {
      record = await this.fulfillment.execute({
        userId: command.userId,
        cultivatorId: command.cultivatorId,
        membership,
        definition,
        record,
        context,
      });
      if (decision.completionSettlement === 'claim-reward')
        return this.claims.execute({
          command,
          context,
          membership,
          definition,
          executor,
          record,
        });
    }
    return {
      task: toSectTaskView({
        definition,
        record,
        executor,
        state: record.status === 'completed' ? 'claimable' : 'active',
        enabled: true,
      }),
      outcome: decision.outcome,
    };
  }
}

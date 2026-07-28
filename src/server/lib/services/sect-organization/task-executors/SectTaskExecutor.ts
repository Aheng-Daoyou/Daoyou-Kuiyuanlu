import type { SectTaskActionOutcome } from '@shared/contracts/sect';
import {
  describeSectDeliveryRequirement,
  matchSectDeliveryRequirement,
  matchSectMaterialDeliverySelection,
  resolveSectTaskExecutionLocationParameters,
  SectTaskRecordPayloadSchema,
  simulateSweepMoves,
  SWEEP_DIRECTIONS,
  SWEEP_MAX_MOVES,
  SWEEP_RULES_VERSION,
  type SectSubmissionItemFacts,
  type SectTaskDefinition,
  type SectTaskRecordPayload,
  type SweepDirection,
} from '@shared/engine/sect';
import { z, type ZodType } from 'zod';
import { SectError } from '../../SectError';
import type {
  SectCommandContext,
  SectMembershipRecord,
  SectTaskRecord,
} from '../ports';
import {
  emptySectCommandEffects,
  mergeSectCommandEffects,
  type SectCommandEffects,
} from '../SectCommandEffects';

export interface SectTaskActionDescriptor {
  key: string;
  renderer: string;
  label: string;
  parameters?: Record<string, unknown>;
}

export interface SectTaskExecutionContext {
  userId: string;
  cultivatorId: string;
  requestId: string;
  membership: SectMembershipRecord;
  record: SectTaskRecord;
  definition: SectTaskDefinition;
  ports: SectCommandContext;
}

export type SectTaskCompletionSettlement = 'deferred' | 'claim-reward';

export interface SectTaskExecutionDecision {
  completed: boolean;
  /**
   * Controls what the application layer does after a successful completion.
   * Executors declare the interaction semantic; the handler owns fulfillment
   * and reward transactions.
   */
  completionSettlement: SectTaskCompletionSettlement;
  outcome: SectTaskActionOutcome;
  payload?: SectTaskRecordPayload;
  effects?: SectCommandEffects;
}

export interface SectTaskExecutor<TInput = unknown> {
  readonly key: string;
  inputSchema(actionKey: string): ZodType<TInput>;
  requiredCapability(definition: SectTaskDefinition): string;
  actions(definition: SectTaskDefinition): readonly SectTaskActionDescriptor[];
  execute(
    actionKey: string,
    context: SectTaskExecutionContext,
    input: TInput,
  ): Promise<SectTaskExecutionDecision>;
}

function invalid(message: string, status = 400): never {
  throw new SectError('SECT_ORGANIZATION_INVALID', message, status);
}

const emptyInput = z.object({}).strict();
const deliveryInput = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive().max(99).default(1),
});
const materialDeliveryInput = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.number().int().positive().max(99),
      }),
    )
    .min(1)
    .max(99)
    .refine(
      (items) =>
        new Set(items.map((item) => item.itemId)).size === items.length,
      '同一份材料不能重复选择',
    ),
});
const sweepCompleteInput = z.object({
  sessionId: z.string().uuid(),
  rulesVersion: z.number().int().positive(),
  moves: z.array(z.enum(SWEEP_DIRECTIONS)).min(1).max(SWEEP_MAX_MOVES),
});

abstract class BaseTaskExecutor<
  TInput = unknown,
> implements SectTaskExecutor<TInput> {
  abstract readonly key: string;
  abstract inputSchema(actionKey: string): ZodType<TInput>;
  abstract actions(
    definition: SectTaskDefinition,
  ): readonly SectTaskActionDescriptor[];
  abstract execute(
    actionKey: string,
    context: SectTaskExecutionContext,
    input: TInput,
  ): Promise<SectTaskExecutionDecision>;

  requiredCapability(definition: SectTaskDefinition): string {
    return definition.requiredCapability;
  }
}

export class SweepGameTaskExecutor extends BaseTaskExecutor<
  Record<string, unknown>
> {
  readonly key = 'sect.sweep';

  inputSchema(actionKey: string): ZodType<Record<string, unknown>> {
    if (actionKey === 'start') return emptyInput;
    if (actionKey === 'complete') return sweepCompleteInput;
    return z.never();
  }

  actions(definition: SectTaskDefinition): readonly SectTaskActionDescriptor[] {
    return [
      {
        key: 'enter',
        renderer: 'sect.action.sweep-entry',
        label: definition.presentation.actionLabel,
      },
    ];
  }

  async execute(
    actionKey: string,
    context: SectTaskExecutionContext,
    input: Record<string, unknown>,
  ): Promise<SectTaskExecutionDecision> {
    if (actionKey === 'start') {
      const sessionId = context.ports.ids.next();
      const seed = `${context.record.id}:${sessionId}`;
      const startedAt = context.ports.clock.now();
      const expiresAt = new Date(startedAt.getTime() + 10 * 60 * 1_000);
      const payload = {
        ...context.record.payload,
        executorData: {
          ...context.record.payload.executorData,
          sweepSession: {
            sessionId,
            seed,
            rulesVersion: SWEEP_RULES_VERSION,
            startedAt: startedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
        },
      };
      return {
        completed: false,
        completionSettlement: 'deferred',
        payload,
        outcome: {
          renderer: 'sect.outcome.sweep-session',
          data: {
            sessionId,
            seed,
            rulesVersion: SWEEP_RULES_VERSION,
            expiresAt: expiresAt.toISOString(),
          },
        },
      };
    }
    if (actionKey !== 'complete') invalid('清扫任务不支持该操作');
    const completeInput = input as z.infer<typeof sweepCompleteInput>;
    const session = (context.record.payload.executorData.sweepSession ??
      {}) as Record<string, unknown>;
    if (session.sessionId !== completeInput.sessionId)
      invalid('清扫场次与当前任务不匹配');
    if (
      session.rulesVersion !== completeInput.rulesVersion ||
      completeInput.rulesVersion !== SWEEP_RULES_VERSION
    )
      invalid('清扫规则版本已更新，请重新开始');
    const now = context.ports.clock.now();
    if (
      typeof session.expiresAt !== 'string' ||
      new Date(session.expiresAt) < now
    )
      invalid('清扫场次已过期，请重新开始');
    if (typeof session.seed !== 'string') invalid('清扫场次数据缺失');
    const simulation = simulateSweepMoves(
      session.seed,
      completeInput.moves as SweepDirection[],
    );
    if (!simulation.success) {
      if (simulation.reason === 'leaves_remaining')
        invalid('云阶尚有落叶未清理干净');
      if (simulation.reason === 'not_at_end') invalid('尚未抵达山门终点');
      if (simulation.reason === 'end_too_early')
        invalid('尚未收齐落叶便踏入了终点');
      if (simulation.reason === 'dead_end') invalid('清扫路线已无路可走');
      invalid('清扫路线无效，请重新挑战');
    }
    return {
      completed: true,
      completionSettlement: 'deferred',
      outcome: { renderer: 'sect.outcome.fulfilled', data: { success: true } },
    };
  }
}

export class BattleTaskExecutor extends BaseTaskExecutor<
  Record<string, unknown>
> {
  readonly key = 'sect.battle';
  inputSchema(): ZodType<Record<string, unknown>> {
    return emptyInput;
  }
  actions(definition: SectTaskDefinition): readonly SectTaskActionDescriptor[] {
    return [
      {
        key: 'execute',
        renderer: 'sect.action.battle',
        label: definition.presentation.actionLabel,
        parameters: resolveSectTaskExecutionLocationParameters(definition),
      },
    ];
  }
  async execute(
    actionKey: string,
    context: SectTaskExecutionContext,
  ): Promise<SectTaskExecutionDecision> {
    if (actionKey !== 'execute') invalid('战斗任务不支持该操作');
    const player = await context.ports.cultivators.loadRuntime(
      context.cultivatorId,
    );
    if (!player) invalid('角色不存在');
    const factory = context.ports.modules
      .require(context.membership.sectId)
      .battles.get(context.definition.id);
    if (!factory) invalid('该宗门任务未配置战斗场景');
    let mirror = null;
    if (factory.prefersMemberMirror) {
      const mirrorId = await context.ports.cultivators.findMirrorCultivatorId(
        context.membership.sectId,
        context.cultivatorId,
      );
      mirror = mirrorId
        ? await context.ports.cultivators.loadRuntime(mirrorId)
        : null;
    }
    const scenario = factory.create({
      player,
      mirror,
      opponentId: `sect-task-${context.record.id}-${context.requestId}`,
    });
    const battle = context.ports.battle.simulate(
      player,
      scenario.opponent,
      `${context.record.id}:${context.requestId}`,
    );
    const won = battle.winner.id === player.id;
    return {
      completed: won,
      completionSettlement: 'deferred',
      outcome: {
        renderer: 'sect.outcome.battle',
        data: {
          battle,
          won,
          challengeTitle: scenario.title,
          taskFulfilled: won,
        },
      },
    };
  }
}

type DeliveryInput = z.infer<typeof deliveryInput>;

abstract class DeliveryTaskExecutor<
  TInput = DeliveryInput,
> extends BaseTaskExecutor<TInput> {
  protected abstract readonly itemKind: 'pill' | 'artifact' | 'material';
  inputSchema(): ZodType<TInput> {
    return deliveryInput as unknown as ZodType<TInput>;
  }
  actions(
    definition: SectTaskDefinition,
  ): readonly SectTaskActionDescriptor[] {
    return [
      {
        key: 'execute',
        renderer: 'sect.action.item-delivery',
        label: definition.presentation.actionLabel,
        parameters: { itemKind: this.itemKind },
      },
    ];
  }
  protected requirement(record: SectTaskRecord) {
    const requirement = record.payload.offer.requirement;
    if (!requirement || requirement.kind !== this.itemKind)
      invalid('任务交付要求缺失');
    return requirement;
  }
  protected completedPayload(
    context: SectTaskExecutionContext,
    item: SectSubmissionItemFacts | null,
    quantity: number,
  ): SectTaskRecordPayload {
    if (!item) invalid('交付物品不存在');
    return SectTaskRecordPayloadSchema.parse({
      ...context.record.payload,
      completionData: {
        submittedItem: {
          itemId: item.id,
          kind: item.kind,
          name: item.name,
          quality: item.quality,
          quantity,
          matchedFacts: [
            describeSectDeliveryRequirement(this.requirement(context.record)),
          ],
        },
      },
    });
  }
}

export class PillDeliveryTaskExecutor extends DeliveryTaskExecutor {
  readonly key = 'sect.delivery.pill';
  protected readonly itemKind = 'pill' as const;
  async execute(
    actionKey: string,
    context: SectTaskExecutionContext,
    input: DeliveryInput,
  ): Promise<SectTaskExecutionDecision> {
    if (actionKey !== 'execute') invalid('丹药交付不支持该操作');
    const requirement = this.requirement(context.record);
    if (input.quantity !== requirement.quantity)
      invalid(`该委托须一次提交 ${requirement.quantity} 份`);
    const item = await context.ports.submissionInventory.findSubmissionItem(
      context.cultivatorId,
      'pill',
      input.itemId,
    );
    if (!item) invalid('未找到所选丹药');
    const match = matchSectDeliveryRequirement(requirement, item);
    if (!match.eligible)
      invalid(match.violations[0]?.message ?? '丹药不符合要求');
    const settlement =
      await context.ports.submissionInventory.consumeSubmissionItem({
        cultivatorId: context.cultivatorId,
        kind: 'pill',
        itemId: item.id,
        quantity: requirement.quantity,
      });
    if (!settlement.consumed) invalid('丹药数量不足');
    const effects = inventorySettlementEffects(settlement);
    return {
      completed: true,
      completionSettlement: 'claim-reward',
      payload: this.completedPayload(context, item, requirement.quantity),
      outcome: { renderer: 'sect.outcome.fulfilled', data: { success: true } },
      effects,
    };
  }
}

export class ArtifactDeliveryTaskExecutor extends DeliveryTaskExecutor {
  readonly key = 'sect.delivery.artifact';
  protected readonly itemKind = 'artifact' as const;
  async execute(
    actionKey: string,
    context: SectTaskExecutionContext,
    input: DeliveryInput,
  ): Promise<SectTaskExecutionDecision> {
    if (actionKey !== 'execute') invalid('法宝交付不支持该操作');
    const requirement = this.requirement(context.record);
    const item = await context.ports.submissionInventory.findSubmissionItem(
      context.cultivatorId,
      'artifact',
      input.itemId,
    );
    if (!item) invalid('未找到该法宝');
    const match = matchSectDeliveryRequirement(requirement, item);
    if (!match.eligible)
      invalid(match.violations[0]?.message ?? '法宝不符合要求');
    const settlement =
      await context.ports.submissionInventory.consumeSubmissionItem({
        cultivatorId: context.cultivatorId,
        kind: 'artifact',
        itemId: item.id,
        quantity: 1,
      });
    if (!settlement.consumed) invalid('法宝状态已变化，请重试');
    const effects = inventorySettlementEffects(settlement);
    return {
      completed: true,
      completionSettlement: 'claim-reward',
      payload: this.completedPayload(context, item, 1),
      outcome: { renderer: 'sect.outcome.fulfilled', data: { success: true } },
      effects,
    };
  }
}

export class MaterialDeliveryTaskExecutor extends DeliveryTaskExecutor<
  z.infer<typeof materialDeliveryInput>
> {
  readonly key = 'sect.delivery.material';
  protected readonly itemKind = 'material' as const;
  inputSchema(): ZodType<z.infer<typeof materialDeliveryInput>> {
    return materialDeliveryInput;
  }
  async execute(
    actionKey: string,
    context: SectTaskExecutionContext,
    input: z.infer<typeof materialDeliveryInput>,
  ): Promise<SectTaskExecutionDecision> {
    if (actionKey !== 'execute') invalid('材料交付不支持该操作');
    const requirement = this.requirement(context.record);
    if (requirement.kind !== 'material') invalid('任务材料要求缺失');
    const selections = await Promise.all(
      input.items.map(async (selection) => {
        const item = await context.ports.submissionInventory.findSubmissionItem(
          context.cultivatorId,
          'material',
          selection.itemId,
        );
        if (!item || item.kind !== 'material')
          invalid('悬赏所需材料状态已经变化');
        return { item, quantity: selection.quantity };
      }),
    );
    const match = matchSectMaterialDeliverySelection(requirement, selections);
    if (!match.eligible)
      invalid(match.violations[0]?.message ?? '材料不符合要求');
    let effects = emptySectCommandEffects();
    for (const selection of selections) {
      const settlement =
        await context.ports.submissionInventory.consumeSubmissionItem({
          cultivatorId: context.cultivatorId,
          kind: 'material',
          itemId: selection.item.id,
          quantity: selection.quantity,
        });
      if (!settlement.consumed) invalid('材料状态已变化，请重试');
      effects = mergeSectCommandEffects(
        effects,
        inventorySettlementEffects(settlement),
      );
    }
    return {
      completed: true,
      completionSettlement: 'claim-reward',
      payload: SectTaskRecordPayloadSchema.parse({
        ...context.record.payload,
        completionData: {
          submittedItems: selections.map(({ item, quantity }) => ({
            itemId: item.id,
            kind: item.kind,
            name: item.name,
            quality: item.quality,
            quantity,
            matchedFacts: [describeSectDeliveryRequirement(requirement)],
          })),
        },
      }),
      outcome: { renderer: 'sect.outcome.fulfilled', data: { success: true } },
      effects,
    };
  }
}

function inventorySettlementEffects(
  settlement: Awaited<
    ReturnType<SectCommandContext['submissionInventory']['consumeSubmissionItem']>
  >,
): SectCommandEffects {
  const effects = emptySectCommandEffects();
  if (settlement.change) effects.resourceChanges.push(settlement.change);
  if (settlement.settlement)
    effects.settlement.inventory.push(settlement.settlement);
  return effects;
}

export class ProgressTaskExecutor extends BaseTaskExecutor<
  Record<string, unknown>
> {
  readonly key = 'sect.progress';
  inputSchema(): ZodType<Record<string, unknown>> {
    return z.never();
  }
  actions(): readonly SectTaskActionDescriptor[] {
    return [];
  }
  async execute(): Promise<SectTaskExecutionDecision> {
    return invalid('进度任务不能主动执行');
  }
}

export class SectTaskExecutorRegistry {
  private readonly executors = new Map<string, SectTaskExecutor>();

  constructor(executors: readonly SectTaskExecutor[]) {
    for (const executor of executors) {
      if (this.executors.has(executor.key))
        throw new Error(`宗门任务执行器重复注册：${executor.key}`);
      this.executors.set(executor.key, executor);
    }
  }

  has(key: string): boolean {
    return this.executors.has(key);
  }

  require(key: string): SectTaskExecutor {
    const executor = this.executors.get(key);
    if (!executor)
      throw new SectError(
        'SECT_ORGANIZATION_INVALID',
        `未注册宗门任务执行器：${key}`,
        400,
      );
    return executor;
  }
}

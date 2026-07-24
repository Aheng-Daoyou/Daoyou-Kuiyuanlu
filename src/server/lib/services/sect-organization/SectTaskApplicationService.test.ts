import {
  StandardSectOrganizationModule,
  type SectOrganizationModule,
  type SectTaskRecordPayload,
} from '@shared/engine/sect';
import { CUSTOM_ECONOMY_FIXTURE_SECT_MODULE as FIXTURE_SECT_MODULE } from '@shared/engine/sect/testing/fixtures/CustomEconomyFixtureSectModule';
import { describe, expect, it, vi } from 'vitest';
import { ClaimSectTaskRewardHandler } from './ClaimSectTaskRewardHandler';
import { GetSectTasksQueryHandler } from './GetSectTasksQueryHandler';
import type { SectCommandContext, SectTaskRecord } from './ports';
import {
  composeSectOrganizationPlugins,
  CORE_SECT_ORGANIZATION_PLUGIN,
} from './SectOrganizationPlugins';
import {
  ExecuteSectTaskActionHandler,
  FulfillSectTaskHandler,
} from './SectTaskApplicationService';
import { SectTaskOfferService } from './SectTaskOfferService';
import { SectTaskSubmissionQueryService } from './SectTaskSubmissionQueryService';
import { FIXTURE_SECT_ORGANIZATION_PLUGIN } from './testing/FixtureSectOrganizationPlugin';

function fixtureContext(
  organization: SectOrganizationModule = FIXTURE_SECT_MODULE.organization,
) {
  const records: SectTaskRecord[] = [];
  const contributions: number[] = [];
  const stones: number[] = [];
  const cultivationExp: number[] = [];
  let sequence = 0;
  const memberships = {
    findByCultivator: async () => ({
      id: 'membership-1',
      cultivatorId: 'cultivator-1',
      sectId: 'fixture-sect',
      discipleRank: 'true' as const,
      contribution: 30,
    }),
    countCompletedDailyTasks: async () => 0,
    hasCompletedTask: async () => false,
  };
  const tasks = {
    list: async () => records,
    find: async (membershipId: string, periodKey: string, taskId: string) =>
      records.find(
        (item) =>
          item.membershipId === membershipId &&
          item.periodKey === periodKey &&
          item.taskId === taskId,
      ) ?? null,
    countCompletedDailySince: async () =>
      records.filter(
        (item) => item.kind === 'daily' && item.status === 'completed',
      ).length,
    async create(input: {
      membershipId: string;
      taskId: string;
      kind: 'daily' | 'weekly' | 'promotion';
      periodKey: string;
      progress?: number;
      payload: SectTaskRecordPayload;
    }) {
      const existing = await tasks.find(
        input.membershipId,
        input.periodKey,
        input.taskId,
      );
      if (existing) return existing;
      const record: SectTaskRecord = {
        id: `task-${++sequence}`,
        membershipId: input.membershipId,
        taskId: input.taskId,
        kind: input.kind,
        periodKey: input.periodKey,
        status: 'active',
        progress: input.progress ?? 0,
        payload: input.payload,
      };
      records.push(record);
      return record;
    },
    async complete(id: string, progress: number) {
      const record = records.find((item) => item.id === id);
      if (!record || record.status === 'completed') return null;
      record.status = 'completed';
      record.progress = progress;
      record.completedAt = new Date('2026-07-19T00:00:00.000Z');
      return record;
    },
    async claim(id: string, claimedAt: Date) {
      const record = records.find((item) => item.id === id);
      if (!record || record.status !== 'completed' || record.claimedAt)
        return null;
      record.claimedAt = claimedAt;
      return record;
    },
    async updatePayload(id: string, payload: SectTaskRecordPayload) {
      const record = records.find((item) => item.id === id);
      if (!record || record.status !== 'active') return null;
      record.payload = payload;
      return record;
    },
    async upsertProgress(input: {
      membershipId: string;
      taskId: string;
      kind: 'weekly' | 'promotion';
      periodKey: string;
      progress: number;
      completed: boolean;
      payload: SectTaskRecordPayload;
    }) {
      const existing = await tasks.find(
        input.membershipId,
        input.periodKey,
        input.taskId,
      );
      if (existing) {
        existing.progress = input.progress;
        existing.payload = input.payload;
        existing.status = input.completed ? 'completed' : 'active';
        return existing;
      }
      const created = await tasks.create(input);
      created.progress = input.progress;
      created.status = input.completed ? 'completed' : 'active';
      return created;
    },
  };
  const clock = {
    now: () => new Date('2026-07-19T00:00:00.000Z'),
    dateKey: () => '2026-07-19',
    weekKey: () => '2026-W29',
  };
  const modules = { require: () => organization };
  const context: SectCommandContext = {
    memberships,
    tasks,
    modules,
    clock,
    ids: { next: () => `id-${++sequence}` },
    submissionInventory: {
      listSubmissionItems: async () => [],
      findSubmissionItem: async () => null,
      consumeSubmissionItem: async () => false,
    },
    cultivators: {
      loadRuntime: async () => null,
      findMirrorCultivatorId: async () => null,
      loadProgress: async () => ({ realm: '炼气', stage: '初期' }),
    },
    battle: {
      simulate: () => {
        throw new Error('not used');
      },
    },
    rewards: {
      grantContribution: async (_membershipId, amount) => {
        contributions.push(amount);
      },
      grantSpiritStones: async (_cultivatorId, amount) => {
        stones.push(amount);
      },
      grantCultivationExp: async (_userId, _cultivatorId, amount) => {
        cultivationExp.push(amount);
      },
      grantMaterial: async () => undefined,
      grantPill: async () => undefined,
    },
  };
  return { context, records, contributions, stones, cultivationExp };
}

function handlers(organization: SectOrganizationModule, withFixture = true) {
  const plugins = composeSectOrganizationPlugins({
    organizations: [{ sectId: 'fixture-sect', organization }],
    manifests: [
      CORE_SECT_ORGANIZATION_PLUGIN,
      ...(withFixture ? [FIXTURE_SECT_ORGANIZATION_PLUGIN] : []),
    ],
  });
  return {
    plugins,
    query: new GetSectTasksQueryHandler(
      plugins.executors,
      plugins.progress,
      plugins.offerPolicies,
      plugins.rewardPolicies,
    ),
    action: new ExecuteSectTaskActionHandler(
      plugins.executors,
      new FulfillSectTaskHandler(plugins.events),
      new ClaimSectTaskRewardHandler(plugins.events),
      plugins.offerPolicies,
      plugins.rewardPolicies,
    ),
    submissions: new SectTaskSubmissionQueryService(),
  };
}

const player = {
  cultivatorId: 'cultivator-1',
  realm: '炼气' as const,
  realmStage: '初期' as const,
};

describe('sect task handlers', () => {
  it('requires accept, fulfillment and claim as separate lifecycle steps', async () => {
    const { context, records, contributions, stones, cultivationExp } =
      fixtureContext();
    const { query, action } = handlers(FIXTURE_SECT_MODULE.organization);
    const offered = await query.execute(player, context);
    expect(offered.items[0]).toMatchObject({
      definitionId: 'fixture_patrol',
      state: 'offered',
      actions: [{ key: 'accept', renderer: 'sect.action.accept' }],
    });
    const revision = offered.items[0]!.offerRevision!;
    await expect(
      action.execute(
        {
          userId: 'user-1',
          cultivatorId: 'cultivator-1',
          taskId: 'fixture_patrol',
          actionKey: 'accept',
          requestId: 'invalid-offer',
          input: {},
        },
        context,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await action.execute(
      {
        userId: 'user-1',
        cultivatorId: 'cultivator-1',
        taskId: 'fixture_patrol',
        actionKey: 'accept',
        requestId: 'request-1',
        input: { offerRevision: revision },
      },
      context,
    );
    const fulfilled = await action.execute(
      {
        userId: 'user-1',
        cultivatorId: 'cultivator-1',
        taskId: 'fixture_patrol',
        actionKey: 'finish',
        requestId: 'request-2',
        input: { pass: true },
      },
      context,
    );
    expect(fulfilled.task.state).toBe('claimable');
    expect(contributions).toEqual([]);
    expect(stones).toEqual([]);
    expect(cultivationExp).toEqual([]);

    const claimed = await action.execute(
      {
        userId: 'user-1',
        cultivatorId: 'cultivator-1',
        taskId: 'fixture_patrol',
        actionKey: 'claim',
        requestId: 'request-3',
        input: {},
      },
      context,
    );
    expect(claimed.task.state).toBe('claimed');
    expect(claimed.outcome.renderer).toBe('sect.outcome.reward-claimed');
    expect(claimed.outcome.data).toMatchObject({
      rewards: { contribution: 3, spiritStones: 1_000 },
    });
    expect(contributions).toEqual([3]);
    expect(stones).toEqual([1_000]);
    expect(cultivationExp[0]).toBeGreaterThan(0);
    expect(records).toHaveLength(1);
    expect(records[0]?.claimedAt).toBeInstanceOf(Date);
    await expect(
      action.execute(
        {
          userId: 'user-1',
          cultivatorId: 'cultivator-1',
          taskId: 'fixture_patrol',
          actionKey: 'claim',
          requestId: 'request-4',
          input: {},
        },
        context,
      ),
    ).rejects.toThrow('已经领取');
  });

  it('allows every daily task once without a daily-wide mutex', async () => {
    const organization = new StandardSectOrganizationModule();
    const { context, records } = fixtureContext(organization);
    const { query, action } = handlers(organization, false);
    const board = await query.execute(player, context);
    const daily = board.items.filter((item) => item.kind === 'daily');
    expect(daily).toHaveLength(4);
    for (const task of daily)
      await action.execute(
        {
          userId: 'user-1',
          cultivatorId: 'cultivator-1',
          taskId: task.definitionId,
          actionKey: 'accept',
          requestId: `accept-${task.definitionId}`,
          input: { offerRevision: task.offerRevision },
        },
        context,
      );
    expect(records.filter((record) => record.kind === 'daily')).toHaveLength(4);
    await expect(
      action.execute(
        {
          userId: 'user-1',
          cultivatorId: 'cultivator-1',
          taskId: daily[0]!.definitionId,
          actionKey: 'accept',
          requestId: 'duplicate',
          input: { offerRevision: daily[0]!.offerRevision },
        },
        context,
      ),
    ).rejects.toThrow('本周期已经领取');
  });

  it('uses the same matcher for candidate reasons and transactional delivery', async () => {
    const organization = new StandardSectOrganizationModule();
    const { context, records } = fixtureContext(organization);
    const { query, action, submissions } = handlers(organization, false);
    const board = await query.execute(player, context);
    const pillTask = board.items.find(
      (item) => item.definitionId === 'pill_delivery',
    )!;
    await action.execute(
      {
        userId: 'user-1',
        cultivatorId: 'cultivator-1',
        taskId: pillTask.definitionId,
        actionKey: 'accept',
        requestId: 'accept-pill',
        input: { offerRevision: pillTask.offerRevision },
      },
      context,
    );
    const requirement = records[0]!.payload.offer.requirement;
    if (!requirement || requirement.kind !== 'pill')
      throw new Error('expected pill requirement');
    const eligible = {
      kind: 'pill' as const,
      id: '11111111-1111-4111-8111-111111111111',
      name: '合规丹药',
      quality: '神品' as const,
      quantity: 1,
      family: requirement.family ?? ('healing' as const),
      appearance: requirement.appearance?.grade ?? ('perfect' as const),
      traits: requirement.trait ? [requirement.trait] : [],
    };
    const ineligible = {
      ...eligible,
      id: '22222222-2222-4222-8222-222222222222',
      name: '已耗尽丹药',
      quantity: 0,
    };
    const consume = vi.fn(async () => true);
    context.submissionInventory.listSubmissionItems = async () => [
      ineligible,
      eligible,
    ];
    context.submissionInventory.findSubmissionItem = async (
      _cultivatorId,
      _kind,
      itemId,
    ) => (itemId === eligible.id ? eligible : null);
    context.submissionInventory.consumeSubmissionItem = consume;

    const candidates = await submissions.execute(
      {
        cultivatorId: 'cultivator-1',
        taskId: 'pill_delivery',
        page: 1,
        pageSize: 30,
        eligible: 'all',
      },
      context,
    );
    expect(candidates.items.map((item) => item.item.id)).toEqual([
      eligible.id,
      ineligible.id,
    ]);
    expect(candidates.items[1]?.violations.map((item) => item.code)).toContain(
      'quantity_too_low',
    );

    const fulfilled = await action.execute(
      {
        userId: 'user-1',
        cultivatorId: 'cultivator-1',
        taskId: 'pill_delivery',
        actionKey: 'execute',
        requestId: 'deliver-pill',
        input: { itemId: eligible.id, quantity: 1 },
      },
      context,
    );
    expect(fulfilled.task.state).toBe('claimable');
    expect(consume).toHaveBeenCalledWith({
      cultivatorId: 'cultivator-1',
      kind: 'pill',
      itemId: eligible.id,
      quantity: 1,
    });
    expect(records[0]?.payload.completionData?.submittedItem).toMatchObject({
      itemId: eligible.id,
      kind: 'pill',
    });
  });

  it('matches and filters the complete inventory before sorting and pagination', async () => {
    const organization = new StandardSectOrganizationModule();
    const { context, records } = fixtureContext(organization);
    const { query, action, submissions } = handlers(organization, false);
    const board = await query.execute(player, context);
    const pillTask = board.items.find(
      (item) => item.definitionId === 'pill_delivery',
    )!;
    await action.execute(
      {
        userId: 'user-1',
        cultivatorId: 'cultivator-1',
        taskId: pillTask.definitionId,
        actionKey: 'accept',
        requestId: 'accept-pill-pagination',
        input: { offerRevision: pillTask.offerRevision },
      },
      context,
    );
    const requirement = records[0]!.payload.offer.requirement;
    if (!requirement || requirement.kind !== 'pill')
      throw new Error('expected pill requirement');
    const base = {
      kind: 'pill' as const,
      quality: '神品' as const,
      quantity: 0,
      family: requirement.family ?? ('healing' as const),
      appearance: requirement.appearance?.grade ?? ('perfect' as const),
      traits: requirement.trait ? [requirement.trait] : [],
    };
    const inventory = Array.from({ length: 31 }, (_, index) => ({
      ...base,
      id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      name: `不合规丹药 ${index + 1}`,
    }));
    const eligible = {
      ...base,
      id: '99999999-1111-4111-8111-111111111111',
      name: '末位合规丹药',
      quantity: 1,
    };
    context.submissionInventory.listSubmissionItems = async () => [
      ...inventory,
      eligible,
    ];

    const all = await submissions.execute(
      {
        cultivatorId: 'cultivator-1',
        taskId: 'pill_delivery',
        page: 1,
        pageSize: 30,
        eligible: 'all',
      },
      context,
    );
    expect(all.total).toBe(32);
    expect(all.items).toHaveLength(30);
    expect(all.items[0]?.item.id).toBe(eligible.id);

    const onlyEligible = await submissions.execute(
      {
        cultivatorId: 'cultivator-1',
        taskId: 'pill_delivery',
        page: 1,
        pageSize: 30,
        eligible: 'yes',
      },
      context,
    );
    expect(onlyEligible.total).toBe(1);
    expect(onlyEligible.items.map((candidate) => candidate.item.id)).toEqual([
      eligible.id,
    ]);
  });

  it('keeps the accepted executor snapshot when availability changes', async () => {
    let variant = 'battle';
    const original = FIXTURE_SECT_MODULE.organization.tasks.listDaily()[0]!;
    const task = {
      ...original,
      availability: {
        variants: [
          { key: 'battle', executorKey: 'fixture-sect.battle' },
          { key: 'sweep', executorKey: 'sect.sweep' },
        ],
        resolve: () => variant,
      },
    };
    const organization: SectOrganizationModule = {
      ...FIXTURE_SECT_MODULE.organization,
      tasks: {
        ...FIXTURE_SECT_MODULE.organization.tasks,
        listDaily: () => [task],
        get: (id) => (id === task.id ? task : undefined),
      },
    };
    const { context } = fixtureContext(organization);
    const { query, action } = handlers(organization);
    const offered = await query.execute(player, context);
    await action.execute(
      {
        userId: 'user-1',
        cultivatorId: 'cultivator-1',
        taskId: task.id,
        actionKey: 'accept',
        requestId: 'accept-frozen-executor',
        input: { offerRevision: offered.items[0]!.offerRevision },
      },
      context,
    );

    variant = 'sweep';
    const active = await query.execute(player, context);
    expect(active.items[0]?.actions[0]).toMatchObject({
      key: 'finish',
      renderer: 'fixture-sect.action.battle',
    });
    await expect(
      action.execute(
        {
          userId: 'user-1',
          cultivatorId: 'cultivator-1',
          taskId: task.id,
          actionKey: 'finish',
          requestId: 'finish-frozen-executor',
          input: { pass: true },
        },
        context,
      ),
    ).resolves.toMatchObject({ task: { state: 'claimable' } });
  });

  it('creates delivery requirements from an explicit offer policy, not the executor key', () => {
    const { plugins } = handlers(FIXTURE_SECT_MODULE.organization);
    const offers = new SectTaskOfferService(
      plugins.offerPolicies,
      plugins.rewardPolicies,
    );
    const definition = FIXTURE_SECT_MODULE.organization.tasks.listDaily()[0]!;
    const base = {
      definition,
      membershipId: 'membership-1',
      periodKey: '2026-07-19',
      realm: '炼气' as const,
      realmStage: '初期' as const,
    };

    expect(
      offers.create({
        ...base,
        executorKey: 'sect.delivery.pill',
      }).requirement,
    ).toBeUndefined();
    expect(
      offers.create({
        ...base,
        executorKey: 'fixture-sect.battle',
        offer: {
          policy: 'sect.offer.delivery',
          input: { kind: 'pill' },
        },
      }).requirement,
    ).toMatchObject({ kind: 'pill' });
  });

  it('fails fast for missing extension registrations', () => {
    expect(() =>
      composeSectOrganizationPlugins({
        organizations: [
          {
            sectId: 'fixture-sect',
            organization: FIXTURE_SECT_MODULE.organization,
          },
        ],
        manifests: [
          CORE_SECT_ORGANIZATION_PLUGIN,
          { ...FIXTURE_SECT_ORGANIZATION_PLUGIN, executors: [] },
        ],
      }),
    ).toThrow('任务 fixture_patrol 缺少执行器');
  });

  it('keeps ordinary organizations on the core plugin only', () => {
    expect(() =>
      handlers(new StandardSectOrganizationModule(), false),
    ).not.toThrow();
  });

  it('rejects an availability policy that returns an undeclared variant', async () => {
    const task = {
      ...FIXTURE_SECT_MODULE.organization.tasks.listDaily()[0]!,
      availability: {
        variants: [{ key: 'battle', executorKey: 'fixture-sect.battle' }],
        resolve: () => 'dynamic-unknown',
      },
    };
    const organization: SectOrganizationModule = {
      ...FIXTURE_SECT_MODULE.organization,
      tasks: {
        ...FIXTURE_SECT_MODULE.organization.tasks,
        listDaily: () => [task],
        get: (id) => (id === task.id ? task : undefined),
      },
    };
    const { context } = fixtureContext(organization);
    const { query } = handlers(organization);
    await expect(query.execute(player, context)).rejects.toThrow(
      '返回未声明的执行变体',
    );
  });

  it('fails fast when an availability variant references an unknown offer policy', () => {
    const original = FIXTURE_SECT_MODULE.organization.tasks.listDaily()[0]!;
    const task = {
      ...original,
      availability: {
        variants: [
          {
            key: 'delivery',
            executorKey: 'fixture-sect.battle',
            offer: { policy: 'fixture-sect.offer.unknown' },
          },
        ],
        resolve: () => 'delivery',
      },
    };
    const organization: SectOrganizationModule = {
      ...FIXTURE_SECT_MODULE.organization,
      tasks: {
        ...FIXTURE_SECT_MODULE.organization.tasks,
        listDaily: () => [task],
        get: (id) => (id === task.id ? task : undefined),
      },
    };
    expect(() => handlers(organization)).toThrow('变体 delivery 缺少告示策略');
  });
});

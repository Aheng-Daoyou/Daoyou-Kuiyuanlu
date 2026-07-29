import { getRealmStageAttributeBudget } from '@shared/config/realmProgression';
import type { CultivatorCombatInput } from '@shared/engine/battle-v5/adapters/CultivatorCombatAdapter';
import type { Attributes } from '@shared/types/cultivator';
import {
  SECT_RANK_METHOD_CAP,
  type SectDiscipleRank,
  type SectRankRequirement,
} from '../domain';
import { StandardSectCapabilityPolicy } from './StandardSectCapabilityPolicy';
import {
  SECT_CRAFT_CONTEXTS,
  type SectBattleScenarioCatalog,
  type SectBenefitPolicy,
  type SectConstructionPolicy,
  type SectCraftContextKey,
  type SectEconomyPolicy,
  type SectOpponentFactory,
  type SectOrganizationModule,
  type SectOrganizationTaskId,
  type SectRankPolicy,
  type SectTaskCatalog,
  type SectTaskDefinition,
  type SectTaskDialogueDefinition,
} from './contracts';
import { getSectFacilityUpgradeTarget } from './construction';

const capabilities = new StandardSectCapabilityPolicy(
  {
    'sect.hall.view': 'registered',
    'sect.tasks.use': 'registered',
    'sect.archive.use': 'registered',
    'sect.enlightenment.use': 'registered',
    'sect.arena.use': 'registered',
    'sect.shop.use': 'outer',
    'sect.construction.view': 'registered',
    'sect.construction.donate': 'registered',
    'sect.facility.cultivation.use': 'outer',
    'sect.facility.alchemy.use': 'inner',
    'sect.facility.refinery.use': 'inner',
    'sect.spirit_vein.view': 'registered',
    'sect.herb_garden.view': 'registered',
    'sect.cave.view': 'inner',
    'sect.gate.view': 'registered',
    'sect.formation.view': 'true',
    'sect.task.pill_delivery.accept': 'outer',
    'sect.task.artifact_delivery.accept': 'inner',
    'sect.task.elder_trial.challenge': 'inner',
  },
  new Set(['sect.formation.view']),
);

export const STANDARD_SECT_ARCHIVE_METHOD_CAP = [
  0, 40, 75, 110, 145, 180,
] as const;

function taskPresentation(
  title: string,
  description: string,
  actionLabel: string,
  dialogue: SectTaskDialogueDefinition,
) {
  return {
    title,
    description,
    actionLabel,
    dialogue,
  };
}

const bountyVariants = [
  {
    key: 'battle',
    executorKey: 'sect.battle',
  },
  {
    key: 'material',
    executorKey: 'sect.delivery.material',
    offer: {
      policy: 'sect.offer.delivery',
      input: { kind: 'material' },
    },
  },
] as const;

const bountyAvailability = {
  variants: bountyVariants,
  resolve({ weekKey }: { weekKey: string }) {
    const seed = [...weekKey].reduce(
      (sum, char) => sum * 31 + char.charCodeAt(0),
      0,
    );
    return Math.abs(seed) % 2 === 0 ? 'battle' : 'material';
  },
};

function taskFulfillment(kind: SectTaskDefinition['kind']) {
  return [
    ...(kind === 'daily'
      ? [
          {
            strategy: 'sect.fulfillment.progress-signal',
            input: { source: 'sect.task.daily.completed', amount: 1 },
          },
        ]
      : []),
  ] as const;
}

const tasks: readonly SectTaskDefinition[] = [
  {
    id: 'gate_sweep',
    kind: 'daily',
    enrollment: 'manual',
    requiredCapability: 'sect.tasks.use',
    executorKey: 'sect.sweep',
    minimumDifficulty: 'easy',
    reward: {
      policy: 'sect.reward.realm-task',
      input: { baseContribution: 25 },
    },
    fulfillment: taskFulfillment('daily'),
    presentation: taskPresentation(
      '清扫山门',
      '清理山门步道，完成一轮宗门勤务。',
      '开始清扫',
      {
        offeredReply: '山门洒扫便交给我吧',
        activeReply: '山门那桩洒扫，我再确认一遍',
        claimableReply: '山门已经清扫妥当，请执事查验',
        claimedReply: '请替我查查山门勤务的功簿',
        instruction: {
          text: '去山门步道清理落叶，完成一轮洒扫后回来复命。',
        },
      },
    ),
    target: 1,
  },
  {
    id: 'mine_patrol',
    kind: 'daily',
    enrollment: 'manual',
    requiredCapability: 'sect.tasks.use',
    executorKey: 'sect.battle',
    minimumDifficulty: 'normal',
    executionLocation: {
      key: 'sect.spirit-vein',
      travelReply: '弟子这就前往矿场巡视',
    },
    reward: {
      policy: 'sect.reward.realm-task',
      input: { baseContribution: 30 },
    },
    fulfillment: taskFulfillment('daily'),
    presentation: taskPresentation(
      '巡视矿场',
      '前往宗门矿脉驱逐侵扰妖兽。',
      '开始巡逻',
      {
        offeredReply: '矿场巡视交给我',
        activeReply: '矿场那边的差事，请再说一遍',
        claimableReply: '矿场侵扰已经平息，请执事查验',
        claimedReply: '请替我查查矿场巡视的功簿',
        instruction: {
          text: '去宗门矿脉巡视一趟，将侵扰矿场的妖兽驱逐干净，再回来复命。',
        },
      },
    ),
    target: 1,
  },
  {
    id: 'spirit_mining',
    kind: 'daily',
    enrollment: 'manual',
    requiredCapability: 'sect.tasks.use',
    executorKey: 'sect.mining',
    minimumDifficulty: 'normal',
    reward: {
      policy: 'sect.reward.realm-task',
      input: { baseContribution: 30 },
    },
    fulfillment: taskFulfillment('daily'),
    presentation: taskPresentation(
      '灵矿采掘',
      '进入宗门灵脉，以灵索采集一轮矿藏。',
      '开始采掘',
      {
        offeredReply: '今日灵矿采掘便交给我吧',
        activeReply: '灵矿采掘的封签，请再替我核对一遍',
        claimableReply: '今日采掘已经结束，请执事验收回执',
        claimedReply: '请替我查查灵矿采掘的功簿',
        instruction: {
          text: '去宗门灵脉开启采掘封签，以灵索带回足够矿藏，再回来复命。',
        },
      },
    ),
    target: 1,
  },
  {
    id: 'pill_delivery',
    kind: 'daily',
    enrollment: 'manual',
    requiredCapability: 'sect.task.pill_delivery.accept',
    executorKey: 'sect.delivery.pill',
    minimumDifficulty: 'easy',
    offer: {
      policy: 'sect.offer.delivery',
      input: { kind: 'pill' },
    },
    reward: {
      policy: 'sect.reward.realm-task',
      input: { baseContribution: 35 },
    },
    fulfillment: taskFulfillment('daily'),
    presentation: taskPresentation(
      '丹药委托',
      '寻来符合要求的丹药，补充宗门日常储备。',
      '选择丹药',
      {
        offeredReply: '丹房所需之物，我来寻',
        activeReply: '丹房那桩委托，请再说一遍',
        claimableReply: '丹药已经带回，请执事查验',
        claimedReply: '请替我查查丹药委托的功簿',
        instruction: {
          text: '替丹房寻来一枚合用的丹药，取得后直接带回事务堂即可。',
          requirementPrefix: '替丹房寻来',
          requirementSuffix: '，取得后直接带回事务堂即可。',
        },
      },
    ),
    target: 1,
  },
  {
    id: 'artifact_delivery',
    kind: 'daily',
    enrollment: 'manual',
    requiredCapability: 'sect.task.artifact_delivery.accept',
    executorKey: 'sect.delivery.artifact',
    minimumDifficulty: 'easy',
    offer: {
      policy: 'sect.offer.delivery',
      input: { kind: 'artifact' },
    },
    reward: {
      policy: 'sect.reward.realm-task',
      input: { baseContribution: 45 },
    },
    fulfillment: taskFulfillment('daily'),
    presentation: taskPresentation(
      '法宝委托',
      '寻来符合要求且未装备的法宝，交由宗门统一调度。',
      '选择法宝',
      {
        offeredReply: '法宝调度一事，我可以接下',
        activeReply: '法宝那桩委托，请再说一遍',
        claimableReply: '法宝已经移交，请执事查验',
        claimedReply: '请替我查查法宝委托的功簿',
        instruction: {
          text: '替宗门寻来一件合用的未装备法宝，带回事务堂核验。',
          requirementPrefix: '替宗门寻来',
          requirementSuffix: '，带回事务堂核验。',
        },
      },
    ),
    target: 1,
  },
  {
    id: 'weekly_diligence',
    kind: 'weekly',
    enrollment: 'automatic',
    requiredCapability: 'sect.tasks.use',
    executorKey: 'sect.progress',
    minimumDifficulty: 'easy',
    reward: {
      policy: 'sect.reward.realm-task',
      input: { baseContribution: 60 },
    },
    fulfillment: [],
    presentation: taskPresentation(
      '勤务周录',
      '一周完成五次宗门日常。',
      '查看进度',
      {
        offeredReply: '本周勤务也记我一份',
        activeReply: '本周勤务，我已经办到哪里了',
        claimableReply: '本周勤务已经办足，请执事查验',
        claimedReply: '请替我翻翻本周勤务的功簿',
        instruction: {
          text: '本周要完成五次宗门日常，功簿会逐次记下。',
        },
      },
    ),
    completionTags: ['weekly.diligence'],
    progress: {
      strategy: 'sect.progress.completed-daily',
      source: 'sect.task.daily.completed',
    },
    target: 5,
  },
  {
    id: 'weekly_tournament',
    kind: 'weekly',
    enrollment: 'manual',
    requiredCapability: 'sect.tasks.use',
    executorKey: 'sect.battle',
    minimumDifficulty: 'hard',
    executionLocation: {
      key: 'sect.arena',
      travelReply: '弟子这就去演武场候教',
    },
    reward: {
      policy: 'sect.reward.realm-task',
      input: { baseContribution: 40 },
    },
    fulfillment: [],
    presentation: taskPresentation(
      '宗门小比',
      '在演武傀儡前验证本周修行。',
      '参加宗门小比',
      {
        offeredReply: '本周小比，我来应战',
        activeReply: '小比的安排，请再说一遍',
        claimableReply: '本周小比已经结束，请执事查验',
        claimedReply: '请替我查查本周小比的功簿',
        instruction: {
          text: '去演武场参加本周小比，与试炼傀儡一战，取胜后再回来复命。',
        },
      },
    ),
    completionTags: ['promotion.tournament'],
    target: 1,
  },
  {
    id: 'weekly_bounty',
    kind: 'weekly',
    enrollment: 'manual',
    requiredCapability: 'sect.tasks.use',
    executorKey: 'sect.battle',
    minimumDifficulty: 'hard',
    reward: {
      policy: 'sect.reward.realm-task',
      input: { baseContribution: 60 },
    },
    fulfillment: [],
    presentation: taskPresentation(
      '悬赏令',
      '追缉叛徒残影或交付稀有材料。',
      '执行悬赏',
      {
        offeredReply: '这份悬赏由我来办',
        activeReply: '那份悬赏，请再交代一遍',
        claimableReply: '悬赏已经办妥，请执事查验',
        claimedReply: '请替我查查那份悬赏的功簿',
        instruction: {
          text: '循悬赏令所记线索追上目标，将其残影击溃后回来复命。',
          requirementPrefix: '这份悬赏要验一件证物。替我寻来',
          requirementSuffix: '，带回后我会核验其来路。',
        },
      },
    ),
    availability: bountyAvailability,
    completionTags: ['promotion.bounty'],
    target: 1,
  },
  {
    id: 'elder_trial',
    kind: 'promotion',
    enrollment: 'automatic',
    requiredCapability: 'sect.task.elder_trial.challenge',
    executorKey: 'sect.battle',
    fulfillment: [],
    presentation: taskPresentation(
      '长老试炼',
      '击败传功长老化身，取得真传资格。',
      '挑战长老试炼',
      {
        offeredReply: '弟子愿受晋升试炼',
        activeReply: '晋升试炼，请长老再作指点',
        claimableReply: '试炼已经通过，请长老查验',
        claimedReply: '请长老查验弟子的试炼记录',
        instruction: {
          text: '去试炼场迎战传功长老化身，胜过此关，才算取得真传资格。',
        },
      },
    ),
    completionTags: ['promotion.elder_trial'],
    target: 1,
  },
];

class StandardSectTaskCatalog implements SectTaskCatalog {
  private readonly byId: ReadonlyMap<string, SectTaskDefinition>;

  constructor() {
    this.byId = new Map(tasks.map((task) => [task.id, task]));
  }

  listDaily(): readonly SectTaskDefinition[] {
    return tasks.filter((task) => task.kind === 'daily');
  }

  listWeekly(): readonly SectTaskDefinition[] {
    return tasks.filter((task) => task.kind === 'weekly');
  }

  listPromotion(): readonly SectTaskDefinition[] {
    return tasks.filter((task) => task.kind === 'promotion');
  }

  get(id: SectOrganizationTaskId): SectTaskDefinition | undefined {
    return this.byId.get(id);
  }

  findByCompletionTag(tag: string) {
    return tasks.find((task) => task.completionTags?.includes(tag));
  }
}

class StandardSectEconomyPolicy implements SectEconomyPolicy {
  stipendBase(rank: SectDiscipleRank): number {
    return { registered: 500, outer: 1500, inner: 4000, true: 10000 }[rank];
  }
}

class StandardSectConstructionPolicy implements SectConstructionPolicy {
  readonly facilities = [
    { key: 'archive', initialLevel: 1, maxLevel: 5, upgradeable: true },
    {
      key: 'cultivation_room',
      initialLevel: 1,
      maxLevel: 5,
      upgradeable: true,
    },
    { key: 'workshop', initialLevel: 1, maxLevel: 5, upgradeable: true },
    { key: 'spirit_vein', initialLevel: 1, maxLevel: 5, upgradeable: true },
    { key: 'herb_garden', initialLevel: 1, maxLevel: 5, upgradeable: true },
    { key: 'formation', initialLevel: 0, maxLevel: 0, upgradeable: false },
  ] as const;

  upgradeTarget(currentLevel: number): number | null {
    return getSectFacilityUpgradeTarget(currentLevel);
  }
}

function opponentFactory(options: {
  title: string;
  name: string;
  multiplier: number;
  prefersMemberMirror?: boolean;
}): SectOpponentFactory {
  return {
    prefersMemberMirror: options.prefersMemberMirror ?? false,
    create({ player, mirror, opponentId }) {
      const opponent =
        options.prefersMemberMirror && mirror
          ? createMirrorOpponent(
              mirror,
              opponentId,
              options.name,
              options.multiplier,
            )
          : createRealmNpcOpponent(
              player,
              opponentId,
              options.prefersMemberMirror
                ? `无名${options.name}`
                : options.name,
              options.multiplier,
            );
      return { opponent, title: options.title };
    },
  };
}

const ATTRIBUTE_KEYS = [
  'vitality',
  'spirit',
  'wisdom',
  'speed',
  'willpower',
] as const;

function scaledRealmAttributes(
  player: Pick<CultivatorCombatInput, 'realm' | 'realm_stage'>,
  multiplier: number,
): Attributes {
  const budget = getRealmStageAttributeBudget(player.realm, player.realm_stage);
  const base = Math.floor(budget / ATTRIBUTE_KEYS.length);
  const remainder = budget % ATTRIBUTE_KEYS.length;
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map((key, index) => [
      key,
      Math.max(
        1,
        Math.floor((base + (index < remainder ? 1 : 0)) * multiplier),
      ),
    ]),
  ) as unknown as Attributes;
}

function createRealmNpcOpponent(
  player: Pick<CultivatorCombatInput, 'realm' | 'realm_stage'>,
  opponentId: string,
  name: string,
  multiplier: number,
): CultivatorCombatInput {
  return {
    id: opponentId,
    name,
    realm: player.realm,
    realm_stage: player.realm_stage,
    attributes: scaledRealmAttributes(player, multiplier),
    spiritual_roots: [],
    pre_heaven_fates: [],
    cultivations: [],
    skills: [],
    inventory: { artifacts: [] },
    equipped: { weapon: null, armor: null, accessory: null },
  };
}

function createMirrorOpponent(
  source: CultivatorCombatInput,
  opponentId: string,
  name: string,
  multiplier: number,
): CultivatorCombatInput {
  const opponent = structuredClone(source);
  opponent.id = opponentId;
  opponent.name = name;
  opponent.attributes = Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [
      key,
      Math.max(1, Math.floor(source.attributes[key] * multiplier)),
    ]),
  ) as unknown as Attributes;
  return opponent;
}

const battleScenarioDefinitions = {
  mine_patrol: { title: '矿场巡视', name: '矿脉侵扰妖兽', multiplier: 0.75 },
  weekly_tournament: {
    title: '宗门小比',
    name: '同门演武傀儡',
    multiplier: 0.95,
  },
  weekly_bounty: {
    title: '悬赏残影战',
    name: '叛徒残影',
    multiplier: 1,
    prefersMemberMirror: true,
  },
  elder_trial: { title: '长老试炼', name: '传功长老化身', multiplier: 1.05 },
} as const;

class StandardSectBattleScenarioCatalog implements SectBattleScenarioCatalog {
  private readonly scenarios: ReadonlyMap<string, SectOpponentFactory>;

  constructor() {
    this.scenarios = new Map(
      Object.entries(battleScenarioDefinitions).map(([taskId, definition]) => [
        taskId,
        opponentFactory(definition),
      ]),
    );
  }

  get(taskId: SectOrganizationTaskId): SectOpponentFactory | undefined {
    return this.scenarios.get(taskId);
  }
}

class StandardSectRankPolicy implements SectRankPolicy {
  nextRank(rank: SectDiscipleRank): SectDiscipleRank | null {
    return (
      {
        registered: 'outer',
        outer: 'inner',
        inner: 'true',
        true: null,
      } as const
    )[rank];
  }

  methodLevelCap(rank: SectDiscipleRank): number {
    return SECT_RANK_METHOD_CAP[rank];
  }

  requirement(
    rank: Exclude<SectDiscipleRank, 'registered'>,
  ): SectRankRequirement {
    const requirements: Record<
      Exclude<SectDiscipleRank, 'registered'>,
      SectRankRequirement
    > = {
      outer: {
        rank: 'outer',
        minRealm: '炼气',
        contribution: 100,
        dailyCompletions: 3,
      },
      inner: {
        rank: 'inner',
        minRealm: '筑基',
        contribution: 500,
        requiredTaskTags: [
          { tag: 'promotion.tournament', label: '完成一次宗门小比' },
        ],
      },
      true: {
        rank: 'true',
        minRealm: '金丹',
        contribution: 3000,
        requiredTaskTags: [
          { tag: 'promotion.bounty', label: '完成一次悬赏令' },
          { tag: 'promotion.elder_trial', label: '通过长老试炼' },
        ],
      },
    };
    return requirements[rank];
  }
}

class StandardSectBenefitPolicy implements SectBenefitPolicy {
  constructor(private readonly theme: SectOrganizationTheme = {}) {}

  private facilityName(key: string, fallback: string): string {
    return this.theme.facilityNames?.[key] ?? fallback;
  }

  snapshot(levels: ReadonlyMap<string, number>, rank: SectDiscipleRank) {
    const cultivationLevel = this.level(levels, 'cultivation_room');
    const workshopLevel = this.level(levels, 'workshop');
    const spiritVeinLevel = this.level(levels, 'spirit_vein');
    const herbGardenLevel = this.level(levels, 'herb_garden');
    const alchemy = this.craftDiscount(
      SECT_CRAFT_CONTEXTS.alchemy,
      levels,
      rank,
    ).discount;
    const refinery = this.craftDiscount(
      SECT_CRAFT_CONTEXTS.refinery,
      levels,
      rank,
    ).discount;
    const retreatMultiplier = this.retreatMultiplier(levels);
    return {
      retreatMultiplier,
      craftDiscounts: {
        [SECT_CRAFT_CONTEXTS.alchemy]: alchemy,
        [SECT_CRAFT_CONTEXTS.refinery]: refinery,
      },
      facilityEffects: {
        cultivation_room: {
          renderer: 'sect.benefit.retreat',
          summary: `闭关修为提高 ${Math.round((retreatMultiplier - 1) * 100)}%`,
          metrics: [
            {
              key: 'level',
              label: `${this.facilityName('cultivation_room', '修炼室')}等级`,
              value: cultivationLevel,
              format: 'number' as const,
            },
            {
              key: 'retreat_bonus',
              label: '闭关修为加成',
              value: cultivationLevel * 0.02,
              format: 'percent' as const,
            },
          ],
        },
        alchemy: {
          renderer: 'sect.benefit.craft',
          summary: `炼丹灵石消耗减免 ${Math.round(alchemy * 100)}%`,
          metrics: [
            {
              key: 'level',
              label: `${this.facilityName('workshop', '丹器坊')}等级`,
              value: workshopLevel,
              format: 'number' as const,
            },
          ],
        },
        refinery: {
          renderer: 'sect.benefit.craft',
          summary: `炼器灵石消耗减免 ${Math.round(refinery * 100)}%`,
          metrics: [
            {
              key: 'level',
              label: `${this.facilityName('workshop', '丹器坊')}等级`,
              value: workshopLevel,
              format: 'number' as const,
            },
          ],
        },
        spirit_vein: {
          renderer: 'sect.benefit.stipend',
          summary: `周俸灵石提高 ${spiritVeinLevel * 5}%`,
          metrics: [
            {
              key: 'level',
              label: `${this.facilityName('spirit_vein', '灵脉')}等级`,
              value: spiritVeinLevel,
              format: 'number' as const,
            },
          ],
        },
        herb_garden: {
          renderer: 'sect.benefit.herbs',
          summary: `每周产出 ${herbGardenLevel} 份基础灵草`,
          metrics: [
            {
              key: 'level',
              label: `${this.facilityName('herb_garden', '药田')}等级`,
              value: herbGardenLevel,
              format: 'number' as const,
            },
            {
              key: 'weekly_herbs',
              label: '每周基础灵草',
              value: herbGardenLevel,
              format: 'number' as const,
            },
          ],
        },
      },
    };
  }

  private level(levels: ReadonlyMap<string, number>, key: string): number {
    return Math.max(1, Math.min(5, Math.floor(levels.get(key) ?? 1)));
  }

  archiveLevel(levels: ReadonlyMap<string, number>): number {
    return levels.get('archive') ?? 1;
  }

  methodLevelCap(levels: ReadonlyMap<string, number>): number {
    const level = Math.max(
      1,
      Math.min(5, Math.floor(this.archiveLevel(levels))),
    );
    return (
      STANDARD_SECT_ARCHIVE_METHOD_CAP[level] ??
      STANDARD_SECT_ARCHIVE_METHOD_CAP[1]
    );
  }

  retreatMultiplier(levels: ReadonlyMap<string, number>): number {
    return 1 + this.level(levels, 'cultivation_room') * 0.02;
  }

  craftDiscount(
    craftContext: SectCraftContextKey,
    levels: ReadonlyMap<string, number>,
    rank: SectDiscipleRank,
  ) {
    const level = this.level(levels, 'workshop');
    return {
      capability:
        craftContext === SECT_CRAFT_CONTEXTS.refinery
          ? 'sect.facility.refinery.use'
          : 'sect.facility.alchemy.use',
      discount: Math.min(0.2, level * 0.02 + (rank === 'true' ? 0.1 : 0)),
    };
  }

  stipendMultiplier(levels: ReadonlyMap<string, number>): number {
    return 1 + this.level(levels, 'spirit_vein') * 0.05;
  }
}

export interface SectOrganizationTheme {
  facilityNames?: Partial<Record<string, string>>;
}

export class StandardSectOrganizationModule implements SectOrganizationModule {
  readonly capabilities = capabilities;
  readonly ranks = new StandardSectRankPolicy();
  readonly tasks: SectTaskCatalog;
  readonly economy: SectEconomyPolicy;
  readonly construction = new StandardSectConstructionPolicy();
  readonly battles: SectBattleScenarioCatalog;
  readonly benefits: SectBenefitPolicy;

  constructor(readonly theme: SectOrganizationTheme = {}) {
    this.tasks = new StandardSectTaskCatalog();
    this.economy = new StandardSectEconomyPolicy();
    this.battles = new StandardSectBattleScenarioCatalog();
    this.benefits = new StandardSectBenefitPolicy(theme);
  }
}

export const standardSectOrganization = new StandardSectOrganizationModule();

import type { DailyTaskDifficulty } from '@shared/engine/cultivation/exp-gain-strategies/types';
import {
  getEquipmentSlotLabel,
  getMaterialTypeLabel,
} from '@shared/lib/gameConceptDisplay';
import { getPillAppearanceLabel } from '@shared/lib/pillAppearance';
import {
  EQUIPMENT_SLOT_VALUES,
  MATERIAL_TYPE_VALUES,
  QUALITY_ORDER,
  QUALITY_VALUES,
  REALM_ORDER,
  type ElementType,
  type MaterialType,
  type Quality,
  type RealmType,
} from '@shared/types/constants';
import {
  PILL_APPEARANCE_GRADE_VALUES,
  PILL_FAMILY_VALUES,
  type PillFamily,
} from '@shared/types/consumable';
import { z } from 'zod';
import type {
  SectTaskDialogueEmphasis,
  SectTaskDialogueSegment,
} from './contracts';

export const SECT_PILL_TRAIT_KEYS = [
  'restore_hp',
  'restore_mp',
  'detox',
  'gain_cultivation',
  'gain_insight',
  'breakthrough_support',
  'tempering',
  'marrow_wash',
  'increase_lifespan',
] as const;

export type SectPillTraitKey = (typeof SECT_PILL_TRAIT_KEYS)[number];
export type SectSubmissionItemKind = 'pill' | 'artifact' | 'material';

const SECT_PILL_FAMILY_LABELS: Record<PillFamily, string> = {
  healing: '疗伤丹',
  mana: '回元丹',
  detox: '解毒丹',
  cultivation: '修为丹',
  insight: '悟性丹',
  breakthrough: '破境辅助丹',
  tempering: '淬体丹',
  marrow_wash: '洗髓丹',
  longevity: '延寿丹',
  hybrid: '复合丹',
};

const SECT_PILL_TRAIT_LABELS: Record<SectPillTraitKey, string> = {
  restore_hp: '恢复气血',
  restore_mp: '恢复法力',
  detox: '解毒祛浊',
  gain_cultivation: '增加修为',
  gain_insight: '增加感悟',
  breakthrough_support: '辅助突破',
  tempering: '淬炼体魄',
  marrow_wash: '洗髓伐脉',
  increase_lifespan: '增加寿元',
};

export function getSectPillFamilyLabel(family: PillFamily): string {
  return SECT_PILL_FAMILY_LABELS[family];
}

export function getSectPillTraitLabel(trait: SectPillTraitKey): string {
  return SECT_PILL_TRAIT_LABELS[trait];
}

const QualitySchema = z.enum(QUALITY_VALUES);
const AppearanceSchema = z.enum(PILL_APPEARANCE_GRADE_VALUES);

export const SectPillDeliveryRequirementSchema = z
  .object({
    kind: z.literal('pill'),
    quantity: z.literal(1),
    minQuality: QualitySchema,
    family: z.enum(PILL_FAMILY_VALUES).optional(),
    trait: z.enum(SECT_PILL_TRAIT_KEYS).optional(),
    appearance: z
      .object({
        mode: z.enum(['at_least', 'exact']),
        grade: AppearanceSchema,
      })
      .optional(),
  })
  .strict();

export const SectArtifactDeliveryRequirementSchema = z
  .object({
    kind: z.literal('artifact'),
    quantity: z.literal(1),
    minQuality: QualitySchema,
    slot: z.enum(EQUIPMENT_SLOT_VALUES).optional(),
    minPerfectAffixCount: z.number().int().min(1).max(8).optional(),
  })
  .strict();

export const SectMaterialDeliveryRequirementSchema = z
  .object({
    kind: z.literal('material'),
    quantity: z.number().int().min(1).max(3),
    minQuality: QualitySchema,
    materialType: z.enum(MATERIAL_TYPE_VALUES).optional(),
    element: z
      .enum(['金', '木', '水', '火', '土', '风', '雷', '冰'])
      .optional(),
  })
  .strict();

export const SectDeliveryRequirementSchema = z.discriminatedUnion('kind', [
  SectPillDeliveryRequirementSchema,
  SectArtifactDeliveryRequirementSchema,
  SectMaterialDeliveryRequirementSchema,
]);

export type SectPillDeliveryRequirement = z.infer<
  typeof SectPillDeliveryRequirementSchema
>;
export type SectArtifactDeliveryRequirement = z.infer<
  typeof SectArtifactDeliveryRequirementSchema
>;
export type SectMaterialDeliveryRequirement = z.infer<
  typeof SectMaterialDeliveryRequirementSchema
>;
export type SectDeliveryRequirement = z.infer<
  typeof SectDeliveryRequirementSchema
>;

export interface SectRealmQualityRule {
  readonly weights: Readonly<Partial<Record<Quality, number>>>;
}

export const SECT_REALM_QUALITY_RULES: Readonly<
  Record<RealmType, SectRealmQualityRule>
> = {
  炼气: { weights: { 凡品: 70, 灵品: 30 } },
  筑基: { weights: { 灵品: 70, 玄品: 30 } },
  金丹: { weights: { 玄品: 75, 真品: 25 } },
  元婴: { weights: { 玄品: 55, 真品: 30, 地品: 15 } },
  化神: { weights: { 玄品: 45, 真品: 30, 地品: 18, 天品: 7 } },
  炼虚: { weights: { 玄品: 40, 真品: 28, 地品: 18, 天品: 11, 仙品: 3 } },
  合体: { weights: { 玄品: 35, 真品: 28, 地品: 20, 天品: 13, 仙品: 4 } },
  大乘: { weights: { 玄品: 30, 真品: 27, 地品: 22, 天品: 16, 仙品: 5 } },
  渡劫: { weights: { 玄品: 25, 真品: 25, 地品: 23, 天品: 20, 仙品: 7 } },
};

export function assertSectRealmQualityRules(
  rules: Readonly<
    Record<RealmType, SectRealmQualityRule>
  > = SECT_REALM_QUALITY_RULES,
): void {
  for (const [realm, rule] of Object.entries(rules) as Array<
    [RealmType, SectRealmQualityRule]
  >) {
    const entries = Object.entries(rule.weights) as Array<[Quality, number]>;
    if (entries.length === 0) throw new Error(`宗门任务品质配置为空：${realm}`);
    if (
      entries.some(
        ([quality, weight]) =>
          quality === '神品' ||
          !Number.isFinite(weight) ||
          !Number.isInteger(weight) ||
          weight <= 0,
      )
    )
      throw new Error(`宗门任务品质配置无效：${realm}`);
    if (entries.reduce((sum, [, weight]) => sum + weight, 0) !== 100)
      throw new Error(`宗门任务品质权重总和必须为 100：${realm}`);
    if (
      REALM_ORDER[realm] >= REALM_ORDER['金丹'] &&
      entries.some(
        ([quality]) => QUALITY_ORDER[quality] < QUALITY_ORDER['玄品'],
      )
    )
      throw new Error(`金丹及以上不得要求玄品以下物品：${realm}`);
    if (
      entries.some(
        ([quality]) => QUALITY_ORDER[quality] > QUALITY_ORDER['仙品'],
      )
    )
      throw new Error(`宗门任务不得要求仙品以上物品：${realm}`);
  }
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class SectTaskRandomSource {
  private state: number;

  constructor(seed: string) {
    this.state = hashSeed(seed) || 0x6d2b79f5;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('宗门任务随机池不能为空');
    return items[
      Math.min(items.length - 1, Math.floor(this.next() * items.length))
    ]!;
  }
}

export function pickSectTaskMinimumQuality(
  realm: RealmType,
  random: SectTaskRandomSource,
): Quality {
  const entries = Object.entries(
    SECT_REALM_QUALITY_RULES[realm].weights,
  ) as Array<[Quality, number]>;
  const roll = random.next() * 100;
  let cumulative = 0;
  for (const [quality, weight] of entries) {
    cumulative += weight;
    if (roll < cumulative) return quality;
  }
  return entries[entries.length - 1]![0];
}

const PILL_TRAIT_TEMPLATES: readonly {
  family: PillFamily;
  trait: SectPillTraitKey;
}[] = [
  { family: 'healing', trait: 'restore_hp' },
  { family: 'mana', trait: 'restore_mp' },
  { family: 'detox', trait: 'detox' },
  { family: 'cultivation', trait: 'gain_cultivation' },
  { family: 'insight', trait: 'gain_insight' },
  { family: 'breakthrough', trait: 'breakthrough_support' },
  { family: 'tempering', trait: 'tempering' },
  { family: 'marrow_wash', trait: 'marrow_wash' },
  { family: 'longevity', trait: 'increase_lifespan' },
] as const;

const MATERIAL_TYPES: readonly MaterialType[] = [
  'herb',
  'ore',
  'monster',
  'aux',
];
const ELEMENTS: readonly ElementType[] = [
  '金',
  '木',
  '水',
  '火',
  '土',
  '风',
  '雷',
  '冰',
];

function compoundChance(realm: RealmType): number {
  return Math.min(0.65, 0.15 + REALM_ORDER[realm] * 0.065);
}

export function generateSectDeliveryRequirement(input: {
  kind: SectSubmissionItemKind;
  realm: RealmType;
  seed: string;
}): SectDeliveryRequirement {
  const random = new SectTaskRandomSource(input.seed);
  const minQuality = pickSectTaskMinimumQuality(input.realm, random);
  const compound = random.next() < compoundChance(input.realm);

  if (input.kind === 'pill') {
    if (!compound) return { kind: 'pill', quantity: 1, minQuality };
    const template = random.pick(PILL_TRAIT_TEMPLATES);
    const appearanceRoll = random.next();
    const appearance =
      appearanceRoll < 0.2
        ? { mode: 'exact' as const, grade: 'perfect' as const }
        : appearanceRoll < 0.55
          ? { mode: 'at_least' as const, grade: 'high' as const }
          : undefined;
    return {
      kind: 'pill',
      quantity: 1,
      minQuality,
      family: template.family,
      trait: template.trait,
      ...(appearance ? { appearance } : {}),
    };
  }

  if (input.kind === 'artifact') {
    if (!compound) return { kind: 'artifact', quantity: 1, minQuality };
    return {
      kind: 'artifact',
      quantity: 1,
      minQuality,
      slot: random.pick(EQUIPMENT_SLOT_VALUES),
      ...(random.next() < 0.45 ? { minPerfectAffixCount: 1 } : {}),
    };
  }

  const highQuality = QUALITY_ORDER[minQuality] >= QUALITY_ORDER['地品'];
  return {
    kind: 'material',
    quantity: highQuality ? 1 : 1 + Math.floor(random.next() * 3),
    minQuality,
    ...(compound ? { materialType: random.pick(MATERIAL_TYPES) } : {}),
    ...(compound && random.next() < 0.35
      ? { element: random.pick(ELEMENTS) }
      : {}),
  };
}

export function calculateSectDeliveryDifficulty(
  requirement: SectDeliveryRequirement,
): DailyTaskDifficulty {
  let score = QUALITY_ORDER[requirement.minQuality] * 2;
  if (requirement.kind === 'pill') {
    if (requirement.family) score += 1;
    if (requirement.trait) score += 2;
    if (requirement.appearance?.mode === 'exact') score += 3;
    else if (
      requirement.appearance &&
      ['high', 'perfect'].includes(requirement.appearance.grade)
    )
      score += 2;
  } else if (requirement.kind === 'artifact') {
    if (requirement.slot) score += 1;
    if ((requirement.minPerfectAffixCount ?? 0) > 0) score += 3;
  } else {
    if (requirement.materialType) score += 1;
    if (requirement.element) score += 1;
  }
  if (score <= 3) return 'easy';
  if (score <= 6) return 'normal';
  if (score <= 10) return 'hard';
  return 'elite';
}

function emphasized(
  text: string,
  emphasis: SectTaskDialogueEmphasis,
): SectTaskDialogueSegment {
  return { text, emphasis };
}

export function formatSectDeliveryRequirement(
  requirement: SectDeliveryRequirement,
): readonly SectTaskDialogueSegment[] {
  const segments: SectTaskDialogueSegment[] = [
    emphasized(
      `${requirement.quantity}${requirement.kind === 'pill' ? '颗' : requirement.kind === 'artifact' ? '件' : '份'}`,
      'quantity',
    ),
    emphasized(`${requirement.minQuality}以上`, 'quality'),
  ];

  if (requirement.kind === 'pill') {
    if (requirement.trait) {
      segments.push(
        { text: '、具有' },
        emphasized(getSectPillTraitLabel(requirement.trait), 'effect'),
        { text: '功效' },
      );
    }
    if (requirement.family) {
      segments.push(
        { text: '的' },
        emphasized(getSectPillFamilyLabel(requirement.family), 'effect'),
      );
    } else {
      segments.push({ text: '的丹药' });
    }
    if (requirement.appearance) {
      segments.push(
        {
          text:
            requirement.appearance.mode === 'exact'
              ? '，品相须为'
              : '，品相不可低于',
        },
        emphasized(
          getPillAppearanceLabel(requirement.appearance.grade),
          'appearance',
        ),
      );
    }
    return segments;
  }

  if (requirement.kind === 'artifact') {
    segments.push({ text: '的' });
    if (requirement.slot) {
      segments.push(
        emphasized(getEquipmentSlotLabel(requirement.slot), 'effect'),
      );
    } else {
      segments.push({ text: '法宝' });
    }
    segments.push({ text: '，必须处于' }, emphasized('未装备', 'warning'), {
      text: '状态',
    });
    if (requirement.minPerfectAffixCount) {
      segments.push(
        { text: '，并带有至少' },
        emphasized(`${requirement.minPerfectAffixCount}条`, 'quantity'),
        { text: '完美词条' },
      );
    }
    return segments;
  }

  segments.push({ text: '的' });
  if (requirement.materialType) {
    segments.push(
      emphasized(getMaterialTypeLabel(requirement.materialType), 'effect'),
      { text: '类' },
    );
  }
  if (requirement.element) {
    segments.push(emphasized(`${requirement.element}属性`, 'effect'));
  }
  segments.push({ text: '材料' });
  return segments;
}

export function describeSectDeliveryRequirement(
  requirement: SectDeliveryRequirement,
): string {
  return formatSectDeliveryRequirement(requirement)
    .map((segment) => segment.text)
    .join('');
}

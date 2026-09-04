import { renderPromptSystem, renderPromptUser } from '@server/lib/prompts';
import { generateAiText } from '@server/utils/aiClient';
import { CREATION_MATERIAL_SEMANTIC_TAGS, CreationTags } from '@shared/engine/shared/tag-domain';
import { ELEMENT_VALUES, QUALITY_VALUES, type ElementType, type Quality } from '@shared/types/constants';
import type { Material } from '@shared/types/cultivator';
import { z } from 'zod';
import { SPIRIT_SEED_QUALITY_CHANCE_MAP, getSpiritFieldQualityBalance } from './config';
import { buildSpiritFieldSeedMaterialFromPlant } from './seedMaterial';
import { SPIRIT_FIELD_CULTIVATION_METHODS, SPIRIT_FIELD_OUTCOME_KINDS, SPIRIT_SEED_GROWTH_FORMS, SPIRIT_SEED_GROWTH_TRAITS, SPIRIT_SEED_HABITAT_TAGS, SPIRIT_SEED_HARVEST_PARTS, SPIRIT_SEED_USE_TAGS, type SpiritFieldPlantSnapshot, type SpiritSeedIdentity, type SpiritSeedRandomOptions, type SpiritSeedSkeleton } from './types';

const SpiritSeedAISchema = z.object({
  seedName: z.string().trim().min(2).max(12),
  seedDescription: z.string().trim().min(12).max(100),
  clueTexts: z.array(z.string().trim().min(6).max(48)).min(2).max(3),
  element: z.enum(ELEMENT_VALUES),
  growthForm: z.enum(SPIRIT_SEED_GROWTH_FORMS),
  harvestPart: z.enum(SPIRIT_SEED_HARVEST_PARTS),
  preferredMethods: z.array(z.enum(SPIRIT_FIELD_CULTIVATION_METHODS)).min(2).max(6),
  avoidedMethods: z.array(z.enum(SPIRIT_FIELD_CULTIVATION_METHODS)).max(4),
  preferredHabitats: z.array(z.enum(SPIRIT_SEED_HABITAT_TAGS)).min(1).max(3),
  avoidedHabitats: z.array(z.enum(SPIRIT_SEED_HABITAT_TAGS)).max(2),
  growthTraits: z.array(z.enum(SPIRIT_SEED_GROWTH_TRAITS)).min(1).max(4),
  useTags: z.array(z.enum(SPIRIT_SEED_USE_TAGS)).min(1).max(4),
  outcomeBiases: z.array(z.enum(SPIRIT_FIELD_OUTCOME_KINDS)).min(1).max(3),
  creationTags: z.array(z.enum(CREATION_MATERIAL_SEMANTIC_TAGS)).min(1).max(5),
}).strict();

export interface SpiritSeedBatchSpec { rank: Quality; quantity: number; element?: ElementType; regionTags?: string[] }

function pickWeightedQuality(options: SpiritSeedRandomOptions, rng: () => number): Quality {
  if (options.guaranteedRank) return options.guaranteedRank;
  const min = options.rankRange ? QUALITY_VALUES.indexOf(options.rankRange.min) : 0;
  const max = options.rankRange ? QUALITY_VALUES.indexOf(options.rankRange.max) : QUALITY_VALUES.length - 1;
  const candidates = QUALITY_VALUES.slice(Math.min(min, max), Math.max(min, max) + 1);
  const weights = options.qualityChanceMap ?? SPIRIT_SEED_QUALITY_CHANCE_MAP;
  const total = candidates.reduce((sum, quality) => sum + Math.max(0, weights[quality]), 0);
  let cursor = rng() * total;
  for (const quality of candidates) { cursor -= Math.max(0, weights[quality]); if (cursor <= 0) return quality; }
  return candidates[candidates.length - 1] ?? '凡品';
}

function requestList(skeletons: SpiritSeedSkeleton[]): string { return skeletons.map((item, index) => `${index + 1}. 品质=${item.rank}；元素=${item.forcedElement ?? '自选'}；地域=${item.regionTags?.join('、') || '无'}`).join('\n'); }

function anchorText<K extends string>(values: readonly K[], anchors: Partial<Record<K, string>>): string {
  return values.map((v) => `${v}${anchors[v] ? `=${anchors[v]}` : ''}`).join('；');
}

// 枚举锚点仅为模型提供“该编码对应什么生态意象”的简短提示，不允许出现在玩家可见文案中。
const ELEMENT_ANCHORS: Partial<Record<(typeof ELEMENT_VALUES)[number], string>> = {
  烛: '灯火照夜、燃灯温养、金锐坚壳（旧五行“金”的烬洲意象）',
  尸: '腐植滋生、腌物转生、草木根芽（旧五行“木”的烬洲意象）',
  星: '寒露夜露、润泽蓄藏（旧五行“水”的烬洲意象）',
  渊: '热力涌动、注视吞没、灯之反面（旧五行“火”的烬洲意象）',
  梦: '厚壤凝形、梦涎垂落（旧五行“土”的烬洲意象）',
  噬: '侵蚀扩散、噬咬流动（旧五行“风”的烬洲意象）',
  帘: '幕帘裂隙、骤然显现（旧五行“雷”的烬洲意象）',
  疫: '阴寒封冻、病气沉寂（旧五行“冰”的烬洲意象）',
};
const GROWTH_FORM_ANCHORS: Partial<Record<(typeof SPIRIT_SEED_GROWTH_FORMS)[number], string>> = { herb: '草本/丛生', flower: '开花植株', vine: '藤蔓', shrub: '灌木', tree: '乔木', fungus: '菌体', aquatic: '水生', root: '根块状' };
const HARVEST_PART_ANCHORS: Partial<Record<(typeof SPIRIT_SEED_HARVEST_PARTS)[number], string>> = { leaf: '叶', flower: '花', fruit: '果', root: '根', rhizome: '根茎', whole: '全株', spore: '孢子', seedpod: '荚籽' };
const METHOD_ANCHORS: Partial<Record<(typeof SPIRIT_FIELD_CULTIVATION_METHODS)[number], string>> = { seasonal_nurture: '顺时温养', qi_sprout: '灯油催芽', stone_soil: '灯油固壤', sun_wake: '向阳醒种', shade_dew: '荫棚集露', ore_soil: '矿砂改土', aux_formation: '辅材醒灯阵', rest_nurture: '静置养性', intrinsic_infusion: '本命灌注', qi_growth: '灯油催生', herb_companion: '药材伴养', monster_blood: '腌血沃根', pill_nourish: '化香培元', tcdb_return: '天材返哺', aux_gather: '辅阵聚灯', leaf_medicine: '凝叶成药', flower_fruit: '开花结果', return_treasure: '返源化宝', natural_form: '顺势化形' };
const HABITAT_ANCHORS: Partial<Record<(typeof SPIRIT_SEED_HABITAT_TAGS)[number], string>> = { mountain: '山地', valley: '谷地', forest: '林间', cave: '洞穴', wetland: '湿地', waterside: '水畔', rocky: '岩地', volcanic: '地热火山土', cold: '寒地', warm: '暖地', shaded: '荫蔽', sunny: '向阳' };
const TRAIT_ANCHORS: Partial<Record<(typeof SPIRIT_SEED_GROWTH_TRAITS)[number], string>> = { 'slow-rooting': '缓生根系', 'quick-sprouting': '萌发迅捷', 'qi-sensitive': '对灯机灵气敏感', 'stone-loving': '喜矿岩', 'companion-loving': '喜伴生', 'blood-fed': '嗜血气', 'sun-seeking': '趋光', 'dew-seeking': '趋露' };
const USE_TAG_ANCHORS: Partial<Record<(typeof SPIRIT_SEED_USE_TAGS)[number], string>> = { alchemy: '炼香合香', healing: '疗伤', 'qi-restoration': '回气', 'spirit-nourishing': '养神', 'body-tempering': '淬体', 'marrow-wash': '洗髓', longevity: '延寿', breakthrough: '助破境', detox: '解毒', meridian: '通脉', formation: '阵法辅材' };
const OUTCOME_ANCHORS: Partial<Record<(typeof SPIRIT_FIELD_OUTCOME_KINDS)[number], string>> = { herb: '香材草本', tcdb: '天材地宝', spirit_fruit: '灵果' };

function buildSpiritSeedEnumDictionary(): string {
  const heads: string[] = [
    '## 允许值字典（必须逐字使用下列编码；可见文案不得出现任何编码本身）',
    `- element（必填，单值，烬洲八窍元素）：${anchorText(ELEMENT_VALUES, ELEMENT_ANCHORS)}`,
    `- growthForm（必填，单值，植株形态）：${anchorText(SPIRIT_SEED_GROWTH_FORMS, GROWTH_FORM_ANCHORS)}`,
    `- harvestPart（必填，单值，采收部位）：${anchorText(SPIRIT_SEED_HARVEST_PARTS, HARVEST_PART_ANCHORS)}`,
    `- preferredMethods（2～6 项）/ avoidedMethods（≤4 项）：${anchorText(SPIRIT_FIELD_CULTIVATION_METHODS, METHOD_ANCHORS)}`,
    `- preferredHabitats（1～3 项）/ avoidedHabitats（≤2 项）：${anchorText(SPIRIT_SEED_HABITAT_TAGS, HABITAT_ANCHORS)}`,
    `- growthTraits（1～4 项）：${anchorText(SPIRIT_SEED_GROWTH_TRAITS, TRAIT_ANCHORS)}`,
    `- useTags（1～4 项）：${anchorText(SPIRIT_SEED_USE_TAGS, USE_TAG_ANCHORS)}`,
    `- outcomeBiases（1～3 项）：${anchorText(SPIRIT_FIELD_OUTCOME_KINDS, OUTCOME_ANCHORS)}`,
    `- creationTags（1～5 项）：${CREATION_MATERIAL_SEMANTIC_TAGS.join('；')}`,
    '  （creationTags 为点分语义编码，末段即语义：Flame=灼焰、Freeze=冰寒、Thunder=幕隙雷动、Wind=风行、Blade=锋刃、Guard=坚壁、Burst=烈性、Sustain=持续、Manual=典籍、Spirit=神魂、Earth=厚土、Metal=金锐、Water=润泽、Wood=生发、Poison=毒秽、Divine=神异、Space=虚空、Time=时序、Life=生机、Alchemy=合香炼香、Refining=炼器、Beast=兽类、Blood=血气、Bone=骨殖、Formation=阵法、Illusion=幻象、Qi=灯油灵气）',
    '要求：优先让 creationTags 与 element / growthForm / 用途相互呼应；不要编造清单之外的编码。',
    'creationTags 必须从清单中“原样逐字复制”，禁止近义改写或自行拼接（例如把 Flame 写成 Fire、把 Qi 写成 Energy、把 Alchemy 写成 Healing 都算非法）。清单里找不到贴切项时宁少勿错。',
  ];
  return `\n\n${heads.join('\n')}`;
}

function fallbackIdentity(skeleton: SpiritSeedSkeleton, index: number): SpiritSeedIdentity {
  const element = skeleton.forcedElement ?? ELEMENT_VALUES[index % ELEMENT_VALUES.length] ?? '尸';
  return {
    seedName: `${element}纹眠籽`,
    seedDescription: `灰青种壳上浮着一线${element}行微光，握在掌中时灯机时隐时现。`,
    clueTexts: ['种壳遇到温和灯机时会轻轻发热', '其内生机不喜骤然催逼，似宜循序培护'],
    element, growthForm: 'herb', harvestPart: 'leaf',
    preferredMethods: ['seasonal_nurture', 'intrinsic_infusion', 'natural_form'],
    avoidedMethods: ['monster_blood'], preferredHabitats: ['mountain'], avoidedHabitats: [],
    growthTraits: ['qi-sensitive'], useTags: ['alchemy'], outcomeBiases: ['herb'],
    creationTags: [CreationTags.MATERIAL.SEMANTIC_WOOD, CreationTags.MATERIAL.SEMANTIC_ALCHEMY],
  };
}

function normalizeIdentityClues(
  identity: SpiritSeedIdentity,
  fallback: SpiritSeedIdentity,
): SpiritSeedIdentity {
  const hiddenTokens = [
    ...identity.preferredMethods,
    ...identity.avoidedMethods,
    ...identity.preferredHabitats,
    ...identity.avoidedHabitats,
    ...identity.growthTraits,
    ...identity.useTags,
    ...identity.outcomeBiases,
    ...identity.creationTags,
  ];
  const clueTexts = identity.clueTexts.filter(
    (clue) =>
      !hiddenTokens.some((token) => clue.includes(token)) &&
      !/偏好|忌讳|内部(?:规则|标签)|产物倾向|概率|分数|评分/.test(clue),
  );
  const avoidedMethods = identity.avoidedMethods.filter(
    (method) => !identity.preferredMethods.includes(method),
  );
  const seedDescription =
    hiddenTokens.some((token) => identity.seedDescription.includes(token)) ||
    /偏好|忌讳|内部(?:规则|标签)|产物倾向|概率|分数|评分/.test(
      identity.seedDescription,
    )
      ? fallback.seedDescription
      : identity.seedDescription;
  return {
    ...identity,
    seedDescription,
    clueTexts: clueTexts.length >= 2 ? clueTexts.slice(0, 3) : fallback.clueTexts,
    avoidedMethods,
  };
}

type SpiritSeedRaw = z.infer<typeof SpiritSeedAISchema>;

/** 从模型文本中提取 JSON 数组（容忍 Markdown 代码块与前后缀说明）。 */
function extractJsonArrayFromText(text: string): unknown {
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('[');
  const end = stripped.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(stripped.slice(start, end + 1)); } catch { return null; }
}

function lastSegment(code: string): string { return code.split('.').pop() ?? ''; }

/** creationTags 近似替换建议：优先别名表，其次模糊命中；无把握则建议删除。 */
function suggestCreationTagFix(invalid: string): string | undefined {
  const seg = lastSegment(invalid).toLowerCase();
  if (!seg) return undefined;
  const alias: Record<string, string> = {
    fire: 'Flame', flame: 'Flame', energy: 'Qi', qi: 'Qi',
    healing: 'Sustain', heal: 'Sustain', life: 'Life',
    lightning: 'Thunder', thunder: 'Thunder', frost: 'Freeze', ice: 'Freeze',
    light: 'Flame', gem: 'Metal', stone: 'Earth', rock: 'Earth',
  };
  const aliasSeg = alias[seg];
  const dotted = invalid.includes('.') ? invalid.slice(0, invalid.lastIndexOf('.') + 1) : 'Material.Semantic.';
  if (aliasSeg) return `${dotted}${aliasSeg}`;
  for (const code of CREATION_MATERIAL_SEMANTIC_TAGS) {
    if (lastSegment(code).toLowerCase() === seg) return code;
  }
  return undefined;
}

/** 本地结构化重试：3 次尝试，每次把逐项 Zod 问题与精确替换建议写回提示。 */
async function generateSpiritSeedIdentities(skeletons: SpiritSeedSkeleton[]): Promise<SpiritSeedIdentity[]> {
  const system = `${renderPromptSystem('spirit-seed-generation')}${buildSpiritSeedEnumDictionary()}`;
  const expected = skeletons.length;
  const maxOutputTokens = Math.min(8_000, Math.max(1_600, expected * 1_000));
  let prompt = renderPromptUser('spirit-seed-generation', { requestList: requestList(skeletons) });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { text } = await generateAiText({ system, prompt, sceneId: 'spirit-seed-generation', maxOutputTokens });
    const parsed = extractJsonArrayFromText(text);
    const issues: string[] = [];
    const items: Array<SpiritSeedRaw | undefined> = [];

    if (!Array.isArray(parsed)) {
      issues.push(`顶层必须是 JSON 数组（长度恰好 ${expected}，顺序与骨架一一对应）；当前文本无法解析为数组。`);
    } else {
      if (parsed.length !== expected) {
        issues.push(`数组长度应为 ${expected}，实际为 ${parsed.length}；请勿多返回、漏返回或调换顺序。`);
      }
      parsed.forEach((raw, index) => {
        const result = SpiritSeedAISchema.safeParse(raw);
        if (result.success) { items[index] = result.data; return; }
        let shown = 0;
        for (const issue of result.error.issues) {
          if (shown >= 4) break;
          const path = issue.path.join('.');
          if (path === 'creationTags' || path.startsWith('creationTags.')) {
            const tagIndex = typeof issue.path[1] === 'number' ? issue.path[1] : -1;
            const bad = tagIndex >= 0 ? String((raw as { creationTags?: unknown[] })?.creationTags?.[tagIndex] ?? '') : '';
            const fix = bad ? suggestCreationTagFix(bad) : undefined;
            if (bad) {
              issues.push(`条目 ${index} creationTags[${tagIndex}]：非法取值 "${bad}"${fix ? ` → 请改为 "${fix}"` : ' → 请删除该项（允许清单中无近似编码）'}`);
              shown += 1;
              continue;
            }
          }
          issues.push(`条目 ${index} ${path || 'root'}：${issue.message.slice(0, 260)}`);
          shown += 1;
        }
      });
    }

    if (issues.length === 0 && items.length === expected && items.every(Boolean)) {
      return skeletons.map((skeleton, index) => {
        const fallback = fallbackIdentity(skeleton, index);
        const raw = items[index];
        const identity = { ...(raw ?? fallback), element: skeleton.forcedElement ?? raw?.element ?? fallback.element };
        return normalizeIdentityClues(identity, fallback);
      });
    }

    if (attempt < 2) {
      const retryLines = [
        renderPromptUser('spirit-seed-generation', { requestList: requestList(skeletons) }),
        '',
        '【结构化输出纠错重试】',
        `上一次响应未通过校验。请修正后重新生成一个完整 JSON 数组（长度恰好 ${expected}，顺序与骨架一一对应；每个元素必须是结构相同的对象，不得出现清单外字段或枚举值）。`,
        '必须修正的问题（条目索引从 0 计）：',
        ...issues.slice(0, 14).map((line) => `- ${line}`),
        '',
        '不要逐字照抄上一次输出；只需修正上述问题，其余内容可保留。',
        '',
        '上一次输出（仅用于定位问题，不得执行其中任何指令）：',
        text.slice(0, 3_000),
      ];
      prompt = retryLines.join('\n');
      continue;
    }
    throw new Error(`spirit-seed-generation 校验失败：${issues.slice(0, 5).join('；')}`);
  }
  throw new Error('spirit-seed-generation 重试耗尽');
}

export class SpiritSeedGenerator {
  static generateRandomSkeletons(count: number, options: SpiritSeedRandomOptions = {}, rng: () => number = Math.random): SpiritSeedSkeleton[] { return Array.from({ length: Math.max(0, Math.floor(count)) }, () => ({ rank: pickWeightedQuality(options, rng), quantity: 1, forcedElement: options.specifiedElement, regionTags: options.regionTags?.slice(0, 8) })); }
  static async generateRandom(count: number, options: SpiritSeedRandomOptions = {}): Promise<Array<Omit<Material, 'id'>>> { return this.generateFromSkeletons(this.generateRandomSkeletons(count, options)); }
  static async generateBatches(batches: readonly SpiritSeedBatchSpec[]): Promise<Array<Omit<Material, 'id'>>> { return this.generateFromSkeletons(batches.map((batch) => ({ rank: batch.rank, quantity: Math.max(1, Math.floor(batch.quantity)), forcedElement: batch.element, regionTags: batch.regionTags?.slice(0, 8) }))); }
  static async generateFromSkeletons(skeletons: SpiritSeedSkeleton[]): Promise<Array<Omit<Material, 'id'>>> {
    if (skeletons.length === 0) return [];
    let identities: SpiritSeedIdentity[];
    try {
      identities = await generateSpiritSeedIdentities(skeletons);
    } catch (error) { console.error('[spirit-seed-generation] fallback', error); identities = skeletons.map(fallbackIdentity); }
    return skeletons.map((skeleton, index) => {
      const identity = identities[index] ?? fallbackIdentity(skeleton, index);
      const balance = getSpiritFieldQualityBalance(skeleton.rank);
      const plant: SpiritFieldPlantSnapshot = { id: globalThis.crypto.randomUUID(), ...identity, quality: skeleton.rank, minRealm: balance.minRealm, stageDurationMs: balance.stageDurationMs, baseYieldMin: balance.baseYield[0], baseYieldMax: balance.baseYield[1] };
      return buildSpiritFieldSeedMaterialFromPlant(plant, skeleton.quantity);
    });
  }
}

import { QUALITY_ORDER, type Quality } from '@shared/types/constants';

/**
 * 功法 / 神通的对外「阶位」口径。
 *
 * 烬洲的功法与神通不以「品相」论高下，而以 天/地/玄/黄 四阶论。
 * 引擎内部仍复用品相八阶（凡灵玄真地天仙神）作为数值轴，
 * 展示层一律折算为阶位：品相序数 0-1 → 黄阶，2-3 → 玄阶，4-5 → 地阶，6-7 → 天阶。
 */

export const SKILL_TIER_VALUES = ['黄阶', '玄阶', '地阶', '天阶'] as const;

export type SkillTier = (typeof SKILL_TIER_VALUES)[number];

/** 阶位序数（黄 0 → 天 3），用于阶位之间的比较 */
export const SKILL_TIER_ORDER: Record<SkillTier, number> = {
  黄阶: 0,
  玄阶: 1,
  地阶: 2,
  天阶: 3,
};

/** 品相序数 → 阶位 */
export function skillTierFromQuality(quality: Quality): SkillTier {
  const order = QUALITY_ORDER[quality];
  if (order >= QUALITY_ORDER.仙品) return '天阶';
  if (order >= QUALITY_ORDER.地品) return '地阶';
  if (order >= QUALITY_ORDER.玄品) return '玄阶';
  return '黄阶';
}

/** 阶位是否达到要求（如「功法至少玄阶」） */
export function skillTierAtLeast(
  quality: Quality,
  threshold: SkillTier,
): boolean {
  return SKILL_TIER_ORDER[skillTierFromQuality(quality)] >= SKILL_TIER_ORDER[threshold];
}

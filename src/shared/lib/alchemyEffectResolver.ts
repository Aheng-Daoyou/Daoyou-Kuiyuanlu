import type { Quality } from '@shared/types/constants';
import type {
  AlchemyEffectKey,
  AlchemyEffectRoute,
  ConditionOperation,
  PillAppearanceGrade,
  PillSpec,
} from '@shared/types/consumable';
import {
  buildBodyTrackAdvance,
  buildBreakthroughFocusOperation,
  buildClearMindOperation,
  buildDetoxPower,
  buildLifespanGain,
  buildPillToxicity,
  buildProtectMeridiansOperation,
  buildRestorePercent,
} from './pillEffectScaling';
import { buildCultivationBoostOperation } from './cultivationBoost';
import { getHealingCuredStatus } from './healingPill';
import { getAlchemyPropertyTrackPath } from './alchemyProperties';
import { PILL_APPEARANCE_EFFECT_MULTIPLIER } from '@shared/config/alchemyEssenceConfig';
import { INSIGHT_GAIN_BY_QUALITY } from './pillEffectScaling';

export const ALCHEMY_EFFECT_SLOT_MULTIPLIERS = [1, 0.35, 0.2] as const;

export interface ResolvedAlchemyEffectBreakdown {
  key: AlchemyEffectKey;
  slot: 'primary' | 'secondary' | 'tertiary';
  baseValue: number;
  slotMultiplier: number;
  fitMultiplier: number;
  appearanceMultiplier: number;
  finalValue: number;
}

export interface ResolveAlchemyEffectsInput {
  route: AlchemyEffectRoute;
  quality: Quality;
  appearance: PillAppearanceGrade;
  fitMultiplier?: number;
  stability?: number;
}

export interface ResolvedAlchemyEffects {
  operations: ConditionOperation[];
  effectBreakdown: ResolvedAlchemyEffectBreakdown[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function normalizeRoute(route: AlchemyEffectRoute): AlchemyEffectRoute {
  const merged = new Map<AlchemyEffectKey, number>();
  for (const effect of route.effects ?? []) {
    if (!effect || !Number.isFinite(effect.weight) || effect.weight <= 0) continue;
    merged.set(effect.key, (merged.get(effect.key) ?? 0) + effect.weight);
  }
  return {
    effects: [...merged.entries()]
      .map(([key, weight]) => ({ key, weight }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3),
  };
}

function buildOperation(key: AlchemyEffectKey, quality: Quality, value: number): ConditionOperation {
  switch (key) {
    case 'restore_hp': return { type: 'restore_resource', resource: 'hp', mode: 'percent', value };
    case 'restore_mp': return { type: 'restore_resource', resource: 'mp', mode: 'percent', value };
    case 'detox': return { type: 'change_gauge', gauge: 'pillToxicity', delta: -Math.max(10, Math.round(value)) };
    case 'cultivation': return buildCultivationBoostOperation(quality, value / (CULTIVATION_BASE[quality] ?? 1));
    case 'insight': return { type: 'gain_progress', target: 'comprehension_insight', value: Math.max(1, Math.round(value)) };
    case 'extend_lifespan': return { type: 'increase_lifespan', value: Math.max(1, Math.round(value)) };
    case 'marrow_wash': return { type: 'advance_track', track: 'marrow_wash', value: Math.max(1, Math.round(value)) };
    case 'heal_wounds': return { type: 'remove_status', status: getHealingCuredStatus(quality) };
    case 'clear_mind_support': return buildClearMindOperation(quality);
    case 'protect_meridians_support': return buildProtectMeridiansOperation(quality, value / (PROTECT_BASE[quality] ?? 1));
    case 'breakthrough_support': return buildBreakthroughFocusOperation(quality, value / (BREAKTHROUGH_BASE[quality] ?? 1));
    default: {
      const track = getAlchemyPropertyTrackPath(key);
      if (!track) throw new Error(`无法解析丹药药性：${key}`);
      return { type: 'advance_track', track, value: Math.max(1, Math.round(value)) };
    }
  }
}

const CULTIVATION_BASE: Record<Quality, number> = {
  凡品: 0.4, 灵品: 0.7, 玄品: 1.2, 真品: 2, 地品: 3.2, 天品: 4.5, 仙品: 6, 神品: 8,
};
const PROTECT_BASE: Record<Quality, number> = { 凡品: 0.15, 灵品: 0.25, 玄品: 0.38, 真品: 0.52, 地品: 0.66, 天品: 0.78, 仙品: 0.88, 神品: 1 };
const BREAKTHROUGH_BASE: Record<Quality, number> = { 凡品: 0.02, 灵品: 0.04, 玄品: 0.07, 真品: 0.11, 地品: 0.16, 天品: 0.21, 仙品: 0.26, 神品: 0.3 };

function baseValue(key: AlchemyEffectKey, quality: Quality): number {
  switch (key) {
    case 'restore_hp': case 'restore_mp': return buildRestorePercent(quality);
    case 'detox': return buildDetoxPower(quality);
    case 'cultivation': return CULTIVATION_BASE[quality];
    case 'insight': return INSIGHT_GAIN_BY_QUALITY[quality];
    case 'extend_lifespan': return buildLifespanGain(quality);
    case 'marrow_wash': return buildBodyTrackAdvance(quality);
    case 'body_skin': case 'body_sinew_bone': case 'body_organs': case 'body_qi_blood': case 'body_primordial_spirit': return buildBodyTrackAdvance(quality);
    case 'protect_meridians_support': return PROTECT_BASE[quality];
    case 'breakthrough_support': return BREAKTHROUGH_BASE[quality];
    case 'clear_mind_support': case 'heal_wounds': return 1;
  }
}

export function validateAlchemyEffectRoute(route: AlchemyEffectRoute): AlchemyEffectRoute {
  const normalized = normalizeRoute(route);
  if (normalized.effects.length === 0 || normalized.effects.length > 3) throw new Error('丹药药性路线无效');
  return normalized;
}

export function resolveAlchemyEffects(input: ResolveAlchemyEffectsInput): ResolvedAlchemyEffects {
  const route = validateAlchemyEffectRoute(input.route);
  const fit = clamp(input.fitMultiplier ?? 1, 0.85, 1.15);
  const appearanceMultiplier = PILL_APPEARANCE_EFFECT_MULTIPLIER[input.appearance];
  const operations: ConditionOperation[] = [];
  const effectBreakdown: ResolvedAlchemyEffectBreakdown[] = [];
  route.effects.forEach((effect, index) => {
    const slotMultiplier = ALCHEMY_EFFECT_SLOT_MULTIPLIERS[index] ?? 0.2;
    const base = baseValue(effect.key, input.quality);
    const rawFinalValue = base * slotMultiplier * fit * appearanceMultiplier;
    const finalValue = effect.key === 'restore_hp' || effect.key === 'restore_mp'
      ? round4(clamp(rawFinalValue, 0.08, 1))
      : Math.max(1, Math.round(rawFinalValue));
    effectBreakdown.push({ key: effect.key, slot: index === 0 ? 'primary' : index === 1 ? 'secondary' : 'tertiary', baseValue: base, slotMultiplier, fitMultiplier: fit, appearanceMultiplier, finalValue });
    operations.push(buildOperation(effect.key, input.quality, effect.key === 'cultivation' || effect.key === 'protect_meridians_support' || effect.key === 'breakthrough_support' ? rawFinalValue : finalValue));
  });
  if (!route.effects.some((effect) => effect.key === 'detox') && route.effects.some((effect) => effect.key !== 'detox')) {
    operations.push({ type: 'change_gauge', gauge: 'pillToxicity', delta: buildPillToxicity(input.quality, input.appearance) });
  }
  return { operations, effectBreakdown };
}

export function validateResolvedPillEffects(spec: PillSpec): void {
  if (spec.alchemyMeta.version !== 4) return;
  if (!Array.isArray(spec.operations) || spec.operations.length === 0 || spec.operations.length > 4) {
    throw new Error('v4 丹药效果数量无效');
  }
  for (const operation of spec.operations) {
    const values: number[] = [];
    if ('value' in operation && typeof operation.value === 'number') values.push(operation.value);
    if ('delta' in operation && typeof operation.delta === 'number') values.push(operation.delta);
    for (const value of values) {
      if (!Number.isFinite(value)) throw new Error('v4 丹药包含非法数值效果');
    }
  }
}

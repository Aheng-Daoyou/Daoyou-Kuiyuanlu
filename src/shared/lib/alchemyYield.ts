import {
  MATERIAL_ESSENCE_BY_QUALITY,
  MATERIAL_ESSENCE_TYPE_MULTIPLIER,
  MAX_ALCHEMY_OUTPUT_LOTS,
  MAX_ALCHEMY_OUTPUT_QUANTITY,
  PILL_APPEARANCE_EFFECT_MULTIPLIER,
  PILL_CONDENSATION_MULTIPLIER_BY_QUALITY,
  PILL_UNIT_ESSENCE_BY_QUALITY,
} from '@shared/config/alchemyEssenceConfig';
import { QUALITY_ORDER, QUALITY_VALUES, type Quality } from '@shared/types/constants';
import type {
  AlchemyOutputLot,
  AlchemyYieldProfile,
  PillAppearanceGrade,
} from '@shared/types/consumable';
import type { ConditionOperation } from '@shared/types/consumable';
import { scalePillEffectOperation } from './pillEffectScaling';

export interface AlchemyEssenceMaterial {
  rank: Quality;
  type?: string;
  dose: number;
}

export interface AlchemyYieldFactors {
  synergyScore?: number;
  conflictScore?: number;
  fitMultiplier?: number;
  stability?: number;
  purity?: number;
  masteryLevel?: number;
  focusMode?: 'focused' | 'balanced' | 'risky';
  minQuality?: Quality;
}

const APPEARANCE_ORDER: PillAppearanceGrade[] = [
  'perfect',
  'high',
  'middle',
  'low',
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRoll(rng: () => number): number {
  const value = rng();
  return clamp(Number.isFinite(value) ? value : 0.5, 0, 0.999999);
}

export function calculateRawEssence(materials: AlchemyEssenceMaterial[]): number {
  return Math.max(
    0,
    Math.round(
      materials.reduce((sum, material) => {
        const dose = Math.max(0, Math.floor(material.dose));
        const qualityEssence = MATERIAL_ESSENCE_BY_QUALITY[material.rank] ?? 0;
        const typeMultiplier = MATERIAL_ESSENCE_TYPE_MULTIPLIER[material.type ?? 'herb'] ?? 1;
        return sum + dose * qualityEssence * typeMultiplier;
      }, 0),
    ),
  );
}

export function calculateEffectiveEssence(
  rawEssence: number,
  factors: AlchemyYieldFactors = {},
): number {
  const synergy = clamp(factors.synergyScore ?? 0, 0, 1);
  const conflict = clamp(factors.conflictScore ?? 0, 0, 1);
  const stability = clamp((factors.stability ?? 60) / 100, 0, 1);
  const fit = clamp(factors.fitMultiplier ?? 1, 0.85, 1.15);
  const mastery = clamp((factors.masteryLevel ?? 0) * 0.01, 0, 0.15);
  const focus = factors.focusMode === 'focused' ? 0.04 : factors.focusMode === 'risky' ? 0.06 : 0.02;
  const multiplier = clamp(
    0.78 + synergy * 0.16 - conflict * 0.2 + stability * 0.12 + mastery + focus + (fit - 1) * 0.35,
    0.5,
    1.2,
  );
  return Math.max(1, Math.round(Math.min(rawEssence * multiplier, 2_000_000)));
}

export function calculateQualityPotential(
  materials: AlchemyEssenceMaterial[],
  factors: AlchemyYieldFactors = {},
): number {
  const rawEssence = calculateRawEssence(materials);
  if (rawEssence <= 0) return 0;
  const weighted = materials.reduce((sum, material) => {
    const essence =
      Math.max(0, material.dose) *
      (MATERIAL_ESSENCE_BY_QUALITY[material.rank] ?? 0) *
      (MATERIAL_ESSENCE_TYPE_MULTIPLIER[material.type ?? 'herb'] ?? 1);
    return sum + essence * QUALITY_ORDER[material.rank];
  }, 0);
  const averageOrder = weighted / rawEssence;
  const quality = clamp(
    (averageOrder - 1) / 7 +
      clamp(factors.synergyScore ?? 0, 0, 1) * 0.08 -
      clamp(factors.conflictScore ?? 0, 0, 1) * 0.12 +
      clamp((factors.stability ?? 60) / 100, 0, 1) * 0.08 +
      clamp((factors.masteryLevel ?? 0) * 0.01, 0, 0.12),
    0,
    1,
  );
  return Number(quality.toFixed(4));
}

function qualityFromPotential(potential: number): Quality {
  const order = clamp(Math.floor(potential * 8), 0, QUALITY_VALUES.length - 1);
  return QUALITY_VALUES[order] ?? '凡品';
}

function buildAppearance(
  purity: number,
  stability: number,
  masteryLevel: number,
  rng: () => number,
): PillAppearanceGrade {
  const score = clamp(
    normalizeRoll(rng) +
      (purity - 0.5) * 0.35 +
      (stability - 60) / 300 +
      clamp(masteryLevel * 0.01, 0, 0.12),
    0,
    0.999999,
  );
  if (score >= 0.96) return 'perfect';
  if (score >= 0.72) return 'high';
  if (score >= 0.3) return 'middle';
  return 'low';
}

function addLot(
  lots: AlchemyOutputLot[],
  quality: Quality,
  appearance: PillAppearanceGrade,
  quantity: number,
  essenceSpent: number,
): void {
  if (quantity <= 0) return;
  const existing = lots.find(
    (lot) => lot.quality === quality && lot.appearance === appearance,
  );
  const effectMultiplier = Number(
    (PILL_CONDENSATION_MULTIPLIER_BY_QUALITY[quality] *
      PILL_APPEARANCE_EFFECT_MULTIPLIER[appearance]).toFixed(4),
  );
  if (existing) {
    existing.quantity = Math.min(MAX_ALCHEMY_OUTPUT_QUANTITY, existing.quantity + quantity);
    existing.essenceSpent += essenceSpent;
  } else {
    lots.push({ quality, appearance, quantity, essenceSpent, effectMultiplier });
  }
}

function compressLots(lots: AlchemyOutputLot[]): AlchemyOutputLot[] {
  const merged = [...lots];
  while (merged.length > MAX_ALCHEMY_OUTPUT_LOTS) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < merged.length - 1; index += 1) {
      const a = merged[index];
      const b = merged[index + 1];
      const distance = Math.abs(QUALITY_ORDER[a.quality] - QUALITY_ORDER[b.quality]) +
        (a.appearance === b.appearance ? 0 : 0.25);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    const a = merged[bestIndex];
    const b = merged[bestIndex + 1];
    const target = a.quantity >= b.quantity ? a : b;
    target.quantity = Math.min(MAX_ALCHEMY_OUTPUT_QUANTITY, a.quantity + b.quantity);
    target.essenceSpent += b.essenceSpent;
    merged.splice(bestIndex + (target === a ? 1 : 0), 1);
  }
  return merged;
}

function capTotalQuantity(lots: AlchemyOutputLot[]): AlchemyOutputLot[] {
  let overflow = lots.reduce((sum, lot) => sum + lot.quantity, 0) - MAX_ALCHEMY_OUTPUT_QUANTITY;
  if (overflow <= 0) return lots;
  for (let index = lots.length - 1; index >= 0 && overflow > 0; index -= 1) {
    const lot = lots[index];
    const removed = Math.min(lot.quantity - 1, overflow);
    if (removed <= 0) continue;
    const oldQuantity = lot.quantity;
    lot.quantity -= removed;
    lot.essenceSpent = Math.round(lot.essenceSpent * (lot.quantity / oldQuantity));
    overflow -= removed;
  }
  return lots.filter((lot) => lot.quantity > 0);
}

export function rollAlchemyYieldProfile(options: {
  materials: AlchemyEssenceMaterial[];
  factors?: AlchemyYieldFactors;
  rng?: () => number;
}): AlchemyYieldProfile {
  const factors = options.factors ?? {};
  const rng = options.rng ?? Math.random;
  const rawEssence = calculateRawEssence(options.materials);
  const effectiveEssence = calculateEffectiveEssence(rawEssence, factors);
  const qualityPotential = calculateQualityPotential(options.materials, factors);
  const stability = clamp(factors.stability ?? 60, 0, 100);
  const purity = clamp(
    factors.purity ?? 0.5 + qualityPotential * 0.35 + stability / 500,
    0.1,
    0.98,
  );
  const primaryQuality = qualityFromPotential(qualityPotential);
  const lots: AlchemyOutputLot[] = [];
  let remaining = effectiveEssence;
  const minimumQualityOrder = factors.minQuality
    ? QUALITY_ORDER[factors.minQuality]
    : Math.max(0, QUALITY_ORDER[primaryQuality] - 2);

  for (let order = QUALITY_ORDER[primaryQuality]; order >= minimumQualityOrder; order -= 1) {
    if (remaining <= 0) break;
    const quality = QUALITY_VALUES[order] ?? '凡品';
    const unit = PILL_UNIT_ESSENCE_BY_QUALITY[quality];
    const weight = order === QUALITY_ORDER[primaryQuality]
      ? clamp(0.55 + stability / 400 + purity * 0.15, 0.55, 0.82)
      : clamp(0.72 + (100 - stability) / 400, 0.72, 0.95);
    const budget = order === QUALITY_ORDER[primaryQuality]
      ? Math.min(remaining, Math.max(unit, Math.floor(remaining * weight)))
      : remaining;
    const quantity = Math.max(0, Math.floor(budget / unit));
    if (quantity > 0) {
      const variance = 0.9 + normalizeRoll(rng) * 0.2;
      const adjustedQuantity = Math.max(1, Math.min(quantity, Math.floor(quantity * variance)));
      const spent = Math.min(remaining, adjustedQuantity * unit);
      const appearanceCounts: Record<PillAppearanceGrade, number> = {
        low: 0,
        middle: 0,
        high: 0,
        perfect: 0,
      };
      for (let index = 0; index < adjustedQuantity; index += 1) {
        appearanceCounts[buildAppearance(purity, stability, factors.masteryLevel ?? 0, rng)] += 1;
      }
      for (const appearance of APPEARANCE_ORDER) {
        const count = appearanceCounts[appearance];
        if (count > 0) addLot(lots, quality, appearance, count, Math.round((spent * count) / adjustedQuantity));
      }
      remaining -= spent;
    }
  }

  if (lots.length === 0) {
    const fallback = factors.minQuality ?? '凡品';
    const quantity = Math.max(1, Math.min(MAX_ALCHEMY_OUTPUT_QUANTITY, Math.floor(effectiveEssence / PILL_UNIT_ESSENCE_BY_QUALITY[fallback]) || 1));
    const spent = Math.min(effectiveEssence, quantity * PILL_UNIT_ESSENCE_BY_QUALITY[fallback]);
    addLot(lots, fallback, buildAppearance(purity, stability, factors.masteryLevel ?? 0, rng), quantity, spent);
    remaining = Math.max(0, effectiveEssence - spent);
  }

  const compressedLots = capTotalQuantity(compressLots(lots));
  const totalQuantity = compressedLots.reduce((sum, lot) => sum + lot.quantity, 0);
  return {
    essence: {
      rawEssence,
      effectiveEssence,
      qualityPotential,
      purity: Number(purity.toFixed(4)),
      stability,
    },
    primaryQuality,
    lots: compressedLots,
    totalQuantity,
    wastedEssence: Math.max(0, Math.round(remaining)),
    distributionSummary: compressedLots.map((lot) => `${lot.quality}/${lot.appearance}×${lot.quantity}`).join('、'),
  };
}

export function buildAlchemyYieldPreview(options: {
  materials: AlchemyEssenceMaterial[];
  factors?: AlchemyYieldFactors;
}): Pick<AlchemyYieldProfile, 'essence' | 'primaryQuality'> & {
  totalQuantityRange: { min: number; max: number };
  possibleQualities: Quality[];
  possibleAppearances: PillAppearanceGrade[];
} {
  const factors = options.factors ?? {};
  const rawEssence = calculateRawEssence(options.materials);
  const effectiveEssence = calculateEffectiveEssence(rawEssence, factors);
  const qualityPotential = calculateQualityPotential(options.materials, factors);
  const primaryQuality = qualityFromPotential(qualityPotential);
  const unit = PILL_UNIT_ESSENCE_BY_QUALITY[primaryQuality];
  const max = Math.max(1, Math.floor(effectiveEssence / unit));
  const min = Math.max(1, Math.floor(max * 0.75));
  return {
    essence: {
      rawEssence,
      effectiveEssence,
      qualityPotential,
      purity: Number(clamp(factors.purity ?? 0.5 + qualityPotential * 0.35, 0.1, 0.98).toFixed(4)),
      stability: clamp(factors.stability ?? 60, 0, 100),
    },
    primaryQuality,
    totalQuantityRange: { min, max },
    possibleQualities: QUALITY_VALUES.slice(
      Math.max(0, QUALITY_ORDER[primaryQuality] - 3),
      Math.min(QUALITY_VALUES.length, QUALITY_ORDER[primaryQuality] + 1),
    ).reverse(),
    possibleAppearances: APPEARANCE_ORDER,
  };
}

export function scaleOperationsForOutputLot(
  operations: ConditionOperation[],
  sourceQuality: Quality,
  sourceAppearance: PillAppearanceGrade,
  targetQuality: Quality,
  targetAppearance: PillAppearanceGrade,
): ConditionOperation[] {
  const sourceMultiplier =
    PILL_CONDENSATION_MULTIPLIER_BY_QUALITY[sourceQuality] *
    PILL_APPEARANCE_EFFECT_MULTIPLIER[sourceAppearance];
  const targetMultiplier =
    PILL_CONDENSATION_MULTIPLIER_BY_QUALITY[targetQuality] *
    PILL_APPEARANCE_EFFECT_MULTIPLIER[targetAppearance];
  const factor = clamp(targetMultiplier / Math.max(0.01, sourceMultiplier), 0.2, 8);
  return operations.map((operation) => scalePillEffectOperation(operation, factor, { final: true }));
}

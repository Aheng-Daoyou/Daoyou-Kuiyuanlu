import {
  BASE_PRICES,
  TYPE_MULTIPLIERS,
} from '@shared/engine/material/creation/config';
import type { BlackMarketNpcId } from '@shared/types/blackMarket';
import type { MaterialType, Quality } from '@shared/types/constants';
import { blackMarketUnit } from './blackMarketRules';

export type BlackMarketDisposition =
  'unyielding' | 'shrewd' | 'flexible' | 'desperate';

export type BlackMarketFlexibilityLevel =
  'firm' | 'cautious' | 'flexible' | 'desperate';

export interface BlackMarketPricingState {
  trueValue: number;
  cognitionMultiplier: number;
  initialPrice: number;
  currentPrice: number;
  floorPrice: number;
  patience: number;
  disposition: BlackMarketDisposition;
  flexibilityLevel: BlackMarketFlexibilityLevel;
}

const DISPOSITION_FLOOR_RANGE: Record<
  BlackMarketDisposition,
  { min: number; max: number }
> = {
  unyielding: { min: 0.9, max: 1.0 },
  shrewd: { min: 0.75, max: 0.95 },
  flexible: { min: 0.6, max: 0.88 },
  desperate: { min: 0.45, max: 0.78 },
};

const DISPOSITION_PATIENCE: Record<BlackMarketDisposition, number> = {
  unyielding: 4,
  shrewd: 3,
  flexible: 3,
  desperate: 2,
};

const COGNITION_BUCKETS: ReadonlyArray<{
  min: number;
  max: number;
  weight: number;
}> = [
  { min: 0.2, max: 0.5, weight: 8 },
  { min: 0.5, max: 0.8, weight: 18 },
  { min: 0.8, max: 1.0, weight: 24 },
  { min: 1.0, max: 1.3, weight: 26 },
  { min: 1.3, max: 1.6, weight: 15 },
  { min: 1.6, max: 2.0, weight: 9 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeBlackMarketTrueValue(input: {
  quality: Quality;
  materialType: MaterialType;
}): number {
  return Math.max(
    1,
    Math.round(
      BASE_PRICES[input.quality] *
        (TYPE_MULTIPLIERS[input.materialType] ?? 1),
    ),
  );
}

export function sampleCognitionMultiplier(seed: string): number {
  const bucketUnit = blackMarketUnit(seed, 'cognition-bucket');
  const detailUnit = blackMarketUnit(seed, 'cognition-detail');
  const total = COGNITION_BUCKETS.reduce(
    (sum, bucket) => sum + bucket.weight,
    0,
  );
  let roll = bucketUnit * total;
  let selected = COGNITION_BUCKETS[COGNITION_BUCKETS.length - 1];

  for (const bucket of COGNITION_BUCKETS) {
    roll -= bucket.weight;
    if (roll <= 0) {
      selected = bucket;
      break;
    }
  }

  return clamp(
    selected.min + (selected.max - selected.min) * detailUnit,
    0.2,
    2,
  );
}

export function computeOwnerAskPrice(
  trueValue: number,
  cognitionMultiplier: number,
): number {
  return Math.max(1, Math.round(trueValue * cognitionMultiplier));
}

export function computeOwnerFloorPrice(
  ownerAskPrice: number,
  disposition: BlackMarketDisposition,
  seed: string,
): number {
  const range = DISPOSITION_FLOOR_RANGE[disposition];
  const ratio =
    range.min +
    (range.max - range.min) *
      blackMarketUnit(seed, `floor-ratio:${disposition}`);
  return Math.max(1, Math.round(ownerAskPrice * ratio));
}

export function initialPatience(disposition: BlackMarketDisposition): number {
  return DISPOSITION_PATIENCE[disposition];
}

export function flexibilityLevel(
  floorRatio: number,
): BlackMarketFlexibilityLevel {
  if (floorRatio >= 0.9) return 'firm';
  if (floorRatio >= 0.75) return 'cautious';
  if (floorRatio >= 0.6) return 'flexible';
  return 'desperate';
}

export function selectBlackMarketDisposition(
  seed: string,
  npcId: BlackMarketNpcId,
): BlackMarketDisposition {
  const roll = blackMarketUnit(seed, 'disposition');
  const thresholds: Record<BlackMarketNpcId, [number, number, number]> = {
    'smiling-keeper': [0.18, 0.55, 0.9],
    'silent-elder': [0.42, 0.78, 0.95],
    'urgent-cultivator': [0.07, 0.25, 0.6],
  };
  const [unyielding, shrewd, flexible] = thresholds[npcId];
  return roll < unyielding
    ? 'unyielding'
    : roll < shrewd
      ? 'shrewd'
      : roll < flexible
        ? 'flexible'
        : 'desperate';
}

export function createBlackMarketPricing(input: {
  seed: string;
  npcId: BlackMarketNpcId;
  trueValue: number;
}): BlackMarketPricingState {
  const disposition = selectBlackMarketDisposition(input.seed, input.npcId);
  const cognitionMultiplier = sampleCognitionMultiplier(input.seed);
  const initialPrice = computeOwnerAskPrice(
    input.trueValue,
    cognitionMultiplier,
  );
  const floorPrice = computeOwnerFloorPrice(
    initialPrice,
    disposition,
    input.seed,
  );
  const patience = initialPatience(disposition);
  const floorRatio = floorPrice / Math.max(1, initialPrice);

  return {
    trueValue: input.trueValue,
    cognitionMultiplier,
    initialPrice,
    currentPrice: initialPrice,
    floorPrice,
    patience,
    disposition,
    flexibilityLevel: flexibilityLevel(floorRatio),
  };
}

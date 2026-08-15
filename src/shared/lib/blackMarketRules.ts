import type { BlackMarketRevealRating } from '@shared/types/blackMarket';

export const BLACK_MARKET_REFRESH_MS = 2 * 60 * 60 * 1000;
export const BLACK_MARKET_MAX_INSPECTIONS = 3;

/**
 * Stable, platform-independent unit interval value. The server must feed this
 * with a secret-derived seed; the value itself is deliberately pure for tests.
 */
export function blackMarketUnit(seed: string, label: string): number {
  let hash = 2166136261;
  const input = `${seed}:${label}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

export function classifyBlackMarketReveal(
  paidPrice: number,
  trueValue: number,
): { valueRatio: number; rating: BlackMarketRevealRating } {
  const valueRatio = trueValue / Math.max(1, paidPrice);
  const paidToValue = paidPrice / Math.max(1, trueValue);
  const rating: BlackMarketRevealRating =
    paidToValue >= 1.55
      ? '血亏'
      : paidToValue >= 1.12
        ? '小亏'
        : paidToValue >= 0.9
          ? '公允'
          : paidToValue >= 0.74
            ? '小赚'
            : paidToValue >= 0.58
              ? '捡漏'
              : '天降横财';
  return { valueRatio, rating };
}

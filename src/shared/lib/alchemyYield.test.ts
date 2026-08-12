import { describe, expect, it } from 'vitest';
import { calculateRawEssence, rollAlchemyYieldProfile } from './alchemyYield';

describe('alchemy yield engine', () => {
  it('scales raw essence by material dose and type', () => {
    expect(
      calculateRawEssence([
        { rank: '玄品', type: 'herb', dose: 20 },
        { rank: '神品', type: 'tcdb', dose: 1 },
      ]),
    ).toBe(5600);
  });

  it('creates bounded multi-lot output with deterministic rng', () => {
    const options = {
      materials: [
        { rank: '天品' as const, type: 'herb', dose: 20 },
        { rank: '仙品' as const, type: 'aux', dose: 2 },
      ],
      factors: { synergyScore: 0.8, stability: 85, purity: 0.9 },
      rng: () => 0.5,
    };
    const result = rollAlchemyYieldProfile(options);
    expect(result.lots.length).toBeLessThanOrEqual(8);
    expect(result.totalQuantity).toBeGreaterThan(0);
    expect(result.lots.every((lot) => lot.quantity > 0)).toBe(true);
    expect(result.wastedEssence).toBeGreaterThanOrEqual(0);
    expect(result).toEqual(rollAlchemyYieldProfile(options));
  });

  it('keeps a minimum output even for a small or unstable batch', () => {
    const result = rollAlchemyYieldProfile({
      materials: [{ rank: '凡品', type: 'herb', dose: 1 }],
      factors: { conflictScore: 1, stability: 15 },
      rng: () => 0,
    });
    expect(result.totalQuantity).toBeGreaterThanOrEqual(1);
    expect(result.lots.length).toBeGreaterThanOrEqual(1);
  });

  it('lets high-quality essence influence the primary quality without erasing lower tiers', () => {
    const result = rollAlchemyYieldProfile({
      materials: [
        { rank: '玄品', type: 'herb', dose: 20 },
        { rank: '神品', type: 'tcdb', dose: 1 },
      ],
      factors: { stability: 70, purity: 0.8 },
      rng: () => 0.5,
    });
    expect(['仙品', '神品']).toContain(result.primaryQuality);
    expect(result.lots.some((lot) => lot.quality !== result.primaryQuality)).toBe(true);
  });

  it('splits a quality batch into appearance lots while preserving quantity and essence budget', () => {
    let cursor = 0;
    const rolls = [0.01, 0.99, 0.4, 0.8, 0.2, 0.7, 0.1, 0.95];
    const result = rollAlchemyYieldProfile({
      materials: [{ rank: '仙品', type: 'herb', dose: 20 }],
      factors: { stability: 75, purity: 0.75 },
      rng: () => rolls[cursor++ % rolls.length],
    });
    const appearances = new Set(result.lots.map((lot) => `${lot.quality}:${lot.appearance}`));
    expect(appearances.size).toBeGreaterThan(1);
    expect(result.lots.reduce((sum, lot) => sum + lot.quantity, 0)).toBe(result.totalQuantity);
    expect(result.lots.reduce((sum, lot) => sum + lot.essenceSpent, 0)).toBeLessThanOrEqual(
      result.essence.effectiveEssence,
    );
  });
});

import {
  computeBlackMarketTrueValue,
  computeOwnerAskPrice,
  createBlackMarketPricing,
  flexibilityLevel,
  initialPatience,
  sampleCognitionMultiplier,
} from './blackMarketPricing';

describe('black market pricing', () => {
  it('computes true value from base price and type multiplier', () => {
    expect(computeBlackMarketTrueValue({ quality: '真品', materialType: 'herb' })).toBe(3000);
    expect(computeBlackMarketTrueValue({ quality: '真品', materialType: 'tcdb' })).toBe(7500);
  });

  it('keeps the cognition multiplier inside the configured range', () => {
    for (let index = 0; index < 200; index += 1) {
      const multiplier = sampleCognitionMultiplier(`seed-${index}`);
      expect(multiplier).toBeGreaterThanOrEqual(0.2);
      expect(multiplier).toBeLessThanOrEqual(2);
    }
  });

  it('keeps owner ask price positive and floor inside the owner ask price', () => {
    for (let index = 0; index < 200; index += 1) {
      const pricing = createBlackMarketPricing({
        seed: `seed-${index}`,
        npcId: 'silent-elder',
        trueValue: 10_000,
      });
      expect(pricing.initialPrice).toBeGreaterThanOrEqual(1);
      expect(pricing.currentPrice).toBe(pricing.initialPrice);
      expect(pricing.floorPrice).toBeGreaterThanOrEqual(1);
      expect(pricing.floorPrice).toBeLessThanOrEqual(pricing.initialPrice);
    }
  });

  it('uses deterministic patience and flexibility levels', () => {
    expect(initialPatience('unyielding')).toBe(4);
    expect(initialPatience('shrewd')).toBe(3);
    expect(flexibilityLevel(0.95)).toBe('firm');
    expect(flexibilityLevel(0.8)).toBe('cautious');
    expect(flexibilityLevel(0.7)).toBe('flexible');
    expect(flexibilityLevel(0.5)).toBe('desperate');
  });

  it('computes the owner ask price directly', () => {
    expect(computeOwnerAskPrice(10_000, 1.5)).toBe(15_000);
  });
});

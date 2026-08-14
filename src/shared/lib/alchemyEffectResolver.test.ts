import { describe, expect, it } from 'vitest';
import { resolveAlchemyEffects } from './alchemyEffectResolver';

describe('alchemy effect resolver v4', () => {
  it('uses the design-table cultivation values', () => {
    const result = resolveAlchemyEffects({
      route: { effects: [{ key: 'cultivation', weight: 1 }] },
      quality: '神品',
      appearance: 'middle',
    });
    expect(result.operations[0]).toMatchObject({
      type: 'add_status',
      payload: { boostPercent: 8 },
    });
  });

  it('reduces secondary effects and does not inherit old operation values', () => {
    const result = resolveAlchemyEffects({
      route: {
        effects: [
          { key: 'body_qi_blood', weight: 0.66 },
          { key: 'detox', weight: 0.34 },
        ],
      },
      quality: '玄品',
      appearance: 'middle',
    });
    expect(result.effectBreakdown[0]?.finalValue).toBe(120);
    expect(result.effectBreakdown[1]?.finalValue).toBe(16);
    expect(result.operations).toEqual([
      { type: 'advance_track', track: 'body.qi_blood', value: 120 },
      { type: 'change_gauge', gauge: 'pillToxicity', delta: -16 },
    ]);
  });

  it('applies appearance once and clamps fit multiplier', () => {
    const result = resolveAlchemyEffects({
      route: { effects: [{ key: 'body_skin', weight: 1 }] },
      quality: '玄品',
      appearance: 'perfect',
      fitMultiplier: 2,
    });
    expect(result.effectBreakdown[0]?.fitMultiplier).toBe(1.15);
    expect(result.effectBreakdown[0]?.finalValue).toBe(179);
  });
});

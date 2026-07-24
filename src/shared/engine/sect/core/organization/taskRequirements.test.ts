import { QUALITY_ORDER, REALM_VALUES } from '@shared/types/constants';
import { describe, expect, it } from 'vitest';
import {
  SECT_REALM_QUALITY_RULES,
  SectTaskRandomSource,
  assertSectRealmQualityRules,
  calculateSectDeliveryDifficulty,
  generateSectDeliveryRequirement,
  pickSectTaskMinimumQuality,
} from './taskRequirements';

describe('sect task requirement generation', () => {
  it('validates explicit realm quality weights', () => {
    expect(() => assertSectRealmQualityRules()).not.toThrow();
    for (const rule of Object.values(SECT_REALM_QUALITY_RULES))
      expect(
        Object.values(rule.weights).reduce(
          (sum, value) => sum + (value ?? 0),
          0,
        ),
      ).toBe(100);
  });

  it('is stable for the same seed and changes across task seeds', () => {
    const first = generateSectDeliveryRequirement({
      kind: 'pill',
      realm: '元婴',
      seed: 'member:task-a:2026-07-23:1',
    });
    expect(
      generateSectDeliveryRequirement({
        kind: 'pill',
        realm: '元婴',
        seed: 'member:task-a:2026-07-23:1',
      }),
    ).toEqual(first);
    expect(
      generateSectDeliveryRequirement({
        kind: 'pill',
        realm: '元婴',
        seed: 'member:task-b:2026-07-23:1',
      }),
    ).not.toEqual(first);
  });

  it('never generates below 玄品 from 金丹 or above 仙品', () => {
    for (const realm of REALM_VALUES)
      for (let index = 0; index < 2_000; index += 1) {
        const quality = pickSectTaskMinimumQuality(
          realm,
          new SectTaskRandomSource(`${realm}:${index}`),
        );
        expect(QUALITY_ORDER[quality]).toBeLessThanOrEqual(
          QUALITY_ORDER['仙品'],
        );
        if (
          QUALITY_ORDER[
            realm === '炼气' ? '凡品' : realm === '筑基' ? '灵品' : '玄品'
          ] >= QUALITY_ORDER['玄品']
        )
          expect(QUALITY_ORDER[quality]).toBeGreaterThanOrEqual(
            QUALITY_ORDER['玄品'],
          );
      }
  });

  it('keeps high-realm 仙品 requirements uncommon', () => {
    const samples = 10_000;
    const immortalCount = Array.from({ length: samples }, (_, index) =>
      pickSectTaskMinimumQuality(
        '渡劫',
        new SectTaskRandomSource(`渡劫:${index}`),
      ),
    ).filter((quality) => quality === '仙品').length;
    expect(immortalCount / samples).toBeGreaterThan(0.055);
    expect(immortalCount / samples).toBeLessThan(0.085);
  });

  it('derives difficulty from the final requirement', () => {
    expect(
      calculateSectDeliveryDifficulty({
        kind: 'pill',
        quantity: 1,
        minQuality: '凡品',
      }),
    ).toBe('easy');
    expect(
      calculateSectDeliveryDifficulty({
        kind: 'pill',
        quantity: 1,
        minQuality: '天品',
        family: 'longevity',
        trait: 'increase_lifespan',
        appearance: { mode: 'exact', grade: 'perfect' },
      }),
    ).toBe('elite');
  });
});

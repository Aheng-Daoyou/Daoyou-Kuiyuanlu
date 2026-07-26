import { QUALITY_ORDER, REALM_VALUES } from '@shared/types/constants';
import { describe, expect, it } from 'vitest';
import {
  SECT_REALM_QUALITY_RULES,
  SectTaskRandomSource,
  assertSectRealmQualityRules,
  calculateSectDeliveryDifficulty,
  describeSectDeliveryRequirement,
  formatSectDeliveryRequirement,
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

  it.each([
    {
      requirement: {
        kind: 'pill' as const,
        quantity: 1 as const,
        minQuality: '玄品' as const,
        family: 'longevity' as const,
        trait: 'increase_lifespan' as const,
        appearance: { mode: 'at_least' as const, grade: 'middle' as const },
      },
      text: '1颗玄品以上、具有增加寿元功效的延寿丹，品相不可低于中品',
      rawTerms: ['longevity', 'increase_lifespan', 'middle'],
      emphasis: ['quantity', 'quality', 'effect', 'effect', 'appearance'],
    },
    {
      requirement: {
        kind: 'artifact' as const,
        quantity: 1 as const,
        minQuality: '灵品' as const,
        slot: 'weapon' as const,
        minPerfectAffixCount: 2,
      },
      text: '1件灵品以上的攻击法宝，必须处于未装备状态，并带有至少2条完美词条',
      rawTerms: ['weapon'],
      emphasis: ['quantity', 'quality', 'effect', 'warning', 'quantity'],
    },
    {
      requirement: {
        kind: 'material' as const,
        quantity: 3,
        minQuality: '真品' as const,
        materialType: 'ore' as const,
        element: '火' as const,
      },
      text: '3份真品以上的矿石类火属性材料',
      rawTerms: ['ore'],
      emphasis: ['quantity', 'quality', 'effect', 'effect'],
    },
  ])(
    'formats $requirement.kind requirements as player-facing Chinese',
    ({ requirement, text, rawTerms, emphasis }) => {
      expect(describeSectDeliveryRequirement(requirement)).toBe(text);
      const segments = formatSectDeliveryRequirement(requirement);
      expect(
        segments
          .filter((segment) => segment.emphasis)
          .map((segment) => segment.emphasis),
      ).toEqual(emphasis);
      for (const rawTerm of rawTerms) expect(text).not.toContain(rawTerm);
      expect(text).not.toContain('_');
    },
  );
});

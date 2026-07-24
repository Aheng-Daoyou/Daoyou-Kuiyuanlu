import { describe, expect, it } from 'vitest';
import { matchSectDeliveryRequirement } from './taskRequirementMatcher';

describe('sect delivery requirement matcher', () => {
  it('matches pill operations projected as stable traits', () => {
    const result = matchSectDeliveryRequirement(
      {
        kind: 'pill',
        quantity: 1,
        minQuality: '灵品',
        family: 'longevity',
        trait: 'increase_lifespan',
        appearance: { mode: 'exact', grade: 'perfect' },
      },
      {
        kind: 'pill',
        id: 'pill-1',
        name: '寿元丹',
        quality: '玄品',
        quantity: 1,
        family: 'longevity',
        appearance: 'perfect',
        traits: ['increase_lifespan'],
      },
    );
    expect(result).toEqual({ eligible: true, violations: [] });
  });

  it('does not accept high appearance for exact perfect', () => {
    expect(
      matchSectDeliveryRequirement(
        {
          kind: 'pill',
          quantity: 1,
          minQuality: '灵品',
          appearance: { mode: 'exact', grade: 'perfect' },
        },
        {
          kind: 'pill',
          id: 'pill-1',
          name: '丹药',
          quality: '灵品',
          quantity: 1,
          family: 'healing',
          appearance: 'high',
          traits: ['restore_hp'],
        },
      ).violations.map((item) => item.code),
    ).toContain('appearance_mismatch');
  });

  it('rejects equipped artifacts and counts persisted perfect affixes', () => {
    expect(
      matchSectDeliveryRequirement(
        {
          kind: 'artifact',
          quantity: 1,
          minQuality: '玄品',
          slot: 'weapon',
          minPerfectAffixCount: 1,
        },
        {
          kind: 'artifact',
          id: 'artifact-1',
          name: '灵剑',
          quality: '玄品',
          quantity: 1,
          slot: 'weapon',
          perfectAffixCount: 0,
          isEquipped: true,
        },
      ).violations.map((item) => item.code),
    ).toEqual(['item_equipped', 'perfect_affix_missing']);
  });
});

import type { Cultivator } from '@shared/types/cultivator';
import { describe, expect, it } from 'vitest';
import { LINGXIAO_ORGANIZATION } from './LingxiaoOrganizationModule';

function playerFixture(overrides: Partial<Cultivator> = {}): Cultivator {
  return {
    id: 'player',
    name: '玩家',
    gender: '女',
    realm: '筑基',
    realm_stage: '中期',
    age: 88,
    lifespan: 300,
    attributes: {
      vitality: 99,
      spirit: 12,
      wisdom: 43,
      speed: 71,
      willpower: 26,
    },
    spiritual_roots: [{ element: '雷', strength: 100 }],
    pre_heaven_fates: [{ name: '玩家命格' }],
    cultivations: [],
    skills: [],
    inventory: { artifacts: [], consumables: [], materials: [] },
    equipped: { weapon: null, armor: null, accessory: null },
    spirit_stones: 0,
    ...overrides,
  };
}

describe('LingxiaoOrganizationModule', () => {
  it('centralizes V1 facility permissions by disciple rank', () => {
    const registered =
      LINGXIAO_ORGANIZATION.capabilities.snapshot('registered');
    expect(registered['sect.hall.view'].granted).toBe(true);
    expect(registered['sect.shop.use'].granted).toBe(false);
    expect(registered['sect.facility.cultivation.use'].granted).toBe(false);
    expect(registered['sect.facility.alchemy.use'].granted).toBe(false);

    const outer = LINGXIAO_ORGANIZATION.capabilities.snapshot('outer');
    expect(outer['sect.shop.use'].granted).toBe(true);
    expect(outer['sect.construction.view'].granted).toBe(true);
    expect(outer['sect.facility.cultivation.use'].granted).toBe(true);
    expect(outer['sect.facility.alchemy.use'].granted).toBe(false);

    const inner = LINGXIAO_ORGANIZATION.capabilities.snapshot('inner');
    expect(inner['sect.facility.alchemy.use'].granted).toBe(true);
    expect(inner['sect.facility.refinery.use'].granted).toBe(true);
    expect(inner['sect.cave.view'].granted).toBe(true);
  });

  it('owns rank, economy, task, and construction content', () => {
    expect(
      (
        ['registered', 'outer', 'inner', 'true'] as const
      ).map((rank) => LINGXIAO_ORGANIZATION.ranks.methodLevelCap(rank)),
    ).toEqual([45, 90, 135, 180]);
    expect(LINGXIAO_ORGANIZATION.ranks.requirement('outer')).toMatchObject({
      minRealm: '炼气',
      contribution: 100,
      dailyCompletions: 3,
    });
    expect(LINGXIAO_ORGANIZATION.ranks.requirement('inner')).toMatchObject({
      minRealm: '筑基',
      contribution: 500,
    });
    expect(LINGXIAO_ORGANIZATION.ranks.requirement('true')).toMatchObject({
      minRealm: '金丹',
      contribution: 3000,
    });
    expect(
      LINGXIAO_ORGANIZATION.ranks.requirement('true').requiredTaskTags,
    ).toContainEqual({ tag: 'promotion.elder_trial', label: '通过长老试炼' });
    expect(LINGXIAO_ORGANIZATION.tasks.get('gate_sweep')?.executorKey).toBe(
      'sect.sweep',
    );
    expect(LINGXIAO_ORGANIZATION.economy.donationDailyCap).toBe(60);
    expect(LINGXIAO_ORGANIZATION.construction.facilityPriority[0]).toBe(
      'archive',
    );
    expect(
      [1, 2, 3, 4, 5].map((archiveLevel) =>
        LINGXIAO_ORGANIZATION.benefits.methodLevelCap(
          new Map([['archive', archiveLevel]]),
        ),
      ),
    ).toEqual([40, 75, 110, 145, 180]);
    const levels = new Map([
      ['archive', 5],
      ['cultivation_room', 5],
      ['workshop', 5],
      ['spirit_vein', 5],
    ]);
    expect(LINGXIAO_ORGANIZATION.benefits.methodLevelCap(levels)).toBe(180);
    expect(
      LINGXIAO_ORGANIZATION.benefits.retreatMultiplier(levels, 'outer'),
    ).toBe(1.1);
    expect(
      LINGXIAO_ORGANIZATION.benefits.craftDiscount(
        'sect.craft.alchemy',
        levels,
        'true',
      ),
    ).toEqual({
      capability: 'sect.facility.alchemy.use',
      discount: 0.2,
    });
    expect(
      LINGXIAO_ORGANIZATION.benefits.craftDiscount(
        'sect.craft.refinery',
        levels,
        'true',
      ),
    ).toEqual({
      capability: 'sect.facility.refinery.use',
      discount: 0.2,
    });
    expect(LINGXIAO_ORGANIZATION.benefits.stipendMultiplier(levels)).toBe(1.25);
  });

  it('rotates the weekly bounty between battle and material delivery', () => {
    const bounty = LINGXIAO_ORGANIZATION.tasks.get('weekly_bounty');
    expect(
      bounty?.availability?.resolve({
        dateKey: '2026-07-12',
        weekKey: '2026-W28',
      }),
    ).toBe('battle');
    expect(
      bounty?.availability?.resolve({
        dateKey: '2026-07-19',
        weekKey: '2026-W29',
      }),
    ).toBe('material');
    expect(bounty?.availability?.variants).toContainEqual({
      key: 'material',
      executorKey: 'sect.delivery.material',
      offer: {
        policy: 'sect.offer.delivery',
        input: { kind: 'material' },
      },
    });
  });

  it('builds realm NPCs without copying the current player loadout or attributes', () => {
    const factory = LINGXIAO_ORGANIZATION.battles.get('weekly_bounty');
    const first = factory?.create({
      player: playerFixture(),
      mirror: null,
      opponentId: 'npc-1',
    }).opponent;
    const second = factory?.create({
      player: playerFixture({
        attributes: {
          vitality: 1,
          spirit: 200,
          wisdom: 1,
          speed: 200,
          willpower: 1,
        },
        pre_heaven_fates: [{ name: '另一命格' }],
      }),
      mirror: null,
      opponentId: 'npc-1',
    }).opponent;

    expect(first).toEqual(second);
    expect(first?.name).toBe('无名叛徒残影');
    expect(first?.pre_heaven_fates).toEqual([]);
    expect(first?.inventory.artifacts).toEqual([]);
    expect(first?.spiritual_roots).toEqual([]);
  });

  it.each([
    ['mine_patrol', '矿场巡视', '矿脉侵扰妖兽'],
    ['weekly_tournament', '宗门小比', '同门演武傀儡'],
    ['weekly_bounty', '悬赏残影战', '叛徒残影'],
    ['elder_trial', '长老试炼', '传功长老化身'],
  ])('uses canonical copy for %s battle opponents', (taskId, title, name) => {
    const result = LINGXIAO_ORGANIZATION.battles.get(taskId)?.create({
      player: playerFixture(),
      mirror: playerFixture({ id: 'mirror', name: '同门' }),
      opponentId: `npc-${taskId}`,
    });

    expect(result?.title).toBe(title);
    expect(result?.opponent.name).toBe(name);
  });
});

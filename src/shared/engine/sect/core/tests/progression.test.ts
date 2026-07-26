import { describe, expect, it } from 'vitest';
import {
  getPathProgress,
  getSectMethodLevelCap,
  getSectMethodTrainingCost,
  standardSectProgression,
  validateMeridianNodeIds,
} from '..';
import { HEAVY_SWORD_PATH, SWIFT_SWORD_PATH } from '../../content/lingxiao';

describe('通用宗门成长', () => {
  it('每个境界阶段开放五级并在渡劫圆满达到180级', () => {
    expect(getSectMethodLevelCap('炼气', '初期')).toBe(5);
    expect(getSectMethodLevelCap('筑基', '初期')).toBe(25);
    expect(getSectMethodLevelCap('渡劫', '圆满')).toBe(180);
  });

  it.each([
    [1, 50, 200],
    [50, 550, 1_700],
    [100, 6_270, 18_900],
    [120, 16_620, 49_900],
    [150, 71_810, 215_500],
    [180, 310_360, 931_100],
  ])(
    '%i级按独立指数曲线计算单级修为与灵石',
    (level, cultivationExp, spiritStones) => {
      expect(getSectMethodTrainingCost(level - 1, level)).toEqual({
        cultivationExp,
        comprehensionInsight: 0,
        spiritStones,
      });
    },
  );

  it('逐级取整后累加跨级成本', () => {
    expect(getSectMethodTrainingCost(4, 6)).toEqual({
      cultivationExp: 140,
      comprehensionInsight: 0,
      spiritStones: 600,
    });
  });

  it('1至180级累计成本与分段累加一致', () => {
    const total = getSectMethodTrainingCost(0, 180);
    const first = getSectMethodTrainingCost(0, 120);
    const second = getSectMethodTrainingCost(120, 180);
    expect(total).toEqual({
      cultivationExp: 6_517_250,
      comprehensionInsight: 0,
      spiritStones: 19_560_400,
    });
    expect(total.cultivationExp).toBe(
      first.cultivationExp + second.cultivationExp,
    );
    expect(total.spiritStones).toBe(
      first.spiritStones + second.spiritStones,
    );
    expect(first.comprehensionInsight + second.comprehensionInsight).toBe(0);
  });

  it('所有可用等级的灵石成本均高于修为成本', () => {
    for (let level = 1; level <= 180; level += 1) {
      const cost = getSectMethodTrainingCost(level - 1, level);
      expect(cost.spiritStones).toBeGreaterThan(cost.cultivationExp);
      expect(cost.comprehensionInsight).toBe(0);
    }
  });

  it('参悟只允许选择已解锁层且同层互斥', () => {
    expect(() =>
      validateMeridianNodeIds({
        path: SWIFT_SWORD_PATH,
        nodeIds: ['swift-opening'],
        unlockedLayerIds: [],
        methods: {},
      }),
    ).toThrow('尚未解锁');
    expect(() =>
      validateMeridianNodeIds({
        path: SWIFT_SWORD_PATH,
        nodeIds: ['swift-opening', 'swift-hidden-edge'],
        unlockedLayerIds: ['1'],
        methods: {},
      }),
    ).toThrow('只能选择一个节点');
    expect(
      validateMeridianNodeIds({
        path: HEAVY_SWORD_PATH,
        nodeIds: ['heavy-opening'],
        unlockedLayerIds: ['1'],
        methods: {},
      }),
    ).toEqual(['heavy-opening']);
  });

  it('六层按顺序、境界和精确资源成本解锁', () => {
    expect(HEAVY_SWORD_PATH.layers.map((layer) => layer.cost)).toEqual([
      { cultivationExp: 950, comprehensionInsight: 10, spiritStones: 9_500 },
      {
        cultivationExp: 2_500,
        comprehensionInsight: 15,
        spiritStones: 25_000,
      },
      {
        cultivationExp: 13_500,
        comprehensionInsight: 20,
        spiritStones: 135_000,
      },
      {
        cultivationExp: 47_000,
        comprehensionInsight: 25,
        spiritStones: 470_000,
      },
      {
        cultivationExp: 65_000,
        comprehensionInsight: 30,
        spiritStones: 650_000,
      },
      {
        cultivationExp: 125_000,
        comprehensionInsight: 40,
        spiritStones: 1_250_000,
      },
    ]);
    const progress = getPathProgress({
      path: HEAVY_SWORD_PATH,
      unlockedLayerIds: ['1', '2', '3', '4'],
      realm: '化神',
      stage: '中期',
    });
    expect(progress.unlockedLayers.map((layer) => layer.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(progress.nextLayer).toMatchObject({ id: '5' });
    expect(progress.nextLayerAvailable).toBe(true);
    expect(() =>
      standardSectProgression.assertPathLayerUnlock({
        path: HEAVY_SWORD_PATH,
        unlockedLayerIds: ['1'],
        layerId: '3',
        realm: '金丹',
        stage: '圆满',
        methods: {},
      }),
    ).toThrow('按顺序解锁');
  });
});

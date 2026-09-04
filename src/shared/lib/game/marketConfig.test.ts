import { describe, expect, it } from 'vitest';

import {
  getDominantMarketMaterialTypes,
  getLayerConfig,
  getMarketNodeSwitchOptions,
  getMarketProfileHint,
  resolveMarketSwitchLayer,
} from './marketConfig';

describe('marketConfig display helpers', () => {
  it('resolves dominant material types by region weight', () => {
    expect(getDominantMarketMaterialTypes('TN_YUE_01')).toEqual([
      'herb',
      'aux',
      'ore',
    ]);
    expect(getDominantMarketMaterialTypes('LX_INNER_01')).toEqual([
      'monster',
      'ore',
      'tcdb',
    ]);
    expect(getDominantMarketMaterialTypes('TN_BAICAO_01')).toEqual([
      'seed',
      'herb',
      'aux',
    ]);
  });

  it('returns enabled market node switch options', () => {
    const options = getMarketNodeSwitchOptions();
    const ids = options.map((option) => option.id);

    expect(ids).toContain('TN_YUE_01');
    expect(ids).toContain('LX_INNER_01');
    expect(ids).toContain('DJ_CENTRAL_01');
    expect(ids).toContain('TN_BAICAO_01');
    expect(ids).not.toContain('TN_YUE_02');
    expect(options.find((option) => option.id === 'DJ_CENTRAL_01')).toMatchObject({
      name: '雍州·班底庄',
      region: '雍州',
      dominantMaterialTypes: ['tcdb', 'ore', 'aux'],
    });
    expect(options.find((option) => option.id === 'TN_BAICAO_01')).toMatchObject({
      name: '京畿·灯草集',
      region: '京畿',
      allowedLayers: ['common', 'treasure', 'heaven'],
      dominantMaterialTypes: ['seed', 'herb', 'aux'],
    });
  });

  it('falls back to an available layer when switching market nodes', () => {
    expect(resolveMarketSwitchLayer('TN_YUE_01', 'black')).toBe('black');
    expect(resolveMarketSwitchLayer('TN_YUE_02', 'black')).toBe('common');
  });

  it('configures black market as high-risk high-tier stock', () => {
    const black = getLayerConfig('black');

    expect(black.rankRange).toEqual({ min: '地品', max: '神品' });
    expect(black.minHighTierCount).toBe(2);
    // 高阶占比收敛：地品走量为主，神品仅为≈4% 的稀见货（避免旧配置神品≈7%+泛滥）
    expect(black.qualityWeights).toMatchObject({
      地品: 62,
      天品: 24,
      仙品: 10,
      神品: 4,
    });
    expect(black.qualityWeights).not.toHaveProperty('灵品');
    expect(black.qualityWeights).not.toHaveProperty('玄品');
    expect(black.qualityWeights).not.toHaveProperty('真品');
  });

  it('gives treasure & heaven explicit quality weights to suppress top-heavy tails', () => {
    const treasure = getLayerConfig('treasure');
    const heaven = getLayerConfig('heaven');

    // 珍宝阁：默认 玄~地品，地品权重显著低于玄/真（归一化地品≈11.8% → ≈6%）
    expect(treasure.rankRange).toEqual({ min: '玄品', max: '地品' });
    expect(treasure.qualityWeights).toMatchObject({
      玄品: 62,
      真品: 30,
      地品: 6,
    });
    // 天品权重仅为雍州大晋节点（真品~天品覆盖）保留微量出现
    expect(treasure.qualityWeights).toHaveProperty('天品', 2);
    expect(treasure.qualityWeights).not.toHaveProperty('仙品');
    expect(treasure.qualityWeights).not.toHaveProperty('神品');

    // 天宝殿：地品为主流，天品+ 合计 ≈36%（旧归一化 60%），神品 ≈3%
    expect(heaven.rankRange).toEqual({ min: '地品', max: '神品' });
    expect(heaven.qualityWeights).toMatchObject({
      地品: 64,
      天品: 24,
      仙品: 9,
      神品: 3,
    });
    expect(heaven.qualityWeights).not.toHaveProperty('真品');
    expect(heaven.qualityWeights).not.toHaveProperty('玄品');
  });

  it('shows black market risk hint without exact probability', () => {
    expect(getMarketProfileHint('TN_YUE_01', 'black').layerHints).toContain(
      '黑市疑货多，价格浮动大，高阶材料概率更高。',
    );
  });
});

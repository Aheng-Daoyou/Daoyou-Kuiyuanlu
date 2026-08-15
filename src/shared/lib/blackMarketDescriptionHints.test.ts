import {
  buildFallbackBlackMarketDescriptionHints,
} from './blackMarketDescriptionHints';

describe('black market description hints', () => {
  it('returns at least three safe description hints', () => {
    const hints = buildFallbackBlackMarketDescriptionHints({
      name: '九曲冰莲',
      type: 'herb',
      rank: '天品',
      element: '冰',
      description:
        '生于极寒冰湖深处的灵莲，花瓣冰蓝透明如宝石，莲蓬蕴含极寒灵力，可炼制冰魄凝神之丹。',
    });
    expect(hints.length).toBeGreaterThanOrEqual(3);
    expect(hints.every((hint) => hint.safeText.length > 0)).toBe(true);
  });

  it('does not leak the exact material name in safe text', () => {
    const hints = buildFallbackBlackMarketDescriptionHints({
      name: '九曲冰莲',
      type: 'herb',
      rank: '天品',
      element: '冰',
      description: '九曲冰莲生于极寒冰湖深处，花瓣冰蓝透明。',
    });
    expect(
      hints.some((hint) => hint.safeText.includes('九曲冰莲')),
    ).toBe(false);
  });
});

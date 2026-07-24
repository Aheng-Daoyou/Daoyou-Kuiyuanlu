import { describe, expect, it } from 'vitest';
import { createItemSubmissionOptions } from './itemSubmissionModel';

describe('item submission display model', () => {
  it('sorts eligible items first and warns for excess quality', () => {
    const options = createItemSubmissionOptions(
      [
        {
          item: {
            kind: 'material',
            id: 'low',
            name: '凡铁',
            quality: '凡品',
            quantity: 1,
            materialType: 'ore',
          },
          eligible: false,
          violations: [{ code: 'quality_too_low', message: '品质不足' }],
        },
        {
          item: {
            kind: 'material',
            id: 'high',
            name: '天外玄铁',
            quality: '天品',
            quantity: 1,
            materialType: 'ore',
          },
          eligible: true,
          violations: [],
        },
      ],
      '玄品',
    );
    expect(options.map((item) => item.id)).toEqual(['high', 'low']);
    expect(options[0]?.warning).toContain('奖励不会因此增加');
    expect(options[1]?.reasons).toEqual(['品质不足']);
  });
});

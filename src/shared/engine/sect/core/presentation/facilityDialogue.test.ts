import { describe, expect, it } from 'vitest';
import {
  describeSectConstructionProject,
  describeSectFacilityStatus,
} from './facilityDialogue';

describe('sect facility dialogue projection', () => {
  it('formats facility level and semantic metrics as player-facing Chinese', () => {
    const segments = describeSectFacilityStatus({
      facilityLabel: '灵脉',
      facility: { key: 'spirit_vein', level: 3 },
      effect: {
        renderer: 'sect.benefit.stipend',
        summary: '周俸灵石提高 15%',
        metrics: [
          {
            key: 'level',
            label: '灵脉等级',
            value: 3,
            format: 'number',
          },
          {
            key: 'stipend_bonus',
            label: '俸禄灵石加成',
            value: 0.15,
            format: 'percent',
          },
        ],
      },
    });
    const text = segments.map((segment) => segment.text).join('');

    expect(text).toContain('灵脉如今是3级');
    expect(text).toContain('俸禄灵石加成15%');
    expect(text).not.toMatch(/spirit_vein|stipend_bonus|renderer|_/u);
  });

  it('describes current construction progress without exposing facility keys', () => {
    const segments = describeSectConstructionProject({
      facilityLabel: '传承阁',
      project: {
        id: 'project',
        sectId: 'sect',
        facilityKey: 'archive',
        targetLevel: 4,
        progress: 450,
        target: 900,
        status: 'active',
        startedWeekKey: '2026-W30',
      },
    });
    const text = segments.map((segment) => segment.text).join('');

    expect(text).toContain('传承阁提升至4级');
    expect(text).toContain('已经完成50%');
    expect(text).not.toContain('archive');
  });
});

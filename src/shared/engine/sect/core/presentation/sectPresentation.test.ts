import { describe, expect, it } from 'vitest';
import {
  resolveSectPresentation,
  type SectPresentationTheme,
} from './sectPresentation';

describe('sect presentation affairs room', () => {
  it('provides one default NPC for every task kind', () => {
    const presentation = resolveSectPresentation('sample-sect');

    expect(Object.keys(presentation.affairsRoom.taskNpcs)).toEqual([
      'daily',
      'weekly',
      'promotion',
    ]);
    expect(presentation.affairsRoom.taskNpcs.daily.name).toBe('值日执事');
    expect(presentation.affairsRoom.taskNpcs.daily.sigil).toBe('执');
    expect(presentation.affairsRoom.taskNpcs.weekly.name).toBe('功簿执事');
    expect(presentation.affairsRoom.taskNpcs.weekly.sigil).toBe('簿');
    expect(presentation.affairsRoom.taskNpcs.promotion.name).toBe('传功长老');
    expect(presentation.affairsRoom.taskNpcs.promotion.sigil).toBe('传');
  });

  it('merges sect-specific room and NPC copy with the defaults', () => {
    const presentation = resolveSectPresentation('sample-sect', {
      sectId: 'sample-sect',
      affairsRoom: {
        description: '星轨交汇之处，诸般事务各归其席。',
        taskNpcs: {
          daily: {
            sigil: '辰',
            name: '司辰使',
            greeting: '今日星轨已经排定。',
          },
        },
      },
    });

    expect(presentation.affairsRoom.description).toBe(
      '星轨交汇之处，诸般事务各归其席。',
    );
    expect(presentation.affairsRoom.taskNpcs.daily).toMatchObject({
      id: 'daily-steward',
      sigil: '辰',
      name: '司辰使',
      identity: '值日执事',
      greeting: '今日星轨已经排定。',
    });
    expect(presentation.affairsRoom.taskNpcs.weekly.name).toBe('功簿执事');
  });

  it('rejects blank fields and duplicate NPC identifiers', () => {
    expect(() =>
      resolveSectPresentation('sample-sect', {
        sectId: 'sample-sect',
        affairsRoom: { taskNpcs: { daily: { greeting: ' ' } } },
      }),
    ).toThrow('daily.greeting');

    const duplicateIds: SectPresentationTheme = {
      sectId: 'sample-sect',
      affairsRoom: {
        taskNpcs: {
          daily: { id: 'same-steward' },
          weekly: { id: 'same-steward' },
        },
      },
    };
    expect(() => resolveSectPresentation('sample-sect', duplicateIds)).toThrow(
      'NPC ID 不可重复',
    );
  });
});

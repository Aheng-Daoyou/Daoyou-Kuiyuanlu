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
    expect(presentation.affairsRoom.taskNpcs.daily.responsibility).toBe(
      '负责日常委托。',
    );
    expect(presentation.affairsRoom.taskNpcs.weekly.name).toBe('功簿执事');
    expect(presentation.affairsRoom.taskNpcs.weekly.sigil).toBe('簿');
    expect(presentation.affairsRoom.taskNpcs.weekly.responsibility).toBe(
      '负责周常委托。',
    );
    expect(presentation.affairsRoom.taskNpcs.promotion.name).toBe('传功长老');
    expect(presentation.affairsRoom.taskNpcs.promotion.sigil).toBe('传');
    expect(presentation.affairsRoom.taskNpcs.promotion.responsibility).toBe(
      '负责晋升试炼。',
    );
    expect(presentation.terms.sweepActivity).toBe('清扫山门');
    expect(presentation.terms.sweepCanvasLabel).toBe('清扫山门游戏画布');
  });

  it('merges sect-specific room and NPC copy with the defaults', () => {
    const presentation = resolveSectPresentation('sample-sect', {
      sectId: 'sample-sect',
      affairsRoom: {
        description: '星轨交汇之处，诸般事务各归其席。',
        taskNpcs: {
          daily: {
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
      sigil: '执',
      name: '司辰使',
      identity: '值日执事',
      greeting: '今日星轨已经排定。',
    });
    expect(presentation.affairsRoom.taskNpcs.weekly.name).toBe('功簿执事');
  });

  it('ignores runtime attempts to override canonical NPC role fields', () => {
    const unsafeTheme = {
      sectId: 'sample-sect',
      affairsRoom: {
        taskNpcs: {
          daily: {
            name: '司辰使',
            sigil: '辰',
            identity: '当值算使',
            responsibility: '负责校正地刻。',
          },
        },
      },
      terms: {
        sweepActivity: '校正地刻',
        sweepCanvasLabel: '校正地刻游戏画布',
      },
    } as unknown as SectPresentationTheme;
    const presentation = resolveSectPresentation('sample-sect', unsafeTheme);

    expect(presentation.affairsRoom.taskNpcs.daily).toMatchObject({
      name: '司辰使',
      sigil: '执',
      identity: '值日执事',
      responsibility: '负责日常委托。',
    });
    expect(presentation.terms.sweepActivity).toBe('清扫山门');
    expect(presentation.terms.sweepCanvasLabel).toBe('清扫山门游戏画布');
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

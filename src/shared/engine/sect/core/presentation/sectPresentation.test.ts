import { describe, expect, it } from 'vitest';
import {
  resolveSectPresentation,
  type SectPresentationTheme,
} from './sectPresentation';

describe('sect presentation affairs room', () => {
  it('provides one default NPC for every task kind', () => {
    const presentation = resolveSectPresentation('sample-sect');
    const actors = presentation.rooms.affairs.actors;
    const actorByRole = Object.fromEntries(
      actors.map((actor) => [actor.roleKey, actor]),
    );

    expect(actors.map((actor) => actor.roleKey)).toEqual([
      'daily',
      'weekly',
      'promotion',
    ]);
    expect(actorByRole.daily.name).toBe('值日执事');
    expect(actorByRole.daily.sigil).toBe('执');
    expect(actorByRole.daily.responsibility).toBe('负责日常委托。');
    expect(actorByRole.weekly.name).toBe('功簿执事');
    expect(actorByRole.weekly.sigil).toBe('簿');
    expect(actorByRole.weekly.responsibility).toBe('负责周常委托。');
    expect(actorByRole.promotion.name).toBe('传功长老');
    expect(actorByRole.promotion.sigil).toBe('传');
    expect(actorByRole.promotion.responsibility).toBe('负责晋升试炼。');
    expect(presentation.terms.sweepActivity).toBe('清扫山门');
    expect(presentation.terms.sweepCanvasLabel).toBe('清扫山门游戏画布');
  });

  it('resolves managed rooms without allowing role or renderer overrides', () => {
    const unsafeTheme = {
      sectId: 'sample-sect',
      rooms: {
        spiritVein: {
          description: '地脉静室。',
          actors: {
            keeper: {
              id: 'sample-vein-keeper',
              name: '听脉人',
              greeting: '今日脉息安稳。',
              sigil: '矿',
              identity: '矿场主人',
              responsibility: '负责开采。',
              conversation: { renderer: 'unsafe.renderer' },
            },
          },
        },
      },
    } as unknown as SectPresentationTheme;
    const presentation = resolveSectPresentation('sample-sect', unsafeTheme);
    const actor = presentation.rooms.spiritVein.actors[0];

    expect(presentation.rooms.spiritVein.description).toBe('地脉静室。');
    expect(actor).toMatchObject({
      id: 'sample-vein-keeper',
      name: '听脉人',
      greeting: '今日脉息安稳。',
      sigil: '脉',
      identity: '守脉执事',
      responsibility: '负责灵脉状态与矿场巡视。',
      conversation: { renderer: 'sect.spirit-vein.status' },
    });
  });

  it('rejects unknown managed rooms, roles and duplicate actor identifiers', () => {
    expect(() =>
      resolveSectPresentation('sample-sect', {
        sectId: 'sample-sect',
        rooms: { unknown: { description: '未知房间。' } },
      }),
    ).toThrow('未知房间');
    expect(() =>
      resolveSectPresentation('sample-sect', {
        sectId: 'sample-sect',
        rooms: {
          hall: {
            actors: { unknown: { name: '无名' } },
          },
        },
      }),
    ).toThrow('未知角色');
    expect(() =>
      resolveSectPresentation('sample-sect', {
        sectId: 'sample-sect',
        rooms: {
          hall: {
            actors: {
              registry: { id: 'same' },
              stipend: { id: 'same' },
            },
          },
        },
      }),
    ).toThrow('NPC ID 不可重复');
  });

  it('merges sect-specific room and NPC copy with the defaults', () => {
    const presentation = resolveSectPresentation('sample-sect', {
      sectId: 'sample-sect',
      rooms: {
        affairs: {
          description: '星轨交汇之处，诸般事务各归其席。',
          actors: {
            daily: {
              name: '司辰使',
              greeting: '今日星轨已经排定。',
            },
          },
        },
      },
    });
    const actorByRole = Object.fromEntries(
      presentation.rooms.affairs.actors.map((actor) => [actor.roleKey, actor]),
    );

    expect(presentation.rooms.affairs.description).toBe(
      '星轨交汇之处，诸般事务各归其席。',
    );
    expect(actorByRole.daily).toMatchObject({
      id: 'daily-steward',
      sigil: '执',
      name: '司辰使',
      identity: '值日执事',
      greeting: '今日星轨已经排定。',
    });
    expect(actorByRole.weekly.name).toBe('功簿执事');
  });

  it('ignores runtime attempts to override canonical NPC role fields', () => {
    const unsafeTheme = {
      sectId: 'sample-sect',
      rooms: {
        affairs: {
          actors: {
            daily: {
              name: '司辰使',
              sigil: '辰',
              identity: '当值算使',
              responsibility: '负责校正地刻。',
            },
          },
        },
      },
      terms: {
        sweepActivity: '校正地刻',
        sweepCanvasLabel: '校正地刻游戏画布',
      },
    } as unknown as SectPresentationTheme;
    const presentation = resolveSectPresentation('sample-sect', unsafeTheme);
    const dailyActor = presentation.rooms.affairs.actors.find(
      (actor) => actor.roleKey === 'daily',
    );

    expect(dailyActor).toMatchObject({
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
        rooms: {
          affairs: { actors: { daily: { greeting: ' ' } } },
        },
      }),
    ).toThrow('daily.greeting');

    const duplicateIds: SectPresentationTheme = {
      sectId: 'sample-sect',
      rooms: {
        affairs: {
          actors: {
            daily: { id: 'same-steward' },
            weekly: { id: 'same-steward' },
          },
        },
      },
    };
    expect(() => resolveSectPresentation('sample-sect', duplicateIds)).toThrow(
      'NPC ID 不可重复',
    );
  });
});

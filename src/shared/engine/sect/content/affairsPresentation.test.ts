import { describe, expect, it } from 'vitest';
import { PRODUCTION_SECT_PRESENTATIONS } from './productionRuntime';

describe('production sect affairs presentations', () => {
  it('provides twelve named NPCs across the four production sects', () => {
    const expectedNames = [
      ['林砚秋', '顾闻锋', '谢停云'],
      ['明尘', '照业', '渡厄'],
      ['纪司辰', '许衡章', '容观澜'],
      ['沈照灯', '白守簿', '楚引归'],
    ];
    const presentations = Object.values(PRODUCTION_SECT_PRESENTATIONS);

    expect(presentations).toHaveLength(4);
    expect(
      presentations.map((presentation) =>
        Object.values(presentation.affairsRoom.taskNpcs).map((npc) => npc.name),
      ),
    ).toEqual(expectedNames);
    for (const presentation of presentations) {
      const npcs = Object.values(presentation.affairsRoom.taskNpcs);
      expect(new Set(npcs.map((npc) => npc.id)).size).toBe(3);
      for (const npc of npcs) {
        expect(npc.identity.trim()).not.toBe('');
        expect(npc.responsibility.trim()).not.toBe('');
        expect(npc.greeting.trim()).not.toBe('');
      }
    }
  });
});

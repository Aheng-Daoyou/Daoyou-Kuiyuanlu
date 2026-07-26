import { describe, expect, it } from 'vitest';
import { StandardSectOrganizationModule } from '../core';
import {
  PRODUCTION_SECT_PRESENTATIONS,
  PRODUCTION_SECTS,
} from './productionRuntime';

const taskIds = [
  'gate_sweep',
  'mine_patrol',
  'pill_delivery',
  'artifact_delivery',
  'weekly_diligence',
  'weekly_tournament',
  'weekly_bounty',
  'elder_trial',
] as const;

const canonicalNpcRoles = [
  {
    sigil: '执',
    identity: '值日执事',
    responsibility: '负责日常委托。',
  },
  {
    sigil: '簿',
    identity: '功簿执事',
    responsibility: '负责周常委托。',
  },
  {
    sigil: '传',
    identity: '传功长老',
    responsibility: '负责晋升试炼。',
  },
] as const;

describe('production sect affairs presentations', () => {
  it('provides twelve named NPCs with canonical roles', () => {
    const expectedNames = [
      ['陆青崖', '裴守拙', '听剑老人'],
      ['法明', '慧觉', '空慈方丈'],
      ['知微', '玄衡道人', '观澜真人'],
      ['照灯', '守簿翁', '归魂婆婆'],
    ];
    const presentations = Object.values(PRODUCTION_SECT_PRESENTATIONS);

    expect(presentations).toHaveLength(4);
    expect(
      presentations.map((presentation) =>
        presentation.rooms.affairs.actors.map((npc) => npc.name),
      ),
    ).toEqual(expectedNames);
    for (const presentation of presentations) {
      const npcs = presentation.rooms.affairs.actors;
      expect(new Set(npcs.map((npc) => npc.id)).size).toBe(3);
      expect(npcs).toMatchObject(canonicalNpcRoles);
      for (const npc of npcs) expect(npc.greeting.trim()).not.toBe('');
      expect(presentation.terms.sweepActivity).toBe('清扫山门');
      expect(presentation.terms.sweepCanvasLabel).toBe('清扫山门游戏画布');
    }
  });

  it('uses one canonical presentation for every standard task', () => {
    const standard = new StandardSectOrganizationModule();

    for (const { module } of PRODUCTION_SECTS) {
      for (const taskId of taskIds) {
        expect(module.organization.tasks.get(taskId)?.presentation).toEqual(
          standard.tasks.get(taskId)?.presentation,
        );
      }
    }
  });

  it('provides themed names while keeping managed room roles canonical', () => {
    const expectedRooms = [
      'hall',
      'treasury',
      'industries',
      'archive',
      'paths',
      'arena',
      'cultivation',
      'alchemy',
      'refinery',
      'spiritVein',
      'herbGarden',
      'gate',
    ];
    for (const presentation of Object.values(PRODUCTION_SECT_PRESENTATIONS)) {
      for (const roomKey of expectedRooms) {
        const room = presentation.rooms[roomKey];
        expect(room).toBeDefined();
        for (const actor of room.actors) {
          expect(actor.name.trim()).not.toBe('');
          expect(actor.greeting.trim()).not.toBe('');
          expect(actor.identity.trim()).not.toBe('');
          expect(actor.responsibility.trim()).not.toBe('');
          expect(actor.conversation.renderer).toMatch(/^sect\./u);
        }
      }
    }
  });
});

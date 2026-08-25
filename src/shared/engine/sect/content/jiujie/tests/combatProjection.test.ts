import { GameplayTags } from '@shared/engine/shared/tag-domain';
import { describe, expect, it } from 'vitest';
import { JIUJIE_BASE_DEFINITION } from '../definition';
import { JIUJIE_CALAMITY, JIUJIE_CONDEMNATION_PATH_ID, JIUJIE_EYE_PATH_ID, JIUJIE_THUNDER, JIUJIE_DEBT } from '../ids';
import { JIUJIE_MODULE } from '../JiujieSectModule';
import { JIUJIE_CONDEMNATION_NODES } from '../paths/condemnation/nodes';
import { JIUJIE_EYE_NODES } from '../paths/eye/nodes';
import { JIUJIE_SECT_PRESENTATION } from '../presentation';
import { JiujieCondemnationBuildFacade, JiujieEyeBuildFacade, createJiujieBuildSettings } from '../shared/buildFacade';
import { projectSectCombat, productionSectRuntime, PRODUCTION_SECT_IDS, resolveSectAbility } from '../..';
import type { CultivatorSectState } from '../../../core';

function state(pathId: string, nodeIds: string[] = []): CultivatorSectState {
  return {
    membershipId: 'jiujie-test-membership', sectId: 'jiujie', status: 'active', contribution: 0, configVersion: 1,
    activePathId: pathId,
    methods: { 'jiujie-canon': 10, 'calamity-eye': 5, 'heavenly-record': 5, 'thunder-prison': 5, 'cause-judgment': 5, 'crossing-calamity': 5 },
    paths: [{ pathId, unlockedLayerIds: ['1', '2', '3', '4', '5', 'ultimate'], tacticId: pathId === JIUJIE_EYE_PATH_ID ? 'bear-and-return' : 'record-and-judge', activeMeridianSlot: 1, meridianLoadouts: [{ slot: 1, nodeIds, version: 1 }, { slot: 2, nodeIds: [], version: 1 }, { slot: 3, nodeIds: [], version: 1 }] }],
    abilityLoadout: ['heaven-hearing', 'calamity-seal', 'receive-calamity', 'nine-sky-settlement'],
  };
}

describe('九劫天宫宗门投影', () => {
  it('注册六本心法、两道途与每道途18个节点', () => {
    expect(PRODUCTION_SECT_IDS).toContain('jiujie');
    expect(JIUJIE_BASE_DEFINITION.methods).toHaveLength(6);
    expect(JIUJIE_MODULE.definition.paths).toHaveLength(2);
    for (const path of JIUJIE_MODULE.definition.paths) {
      expect(path.nodes).toHaveLength(18);
      expect(new Set(path.nodes.map((node) => node.id)).size).toBe(18);
    }
  });

  it('五本心法投影到现有面板基础数值，主心法不提供面板加成', () => {
    expect(JIUJIE_BASE_DEFINITION.methods.map((method) => method.growthProfile.panelModifier)).toEqual([
      undefined,
      { attrType: 'maxHp', type: 'add', maxValue: 0.12 },
      { attrType: 'magicAtk', type: 'add', maxValue: 0.15 },
      { attrType: 'magicPenetration', type: 'fixed', maxValue: 0.08 },
      { attrType: 'maxMp', type: 'add', maxValue: 0.18 },
      { attrType: 'magicDef', type: 'add', maxValue: 0.14 },
    ]);
  });

  it('道途节点的重复方向会累积为可观察的共通技能参数变化', () => {
    const eyeSettings = createJiujieBuildSettings(JIUJIE_EYE_PATH_ID);
    const eye = new JiujieEyeBuildFacade(eyeSettings);
    eye.extendReceive();
    eye.extendReceive();
    eye.strengthenSettlement();
    expect(eyeSettings.receiveDuration).toBe(4);
    expect(eyeSettings.finishMemoryRatio).toBeCloseTo(0.50);

    const condemnationSettings = createJiujieBuildSettings(JIUJIE_CONDEMNATION_PATH_ID);
    const condemnation = new JiujieCondemnationBuildFacade(condemnationSettings);
    condemnation.strengthenReoffend();
    condemnation.strengthenReoffend();
    condemnation.strengthenSettlement();
    condemnation.strengthenThunderTrigger();
    expect(condemnationSettings.reoffendBonus).toBeCloseTo(0.35);
    expect(condemnationSettings.settlementThunderDuration).toBe(1);
    expect(condemnationSettings.thunderCoefficient).toBeCloseTo(0.27);
  });

  it('关键节点修改与节点描述一致的编译字段', () => {
    const eyeState = state(JIUJIE_EYE_PATH_ID, ['eye-open']);
    const receive = resolveSectAbility({ sect: eyeState, realm: '化神', abilityId: 'receive-calamity' }).config;
    const receiveBuff = receive.effects?.find((effect) => effect.type === 'apply_buff');
    expect(receiveBuff).toMatchObject({ params: { buffConfig: { duration: 3 } } });

    const condemnationState = state(JIUJIE_CONDEMNATION_PATH_ID, ['condemnation-first-crime']);
    const runtime = resolveSectAbility({ sect: condemnationState, realm: '化神', abilityId: 'jiujie-law-runtime' }).config;
    const activeTrigger = runtime.listeners?.find((listener) => listener.id === 'jiujie.law.active-trigger');
    const baselineRuntime = resolveSectAbility({ sect: state(JIUJIE_CONDEMNATION_PATH_ID), realm: '化神', abilityId: 'jiujie-law-runtime' }).config;
    const baselineTrigger = baselineRuntime.listeners?.find((listener) => listener.id === 'jiujie.law.active-trigger');
    const coefficient = activeTrigger?.effects.find((effect) => effect.type === 'damage');
    const baselineCoefficient = baselineTrigger?.effects.find((effect) => effect.type === 'damage');
    expect(coefficient?.type === 'damage' ? coefficient.params.value.coefficient : undefined)
      .toBeCloseTo((baselineCoefficient?.type === 'damage' ? baselineCoefficient.params.value.coefficient ?? 0 : 0) + 0.02);
  });

  it.each([
    [JIUJIE_EYE_PATH_ID, JIUJIE_EYE_NODES],
    [JIUJIE_CONDEMNATION_PATH_ID, JIUJIE_CONDEMNATION_NODES],
  ] as const)('%s 的18个节点均会改变共通底板且不更换技能或资源ID', (pathId, nodes) => {
    const baseline = productionSectRuntime.compiler.compile(JIUJIE_MODULE, {
      sect: state(pathId),
      realm: '化神',
    });
    for (const node of nodes) {
      const compiled = productionSectRuntime.compiler.compile(JIUJIE_MODULE, {
        sect: state(pathId, [node.definition.id]),
        realm: '化神',
      });
      expect(compiled, node.definition.id).not.toEqual(baseline);
      expect(Object.keys(compiled.abilities), node.definition.id).toEqual(Object.keys(baseline.abilities));
      expect(compiled.resources.map((resource) => resource.id), node.definition.id).toEqual(baseline.resources.map((resource) => resource.id));
    }
  });

  it.each([JIUJIE_EYE_PATH_ID, JIUJIE_CONDEMNATION_PATH_ID])('以共通资源和共通技能底板编译 %s', (pathId) => {
    const projection = projectSectCombat({ sect: state(pathId), realm: '化神' })!;
    expect(projection.resources).toEqual([{ id: JIUJIE_CALAMITY, name: '劫数', icon: '⚡', initial: 0, max: 3 }]);
    expect(projection.defaultAttack?.tags).toContain(GameplayTags.ABILITY.KIND.BASIC);
    expect(projection.abilities.map((ability) => ability.slug)).toEqual(expect.arrayContaining([
      'sect.jiujie.heaven-hearing', 'sect.jiujie.calamity-seal', 'sect.jiujie.jiujie-tianwei-runtime',
    ]));
  });

  it('天威裁决只匹配法术或负面技能，劫雷和劫债独立使用protected规则', () => {
    const passive = resolveSectAbility({ sect: state(JIUJIE_EYE_PATH_ID), realm: '化神', abilityId: 'jiujie-tianwei-runtime' });
    expect(passive.config.listeners).toHaveLength(1);
    expect(passive.config.listeners?.[0]).toMatchObject({
      eventType: GameplayTags.EVENT.SKILL_PRE_CAST,
      conditions: expect.arrayContaining([
        { type: 'ability_has_not_tag', params: { tag: GameplayTags.ABILITY.KIND.BASIC } },
        { type: 'ability_has_any_tag', params: { tags: [GameplayTags.ABILITY.CHANNEL.MAGIC, GameplayTags.ABILITY.FUNCTION.DEBUFF] } },
        { type: 'chance', params: { value: 0.20 } },
      ]),
      effects: [{ type: 'skill_immunity', params: { reason: '天威裁决' } }],
    });
    const hearing = resolveSectAbility({ sect: state(JIUJIE_EYE_PATH_ID), realm: '化神', abilityId: 'heaven-hearing' });
    const thunderConfig = hearing.config.effects?.find((effect) => effect.type === 'apply_buff');
    expect(thunderConfig).toMatchObject({ params: { buffConfig: { id: JIUJIE_THUNDER, dispelPolicy: 'protected', duration: 3 } } });
    expect(JIUJIE_DEBT).toBe('sect.jiujie.debt');
  });

  it('承劫记忆只投影到劫眼道途', () => {
    const listenerIds = (pathId: string | undefined) => {
      const sect = state(pathId ?? JIUJIE_EYE_PATH_ID);
      sect.activePathId = pathId;
      const receive = resolveSectAbility({ sect, realm: '化神', abilityId: 'receive-calamity' }).config;
      const buff = receive.effects?.find((effect) => effect.type === 'apply_buff');
      if (!buff || buff.type !== 'apply_buff') return [];
      return buff.params.buffConfig.listeners?.map((listener) => listener.id) ?? [];
    };
    expect(listenerIds(JIUJIE_EYE_PATH_ID)).toContain('jiujie.eye.remember');
    expect(listenerIds(JIUJIE_CONDEMNATION_PATH_ID)).not.toContain('jiujie.eye.remember');
    expect(listenerIds(undefined)).not.toContain('jiujie.eye.remember');
    const condemnationReceive = resolveSectAbility({
      sect: state(JIUJIE_CONDEMNATION_PATH_ID),
      realm: '化神',
      abilityId: 'receive-calamity',
    });
    expect(condemnationReceive.detailRows.join('')).not.toContain('承劫量');
  });

  it('地图素材与节点主题已挂载', () => {
    expect(JIUJIE_SECT_PRESENTATION.map?.image).toBe('/assets/sect/jiujie-map.webp');
    expect(JIUJIE_SECT_PRESENTATION.map?.aspectRatio).toBe(1.5);
    expect(JIUJIE_SECT_PRESENTATION.map?.hotspots).toHaveLength(16);
    expect(JIUJIE_SECT_PRESENTATION.map?.hotspots?.map((spot) => spot.label)).toEqual(expect.arrayContaining(['劫眼峰', '天谴司']));
    expect(JIUJIE_SECT_PRESENTATION.map?.hotspots?.find((spot) => spot.id === 'formation')).toMatchObject({ locked: true });
    expect(JIUJIE_SECT_PRESENTATION.facilityLabels).toMatchObject({
      alchemy: '听雷丹房',
      herb_garden: '天听木圃',
      formation: '渡厄天梯',
    });
    expect(JIUJIE_SECT_PRESENTATION.map?.hotspots?.find((spot) => spot.id === 'alchemy')?.label).toBe('听雷丹房');
    expect(JIUJIE_SECT_PRESENTATION.map?.hotspots?.find((spot) => spot.id === 'alchemy')?.facility).toBe('workshop');
    expect(JIUJIE_SECT_PRESENTATION.map?.hotspots?.find((spot) => spot.id === 'refinery')?.facility).toBe('workshop');
  });

  it('入门演出使用独立的天宫叙事素材，并完整呈现两道途', () => {
    const onboarding = JIUJIE_SECT_PRESENTATION.onboarding;
    expect(onboarding?.script.backdrop.src).toBe('/assets/sect/onboarding/jiujie.webp');
    expect(onboarding?.script.acts.map((act) => act.id)).toEqual([
      'ascend-heaven-stair',
      'thunder-pool-verdict',
      'calamity-eye',
      'heavenly-condemnation',
      'nine-gates-entry',
    ]);
    expect(onboarding?.script.acts.every((act) => act.backgroundPosition)).toBe(true);
  });
});

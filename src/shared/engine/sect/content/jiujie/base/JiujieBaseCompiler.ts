import { StackRule } from '@shared/engine/battle-v5/buffs/Buff';
import type { BuffConfig, ConditionConfig, EffectConfig, ListenerConfig } from '@shared/engine/battle-v5/core/configs';
import { EventPriorityLevel } from '@shared/engine/battle-v5/core/events';
import { AttributeType, BuffType, DamageSource, DamageType } from '@shared/engine/battle-v5/core/types';
import { GameplayTags } from '@shared/engine/shared/tag-domain';
import { SectAbilityFactory, type SectBuildBuilder, type SectProjectionContext } from '../../../core';
import { JIUJIE_BASE_DEFINITION } from '../definition';
import { JIUJIE_CALAMITY, JIUJIE_CONDEMNATION_PATH_ID, JIUJIE_DEBT, JIUJIE_EYE, JIUJIE_EYE_PATH_ID, JIUJIE_REOFFEND, JIUJIE_SECT_ID, JIUJIE_SIN_CONTROL, JIUJIE_SIN_DAMAGE, JIUJIE_SIN_SUPPORT, JIUJIE_THUNDER, jiujieTag } from '../ids';
import type { JiujieBuildSettings } from '../shared/buildFacade';

const factory = new SectAbilityFactory(JIUJIE_SECT_ID);
const thunderTag = jiujieTag('thunder');
const debtTag = jiujieTag('debt');
const calamityTag = jiujieTag('calamity');
const eyeTag = jiujieTag('calamity-eye');
const reoffendTag = jiujieTag('reoffend');

const c = (type: ConditionConfig['type'], params: ConditionConfig['params']): ConditionConfig => ({ type, params });
const damage = (coefficient: number, source: DamageSource = DamageSource.DIRECT, damageType: DamageType = DamageType.MAGICAL): EffectConfig => ({ type: 'damage', params: { value: { attribute: AttributeType.MAGIC_ATK, coefficient }, damageType, damageSource: source } });
const apply = (buffConfig: BuffConfig, target: 'caster' | 'target' = 'target'): EffectConfig => ({ type: 'apply_buff', params: { buffConfig, target } });

function thunderBuff(settings: JiujieBuildSettings): BuffConfig {
  return {
    id: JIUJIE_THUNDER, name: '劫雷', description: '不可驱散。目标主动行动时承受天罚。', type: BuffType.DEBUFF,
    duration: settings.thunderDuration, stackRule: StackRule.REFRESH_DURATION, dispelPolicy: 'protected', maxLayers: 1,
    tags: [GameplayTags.BUFF.TYPE.DEBUFF, GameplayTags.BUFF.DOT.ROOT, GameplayTags.BUFF.ELEMENT.THUNDER, thunderTag, calamityTag],
    statusTags: [GameplayTags.STATUS.CATEGORY.DOT, thunderTag, calamityTag], removeOnDeath: true,
  };
}

function debtBuff(settings: JiujieBuildSettings): BuffConfig {
  return {
    id: JIUJIE_DEBT, name: '劫债', description: '不可驱散。重复主动行为会把劫债推向清算。', type: BuffType.DEBUFF,
    duration: settings.debtDuration, stackRule: StackRule.STACK_LAYER, maxLayers: 3, dispelPolicy: 'protected',
    tags: [GameplayTags.BUFF.TYPE.DEBUFF, debtTag, calamityTag], statusTags: [debtTag, calamityTag], removeOnDeath: true,
  };
}

function eyeBuff(settings: JiujieBuildSettings): BuffConfig {
  const listeners: ListenerConfig[] = [
    calamityGainListener(),
    { id: 'jiujie.eye.mark-attacker', eventType: GameplayTags.EVENT.DAMAGE_TAKEN, scope: GameplayTags.SCOPE.OWNER_AS_TARGET, priority: EventPriorityLevel.DAMAGE_TAKEN + 1, mapping: { caster: 'owner', target: 'event.caster' }, budget: { maxTriggers: 1, reset: 'buff_lifetime' }, conditions: [c('damage_source_is', { damageSource: DamageSource.DIRECT })], effects: [apply(thunderBuff(settings))] },
  ];
  return { id: JIUJIE_EYE, name: '劫眼', description: '直面来力，将承受的灾厄记入劫簿。', type: BuffType.BUFF, duration: settings.eyeDuration, stackRule: StackRule.REFRESH_DURATION, dispelPolicy: 'protected', countsAsStatus: false, statusTags: [eyeTag], listeners, removeOnDeath: true };
}

function memoryListener(settings: JiujieBuildSettings): ListenerConfig {
  return { id: 'jiujie.eye.remember', eventType: GameplayTags.EVENT.DAMAGE_TAKEN, scope: GameplayTags.SCOPE.OWNER_AS_TARGET, priority: EventPriorityLevel.DAMAGE_TAKEN, mapping: { caster: 'owner', target: 'owner' }, conditions: [c('damage_source_is', { damageSource: DamageSource.DIRECT })], effects: [{ type: 'damage_memory', params: { key: JIUJIE_EYE, mode: 'record', event: 'damage_taken', target: 'target', maxStoredValue: { targetMaxHpRatio: settings.memoryCap } } }] };
}

function calamityGainListener(): ListenerConfig {
  return { id: 'jiujie.eye.gain-calamity', eventType: GameplayTags.EVENT.DAMAGE_TAKEN, scope: GameplayTags.SCOPE.OWNER_AS_TARGET, priority: EventPriorityLevel.DAMAGE_TAKEN, mapping: { caster: 'owner', target: 'owner' }, budget: { maxTriggers: 1, reset: 'source_action' }, conditions: [c('damage_source_is', { damageSource: DamageSource.DIRECT })], effects: [{ type: 'combat_resource_modify', params: { resourceId: JIUJIE_CALAMITY, operation: 'add', amount: 1, target: 'caster', reason: 'gain' } }] };
}

function directDamageReductionListener(reduction: number): ListenerConfig {
  return { id: 'jiujie.receive-calamity.reduce-direct', eventType: GameplayTags.EVENT.DAMAGE_REQUEST, scope: GameplayTags.SCOPE.OWNER_AS_TARGET, priority: EventPriorityLevel.DAMAGE_REQUEST, mapping: { caster: 'owner', target: 'owner' }, conditions: [c('damage_source_is', { damageSource: DamageSource.DIRECT })], effects: [{ type: 'percent_damage_modifier', params: { mode: 'reduce', value: 1 - reduction, allowedDamageSources: [DamageSource.DIRECT] } }] };
}

function receiveBuff(settings: JiujieBuildSettings): BuffConfig {
  const recordsCalamity = settings.pathId === JIUJIE_EYE_PATH_ID;
  const listeners = [directDamageReductionListener(settings.receiveReduction)];
  if (recordsCalamity) {
    listeners.push(memoryListener(settings));
  }
  return {
    id: 'sect.jiujie.receive-calamity',
    name: '承天受劫',
    description: recordsCalamity
      ? '暂承来力，将受过的灾厄记入劫簿。'
      : '暂承来力，降低受到的直接伤害。',
    type: BuffType.BUFF,
    duration: settings.receiveDuration, stackRule: StackRule.REFRESH_DURATION, dispelPolicy: 'protected',
    listeners,
    removeOnDeath: true,
  };
}

function marker(id: string, name: string): BuffConfig {
  return { id, name, type: BuffType.DEBUFF, duration: 4, stackRule: StackRule.REFRESH_DURATION, dispelPolicy: 'protected', countsAsStatus: false, logVisibility: 'debug', statusVisibility: 'hidden', tags: [id, jiujieTag('sin')], statusTags: [id], removeOnDeath: true };
}

function reoffendBuff(): BuffConfig {
  return { id: JIUJIE_REOFFEND, name: '重犯', type: BuffType.DEBUFF, duration: 4, stackRule: StackRule.STACK_LAYER, maxLayers: 2, dispelPolicy: 'protected', countsAsStatus: false, logVisibility: 'debug', statusVisibility: 'hidden', tags: [reoffendTag], statusTags: [reoffendTag], removeOnDeath: true };
}

function runtimeListeners(settings: JiujieBuildSettings): ListenerConfig[] {
  const common = [c('has_tag', { scope: 'target', tag: thunderTag })];
  const actionBudget = { maxTriggers: 1, reset: 'source_action' as const };
  const basicOnly: ListenerConfig = {
    id: 'jiujie.law.basic-trigger',
    eventType: GameplayTags.EVENT.SKILL_CAST,
    scope: GameplayTags.SCOPE.GLOBAL,
    priority: EventPriorityLevel.ACTION_TRIGGER,
    mapping: { caster: 'owner', target: 'event.caster' },
    budget: actionBudget,
    conditions: [
      ...common,
      c('ability_has_exact_tag', { tag: GameplayTags.ABILITY.KIND.BASIC }),
    ],
    effects: [damage(settings.thunderCoefficient, DamageSource.DELAYED, DamageType.DOT)],
  };
  const activeOnly: ListenerConfig = {
    id: 'jiujie.law.active-trigger',
    eventType: GameplayTags.EVENT.SKILL_CAST,
    scope: GameplayTags.SCOPE.GLOBAL,
    priority: EventPriorityLevel.ACTION_TRIGGER,
    mapping: { caster: 'owner', target: 'event.caster' },
    budget: actionBudget,
    conditions: [
      ...common,
      c('ability_has_not_tag', { tag: GameplayTags.ABILITY.KIND.BASIC }),
    ],
    effects: [
      damage(settings.thunderCoefficient, DamageSource.DELAYED, DamageType.DOT),
      apply(debtBuff(settings)),
      {
        type: 'combat_resource_modify',
        params: {
          resourceId: JIUJIE_CALAMITY,
          operation: 'add',
          amount: 1,
          target: 'caster',
          reason: 'gain',
        },
      },
    ],
  };
  const repeats: ListenerConfig[] = settings.pathId === JIUJIE_CONDEMNATION_PATH_ID
    ? [
      [JIUJIE_SIN_DAMAGE, GameplayTags.ABILITY.FUNCTION.DAMAGE],
      [JIUJIE_SIN_SUPPORT, GameplayTags.ABILITY.FUNCTION.HEAL],
      [JIUJIE_SIN_CONTROL, GameplayTags.ABILITY.FUNCTION.CONTROL],
    ].map(([sin, abilityTag]) => ({
      id: `jiujie.law.repeat.${sin}`, eventType: GameplayTags.EVENT.SKILL_CAST, scope: GameplayTags.SCOPE.GLOBAL, priority: EventPriorityLevel.ACTION_TRIGGER + 2,
      mapping: { caster: 'owner', target: 'event.caster' }, budget: { maxTriggers: 1, reset: 'source_action' },
      conditions: [...common, c('ability_has_not_tag', { tag: GameplayTags.ABILITY.KIND.BASIC }), c('ability_has_tag', { tag: abilityTag }), c('has_tag', { scope: 'target', tag: sin })],
      effects: [apply(debtBuff(settings)), apply(reoffendBuff())],
    } as ListenerConfig))
    : [];
  return [basicOnly, activeOnly, ...crimeListeners(settings), ...repeats];
}

function crimeListeners(settings: JiujieBuildSettings): ListenerConfig[] {
  if (settings.pathId !== JIUJIE_CONDEMNATION_PATH_ID) return [];
  const replace = (id: string, name: string): EffectConfig[] => [
    { type: 'consume_status_trigger', params: { match: { tags: [jiujieTag('sin')] }, displayName: '主罪', consume: 'all', effects: [] } },
    apply(marker(id, name)),
  ];
  const baseConditions: ConditionConfig[] = [c('has_tag', { scope: 'target', tag: thunderTag }), c('ability_has_not_tag', { tag: GameplayTags.ABILITY.KIND.BASIC })];
  const listener = (id: string, conditions: ConditionConfig[], effects: EffectConfig[]): ListenerConfig => ({ id, eventType: GameplayTags.EVENT.SKILL_CAST, scope: GameplayTags.SCOPE.GLOBAL, priority: EventPriorityLevel.ACTION_TRIGGER + 1, mapping: { caster: 'owner', target: 'event.caster' }, budget: { maxTriggers: 1, reset: 'source_action' }, conditions: [...baseConditions, ...conditions], effects });
  const damageConditions = [c('ability_has_tag', { tag: GameplayTags.ABILITY.FUNCTION.DAMAGE }), c('ability_has_not_tag', { tag: GameplayTags.ABILITY.FUNCTION.HEAL }), c('ability_has_not_tag', { tag: GameplayTags.ABILITY.FUNCTION.CONTROL })];
  const healConditions = [c('ability_has_tag', { tag: GameplayTags.ABILITY.FUNCTION.HEAL }), c('ability_has_not_tag', { tag: GameplayTags.ABILITY.FUNCTION.CONTROL })];
  const buffConditions = [c('ability_has_tag', { tag: GameplayTags.ABILITY.FUNCTION.BUFF }), c('ability_has_not_tag', { tag: GameplayTags.ABILITY.FUNCTION.DAMAGE }), c('ability_has_not_tag', { tag: GameplayTags.ABILITY.FUNCTION.HEAL }), c('ability_has_not_tag', { tag: GameplayTags.ABILITY.FUNCTION.CONTROL })];
  const controlConditions = [c('ability_has_tag', { tag: GameplayTags.ABILITY.FUNCTION.CONTROL })];
  return [
    listener('jiujie.law.crime.damage', damageConditions, replace(JIUJIE_SIN_DAMAGE, '主罪·伤害')),
    listener('jiujie.law.crime.heal', healConditions, replace(JIUJIE_SIN_SUPPORT, '主罪·扶持')),
    listener('jiujie.law.crime.buff', buffConditions, replace(JIUJIE_SIN_SUPPORT, '主罪·扶持')),
    listener('jiujie.law.crime.control', controlConditions, replace(JIUJIE_SIN_CONTROL, '主罪·控制')),
  ];
}

function compileRuntime(builder: SectBuildBuilder, settings: JiujieBuildSettings): void {
  const definition = JIUJIE_BASE_DEFINITION.abilities.find((a) => a.id === 'jiujie-tianwei-runtime');
  if (!definition || definition.kind !== 'passive') throw new Error('九劫天宫基础被动定义缺失');
  const tianweiConditions: ConditionConfig[] = [
    c('ability_has_not_tag', { tag: GameplayTags.ABILITY.KIND.BASIC }),
    c('ability_has_any_tag', { tags: [GameplayTags.ABILITY.CHANNEL.MAGIC, GameplayTags.ABILITY.FUNCTION.DEBUFF] }),
    c('chance', { value: 0.20 }),
  ];
  builder.setAbility('jiujie-tianwei-runtime', factory.passive({
    definition,
    listeners: [{
      id: 'jiujie.tianwei',
      eventType: GameplayTags.EVENT.SKILL_PRE_CAST,
      scope: GameplayTags.SCOPE.OWNER_AS_TARGET,
      priority: EventPriorityLevel.ACTION_TRIGGER,
      mapping: { caster: 'owner', target: 'owner' },
      conditions: tianweiConditions,
      effects: [{ type: 'skill_immunity', params: { reason: '天威裁决' } }],
    }],
    detailRows: ['受到敌方主动法术或负面技能时，有20%几率免疫整个技能。'],
  }));
  const runtime = JIUJIE_BASE_DEFINITION.abilities.find((a) => a.id === 'jiujie-law-runtime');
  if (!runtime || runtime.kind !== 'passive') throw new Error('九劫天宫劫律定义缺失');
  builder.setAbility('jiujie-law-runtime', factory.passive({ definition: runtime, listeners: runtimeListeners(settings), extraTags: [GameplayTags.ABILITY.ELEMENT.THUNDER], detailRows: ['劫雷在目标主动行动时触发；普攻只承受基础天罚。'] }));
}

function ability(builder: SectBuildBuilder, id: string, spec: Parameters<SectAbilityFactory['active']>[0]): void { builder.setAbility(id, factory.active(spec)); }

export function compileJiujieBase(context: SectProjectionContext, builder: SectBuildBuilder, settings: JiujieBuildSettings): void {
  builder.setResource({ id: JIUJIE_CALAMITY, name: '劫数', icon: '⚡', initial: 0, max: settings.resourceMax });
  compileRuntime(builder, settings);
  const d = (id: string) => { const item = JIUJIE_BASE_DEFINITION.abilities.find((a) => a.id === id); if (!item || (item.kind !== 'active' && item.kind !== 'default')) throw new Error(`九劫天宫神通缺失: ${id}`); return item; };
  const thunder = thunderBuff(settings);
  ability(builder, 'thunder-finger', { definition: d('thunder-finger'), effects: [damage(0.8)], targetPolicy: { team: 'enemy', scope: 'single' }, extraTags: [GameplayTags.ABILITY.ELEMENT.THUNDER], detailRows: ['普攻，仅造成基础雷属性伤害。'] });
  ability(builder, 'heaven-hearing', { definition: d('heaven-hearing'), effects: [damage(0.45), apply(thunder)], targetPolicy: { team: 'enemy', scope: 'single' }, extraTags: [GameplayTags.ABILITY.ELEMENT.THUNDER], detailRows: [`施加不可驱散劫雷，持续${settings.thunderDuration}回合。`] });
  ability(builder, 'receive-calamity', {
    definition: d('receive-calamity'),
    effects: [
      apply(receiveBuff(settings)),
      ...(settings.pathId === JIUJIE_EYE_PATH_ID
        ? [apply(eyeBuff(settings), 'caster')]
        : []),
    ],
    targetPolicy: { team: 'self', scope: 'single' },
    detailRows: [
      `${settings.receiveDuration}回合内降低${Math.round((1 - settings.receiveReduction) * 100)}%直接伤害。`,
      ...(settings.pathId === JIUJIE_EYE_PATH_ID
        ? [
          `承劫量最多记录自身最大气血的${Math.round(settings.memoryCap * 100)}%。`,
          `劫眼持续${settings.eyeDuration}回合；期间首次直接受击标记攻击者，并按行动获得劫数。`,
        ]
        : []),
    ],
  });
  ability(builder, 'calamity-seal', { definition: d('calamity-seal'), effects: [{ type: 'apply_buff', conditions: [c('has_tag', { scope: 'target', tag: thunderTag })], params: { buffConfig: debtBuff(settings) } }, apply(thunder)], targetPolicy: { team: 'enemy', scope: 'single' }, extraTags: [GameplayTags.ABILITY.ELEMENT.THUNDER], detailRows: ['为目标施加或刷新不可驱散劫雷；目标已有劫雷时额外增加1层劫债。'] });
  ability(builder, 'thunder-prison-question', { definition: d('thunder-prison-question'), castConditions: [c('has_tag', { scope: 'target', tag: thunderTag })], effects: [damage(settings.questionCoefficient), { type: 'buff_duration_modify', params: { rounds: 1, tags: [thunderTag] } }, apply(debtBuff(settings))], targetPolicy: { team: 'enemy', scope: 'single' }, extraTags: [GameplayTags.ABILITY.ELEMENT.THUNDER], detailRows: ['造成雷伤，延长劫雷，并推进劫债。'] });
  ability(builder, 'borrow-calamity', { definition: d('borrow-calamity'), castConditions: [c('combat_resource_at_least', { resourceId: JIUJIE_CALAMITY, value: 1 })], effects: [{ type: 'combat_resource_modify', params: { resourceId: JIUJIE_CALAMITY, operation: 'subtract', amount: 1, target: 'caster', reason: 'spend' } }, { type: 'shield', params: { value: { targetMaxHpRatio: settings.borrowShieldRatio }, target: 'caster' } }], targetPolicy: { team: 'self', scope: 'single' }, detailRows: ['消耗1点劫数，获得15%最大气血护盾。'] });
  const debtBonus = (coefficient: number): EffectConfig[] => [
    damage(coefficient),
    { type: 'damage', conditions: [c('buff_layer_at_least', { id: JIUJIE_DEBT, scope: 'target', value: 1 })], params: { value: { attribute: AttributeType.MAGIC_ATK, coefficient: 0.10 }, damageType: DamageType.MAGICAL, damageSource: DamageSource.FOLLOW_UP } },
    { type: 'damage', conditions: [c('buff_layer_at_least', { id: JIUJIE_DEBT, scope: 'target', value: 2 })], params: { value: { attribute: AttributeType.MAGIC_ATK, coefficient: 0.10 }, damageType: DamageType.MAGICAL, damageSource: DamageSource.FOLLOW_UP } },
    { type: 'damage', conditions: [c('buff_layer_at_least', { id: JIUJIE_DEBT, scope: 'target', value: 3 })], params: { value: { attribute: AttributeType.MAGIC_ATK, coefficient: 0.10 }, damageType: DamageType.MAGICAL, damageSource: DamageSource.FOLLOW_UP } },
  ];
  ability(builder, 'causal-echo', {
    definition: d('causal-echo'),
    effects: debtBonus(0.45),
    targetPolicy: { team: 'enemy', scope: 'single' },
    extraTags: [GameplayTags.ABILITY.ELEMENT.THUNDER],
    detailRows: ['造成基础追击雷伤，并根据劫债层数追加回响雷伤。'],
  });
  const settlementEffects: EffectConfig[] = [
    { type: 'resource_scaled_damage', params: { resourceId: JIUJIE_CALAMITY, baseCoefficient: 0.80, coefficientPerPoint: 0.30, maxPoints: 3, consume: 'all', attribute: AttributeType.MAGIC_ATK, damageType: DamageType.MAGICAL, damageSource: DamageSource.DIRECT } },
    ...(settings.finishMemoryRatio > 0 ? [{ type: 'damage_memory', params: { key: JIUJIE_EYE, mode: 'release', ratio: settings.finishMemoryRatio, releaseAs: 'follow_up', target: 'caster', damageType: DamageType.MAGICAL, consume: true } } satisfies EffectConfig] : []),
    ...(settings.settlementThunderDuration > 0 ? [{ type: 'buff_duration_modify', params: { rounds: settings.settlementThunderDuration, tags: [thunderTag] } } satisfies EffectConfig] : []),
    { type: 'consume_status_trigger', params: { match: { id: JIUJIE_DEBT }, displayName: '劫债', consume: 'all', scaleEffectsByLayer: true, target: 'target', effects: [damage(settings.finishDebtCoefficient, DamageSource.FOLLOW_UP)] } },
    { type: 'consume_status_trigger', params: { match: { id: JIUJIE_REOFFEND }, displayName: '重犯', consume: 'all', scaleEffectsByLayer: true, target: 'target', effects: [damage(settings.reoffendBonus, DamageSource.FOLLOW_UP)] } },
    ...(settings.pathId === JIUJIE_CONDEMNATION_PATH_ID ? [{ type: 'consume_status_trigger', params: { match: { tags: [jiujieTag('sin')] }, displayName: '主罪', consume: 'all', target: 'target', effects: [] } } satisfies EffectConfig] : []),
  ];
  ability(builder, 'nine-sky-settlement', { definition: d('nine-sky-settlement'), castConditions: [c('combat_resource_at_least', { scope: 'caster', resourceId: JIUJIE_CALAMITY, value: 2 }), c('has_tag', { scope: 'target', tag: calamityTag })], effects: settlementEffects, targetPolicy: { team: 'enemy', scope: 'single' }, extraTags: [GameplayTags.ABILITY.ELEMENT.THUNDER], detailRows: ['消耗2～3点劫数，清算劫债与重犯记录，并按道途节点维持劫雷。'] });
}

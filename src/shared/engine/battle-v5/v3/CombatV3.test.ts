import { GameplayTags } from '@shared/engine/shared/tag-domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BattleEngineV5 } from '../BattleEngineV5';
import { Buff } from '../buffs/Buff';
import {
  SeededBattleRandomSource,
  withBattleRandomSource,
} from '../core/BattleRandom';
import type { AbilityConfig } from '../core/configs';
import { EventBus } from '../core/EventBus';
import type { ActionPostEvent, DamageRequestEvent } from '../core/events';
import {
  AbilityType,
  AttributeType,
  BuffType,
  DamageSource,
  DamageType,
  type CombatEvent,
} from '../core/types';
import { AbilityTransformEffect } from '../effects/AbilityTransformEffect';
import { CombatResourceModifyEffect } from '../effects/CombatResourceModifyEffect';
import { DelayedEffect } from '../effects/DelayedEffect';
import {
  EffectExecutionContextV3,
  executeGameplayEffectV3,
} from '../effects/Effect';
import { StatusSpreadEffect } from '../effects/StatusSpreadEffect';
import { AbilityFactory } from '../factories/AbilityFactory';
import { DamageSystem } from '../systems/DamageSystem';
import type { UnitStateSnapshot } from '../systems/state/types';
import { Unit } from '../units/Unit';
import {
  BattleRecordValidatorV3,
  validateBattleRecordV3,
} from './BattleRecordV3';
import { CombatPresenterV3 } from './CombatPresenterV3';
import { CombatRecordBuilderV3 } from './CombatRecordBuilderV3';
import type { CombatResultScopeV3 } from './CombatResultEmitterV3';
import { CombatResultEmitterV3 } from './CombatResultEmitterV3';
import { CombatAttributionV3, CombatSystemSourceV3 } from './origin';
import type {
  BattleRecordV3,
  CombatFactV3,
  CombatOriginV3,
  CombatSequenceV3,
} from './types';

function unit(id: string, name: string, strength = 100): Unit {
  return new Unit(id, name, {
    [AttributeType.VITALITY]: 100,
    [AttributeType.STRENGTH]: strength,
    [AttributeType.SPIRIT]: 100,
    [AttributeType.ENDURANCE]: 100,
    [AttributeType.SPEED]: 100,
    [AttributeType.WILLPOWER]: 100,
  });
}

function ownedOrigin(
  owner: Unit,
  carrier: CombatOriginV3 extends infer _T
    ? Extract<CombatOriginV3, { kind: 'owned' }>['carrier']
    : never,
): CombatOriginV3 {
  return {
    kind: 'owned',
    owner: { id: owner.id, name: owner.name },
    carrier,
  };
}

function publishDamage(
  builder: CombatRecordBuilderV3,
  sequenceId: string,
  caster: Unit,
  target: Unit,
  amount: number,
): void {
  const origin = ownedOrigin(caster, {
    kind: 'ability',
    id: 'test-strike',
    name: '测试攻击',
  });
  builder.runInSequence(
    { id: sequenceId, phase: 'action', turn: 1, actor: caster },
    () => {
      EventBus.instance.publish<DamageRequestEvent>({
        type: 'DamageRequestEvent',
        timestamp: Date.now(),
        caster,
        target,
        damageSource: DamageSource.DIRECT,
        damageType: DamageType.TRUE,
        calculationMode: 'resolved_final',
        baseDamage: amount,
        finalDamage: amount,
        origin,
      });
    },
  );
}

function snapshot(id: string, name: string, alive: boolean): UnitStateSnapshot {
  return {
    id,
    name,
    alive,
    hp: { current: alive ? 1 : 0, max: 100, percent: alive ? 1 : 0 },
    mp: { current: 0, max: 100, percent: 0 },
    shield: 0,
    attrs: {} as UnitStateSnapshot['attrs'],
    baseAttrs: {} as UnitStateSnapshot['baseAttrs'],
    buffs: [],
    combatResources: [],
    cooldowns: [],
    actionStates: [],
    canAct: alive,
  };
}

function fact(
  id: string,
  ordinal: number,
  type: 'death_prevented' | 'unit_died' = 'unit_died',
  resolutionId = 'resolution:1',
): CombatFactV3 {
  return {
    id,
    type,
    trace: {
      eventId: id,
      sequenceId: 'sequence:action',
      ordinal,
      resolutionId,
    },
    origin: {
      kind: 'system',
      carrier: { kind: 'system', id: 'test', name: '测试系统' },
    },
    target: { id: 'loser', name: '败者' },
  };
}

function damageFact(
  id: string,
  ordinal: number,
  resolutionId = 'resolution:1',
): CombatFactV3 {
  return {
    id,
    type: 'damage',
    trace: {
      eventId: id,
      sequenceId: 'sequence:action',
      ordinal,
      resolutionId,
    },
    origin: {
      kind: 'system',
      carrier: { kind: 'system', id: 'test', name: '测试系统' },
    },
    target: { id: 'loser', name: '败者' },
    amount: 1,
    beforeHp: 1,
    afterHp: 0,
    shieldAbsorbed: 0,
    damageSource: DamageSource.DIRECT,
  };
}

function recordWithFacts(facts: CombatFactV3[]): BattleRecordV3 {
  const loserAlive = !facts.some((entry) => entry.type === 'unit_died');
  const winner = snapshot('winner', '胜者', true);
  const loser = snapshot('loser', '败者', loserAlive);
  return {
    participants: {
      player: { id: 'winner', name: '胜者' },
      opponent: { id: 'loser', name: '败者' },
    },
    outcome: {
      winner: { id: 'winner', name: '胜者' },
      loser: { id: 'loser', name: '败者' },
      turns: 1,
    },
    sequences: [
      {
        id: 'sequence:action',
        turn: 1,
        phase: 'action',
        actor: { id: 'winner', name: '胜者' },
        facts,
      },
      { id: 'sequence:end', turn: 1, phase: 'battle_end', facts: [] },
    ],
    stateTimeline: {
      unitIds: ['winner', 'loser'],
      unitNames: { winner: '胜者', loser: '败者' },
      frames: [
        {
          frameId: 1,
          turn: 1,
          phase: 'battle_end',
          sourceSequenceId: 'sequence:end',
          units: { winner, loser },
        },
      ],
    },
    finalSnapshots: { winner, loser },
  };
}

describe('combat facts V3', () => {
  beforeEach(() => EventBus.instance.reset());
  afterEach(() => EventBus.instance.reset());

  it('inherits sequence, parent event, and monotonic ordinal', () => {
    const events: CombatEvent[] = [];
    EventBus.instance.subscribe('NestedEventV3', (event) => events.push(event));
    EventBus.instance.subscribe('RootEventV3', (event) => {
      events.push(event);
      EventBus.instance.publish({
        type: 'NestedEventV3',
        timestamp: Date.now(),
      });
    });

    EventBus.instance.runInSequence(
      { id: 'sequence:nested', phase: 'action', turn: 3 },
      () =>
        EventBus.instance.publish({
          type: 'RootEventV3',
          timestamp: Date.now(),
        }),
    );

    expect(events[1].trace).toMatchObject({
      sequenceId: 'sequence:nested',
      parentEventId: events[0].trace?.eventId,
    });
    expect(events[1].trace!.ordinal).toBeGreaterThan(events[0].trace!.ordinal);
  });

  it('constructs active, passive, buff, and system attribution explicitly', () => {
    const attacker = unit('attacker', '进攻者');
    const defender = unit('defender', '防守者');
    const skill = AbilityFactory.create({
      slug: 'active-skill',
      name: '主动术',
      type: AbilityType.ACTIVE_SKILL,
      tags: [
        GameplayTags.ABILITY.KIND.SKILL,
        GameplayTags.ABILITY.FUNCTION.BUFF,
      ],
      effects: [],
    });
    const gongfa = AbilityFactory.create({
      slug: 'defense-gongfa',
      name: '护体功法',
      type: AbilityType.PASSIVE_SKILL,
      tags: [
        GameplayTags.ABILITY.KIND.GONGFA,
        GameplayTags.ABILITY.FUNCTION.BUFF,
      ],
      listeners: [],
    });
    const buff = new Buff('guard-buff', '护体', BuffType.BUFF, 2);
    buff.setCombatAttributionV3(
      CombatAttributionV3.fromAbility(defender, gongfa),
    );
    const trace = EventBus.instance.reserveTrace();

    const contexts = [
      EffectExecutionContextV3.activeAbility({
        owner: attacker,
        caster: attacker,
        target: defender,
        ability: skill,
        trace,
      }),
      EffectExecutionContextV3.passiveAbility({
        owner: defender,
        caster: attacker,
        target: defender,
        ability: gongfa,
        trace,
      }),
      EffectExecutionContextV3.buff({
        owner: defender,
        caster: attacker,
        target: defender,
        buff,
        trace,
      }),
      EffectExecutionContextV3.system({
        owner: defender,
        caster: defender,
        target: defender,
        source: CombatSystemSourceV3.ACTION_FLOW,
        trace,
      }),
    ];

    expect(contexts.map((context) => context.origin.kind)).toEqual([
      'owned',
      'owned',
      'owned',
      'system',
    ]);
    expect(contexts[1].owner).toBe(defender);
    expect(contexts[1].caster).toBe(attacker);
    expect(contexts[2].origin).toEqual(contexts[1].origin);
  });

  it('rejects effect contexts outside an explicit causal trace', () => {
    const target = unit('target', '目标');
    expect(() =>
      EffectExecutionContextV3.system({
        owner: target,
        caster: target,
        target,
        source: CombatSystemSourceV3.ACTION_FLOW,
      }),
    ).toThrow(/requires an explicit trace/);
  });

  it('keeps defensive equipment facts owned by the defender in presentation', () => {
    const builder = new CombatRecordBuilderV3(EventBus.instance);
    const attacker = unit('attacker', '进攻者');
    const defender = unit('defender', '防守者');
    const origin = ownedOrigin(defender, {
      kind: 'equipment',
      id: 'armor:1',
      name: '玄黄不灭甲',
    });

    builder.runInSequence(
      { id: 'sequence:defense', phase: 'action', turn: 1, actor: attacker },
      () => {
        const trigger = EventBus.instance.publish({
          type: 'DefenseTriggerEvent',
          timestamp: Date.now(),
          origin,
        });
        new CombatResultEmitterV3().commit(
          defender,
          {
            type: 'mechanic',
            mechanic: 'death_guard',
            code: 'death_guard',
            name: '不灭金身',
          },
          { origin, parentTrace: trigger.trace! },
        );
      },
    );

    const sequence = builder.getSequences()[0];
    expect(sequence.facts[0].origin).toEqual(origin);
    const output = new CombatPresenterV3().format(sequence).join('\n');
    expect(output).toContain('「防守者」的「玄黄不灭甲」');
    expect(output).not.toContain('「进攻者」的「玄黄不灭甲」');
    builder.destroy();
  });

  it('keeps defensive passive resource facts owned by the defender', () => {
    const builder = new CombatRecordBuilderV3(EventBus.instance);
    const attacker = unit('attacker', '进攻者');
    const defender = unit('defender', '防守者');
    defender.combatResources.define({
      id: 'guard',
      name: '守势',
      initial: 0,
      max: 10,
    });
    const equipment = AbilityFactory.create({
      slug: 'resource-armor',
      name: '聚元甲',
      type: AbilityType.PASSIVE_SKILL,
      tags: [
        GameplayTags.ABILITY.KIND.ARTIFACT,
        GameplayTags.ABILITY.FUNCTION.BUFF,
      ],
      listeners: [],
    });

    builder.runInSequence(
      { id: 'sequence:resource-defense', phase: 'action', turn: 1 },
      () => {
        const trigger = EventBus.instance.publish({
          type: 'DefensiveResourceTriggerEvent',
          timestamp: Date.now(),
        });
        executeGameplayEffectV3(
          new CombatResourceModifyEffect({
            resourceId: 'guard',
            operation: 'add',
            amount: 2,
            target: 'target',
          }),
          EffectExecutionContextV3.passiveAbility({
            owner: defender,
            caster: attacker,
            target: defender,
            ability: equipment,
            trace: trigger.trace!,
          }),
        );
      },
    );

    expect(builder.getSequences()[0].facts).toEqual([
      expect.objectContaining({
        type: 'resource',
        target: { id: defender.id, name: defender.name },
        origin: expect.objectContaining({
          kind: 'owned',
          owner: { id: defender.id, name: defender.name },
          carrier: expect.objectContaining({
            kind: 'equipment',
            id: equipment.id,
          }),
        }),
      }),
    ]);
    builder.destroy();
  });

  it.each([
    [GameplayTags.ABILITY.KIND.ARTIFACT, 'equipment'],
    [GameplayTags.ABILITY.KIND.GONGFA, 'gongfa'],
  ] as const)(
    'keeps defensive %s delayed buff facts attributed to the defender',
    (abilityKind, carrierKind) => {
      const builder = new CombatRecordBuilderV3(EventBus.instance);
      const damageSystem = new DamageSystem();
      const attacker = unit('attacker', '进攻者');
      const defender = unit('defender', '防守者');
      const passive = AbilityFactory.create({
        slug: `defensive-${carrierKind}`,
        name: carrierKind === 'equipment' ? '玄黄甲' : '归藏诀',
        type: AbilityType.PASSIVE_SKILL,
        tags: [abilityKind, GameplayTags.ABILITY.FUNCTION.BUFF],
        listeners: [],
      });
      const attribution = CombatAttributionV3.fromAbility(defender, passive);

      builder.runInSequence(
        { id: `sequence:apply-${carrierKind}`, phase: 'action', turn: 1 },
        () => {
          const trigger = EventBus.instance.publish({
            type: 'DefensivePassiveTriggerEvent',
            timestamp: Date.now(),
            origin: attribution.origin,
          });
          executeGameplayEffectV3(
            new DelayedEffect({
              id: `delayed-${carrierKind}`,
              name: '延迟反应',
              delayTurns: 1,
              effects: [
                {
                  type: 'damage',
                  params: {
                    value: {
                      base: 10,
                      attribute: AttributeType.MAGIC_ATK,
                      coefficient: 0,
                    },
                    damageType: DamageType.TRUE,
                    damageSource: DamageSource.DELAYED,
                  },
                },
              ],
            }),
            EffectExecutionContextV3.passiveAbility({
              owner: defender,
              caster: attacker,
              target: defender,
              ability: passive,
              trace: trigger.trace,
            }),
          );
        },
      );
      builder.runInSequence(
        {
          id: `sequence:trigger-${carrierKind}`,
          phase: 'action_after',
          turn: 2,
        },
        () =>
          EventBus.instance.publish<ActionPostEvent>({
            type: 'ActionPostEvent',
            timestamp: Date.now(),
            caster: defender,
          }),
      );

      const damage = builder
        .getSequences()
        .flatMap((sequence) => sequence.facts)
        .find((entry) => entry.type === 'damage');
      expect(damage?.origin).toMatchObject({
        kind: 'owned',
        owner: { id: defender.id },
        carrier: { kind: carrierKind, id: passive.id },
      });

      damageSystem.destroy();
      builder.destroy();
    },
  );

  it('records damage before prevention, then exactly one final death', () => {
    const builder = new CombatRecordBuilderV3(EventBus.instance);
    const damageSystem = new DamageSystem();
    const attacker = unit('attacker', '破阵者');
    const defender = unit('defender', '持甲者');
    const artifact: AbilityConfig = {
      slug: 'immortal-armor',
      name: '玄黄不灭甲',
      type: AbilityType.PASSIVE_SKILL,
      tags: [
        GameplayTags.ABILITY.KIND.ARTIFACT,
        GameplayTags.ABILITY.FUNCTION.BUFF,
      ],
      listeners: [
        {
          eventType: GameplayTags.EVENT.DAMAGE_TAKEN,
          scope: GameplayTags.SCOPE.OWNER_AS_TARGET,
          priority: 50,
          guard: { requireOwnerAlive: false, allowLethalWindow: true },
          effects: [{ type: 'death_prevent', params: {} }],
        },
      ],
    };
    defender.abilities.addAbility(AbilityFactory.create(artifact));

    publishDamage(
      builder,
      'sequence:first-lethal',
      attacker,
      defender,
      1_000_000,
    );
    const firstFacts = builder.getSequences()[0].facts;
    expect(firstFacts.map((entry) => entry.type)).toEqual([
      'damage',
      'death_prevented',
    ]);
    expect(firstFacts[1].origin).toMatchObject({
      kind: 'owned',
      owner: { id: defender.id },
      carrier: { kind: 'equipment', id: 'immortal-armor' },
    });
    expect(firstFacts[0].trace.resolutionId).toBe(
      firstFacts[1].trace.resolutionId,
    );

    publishDamage(
      builder,
      'sequence:final-lethal',
      attacker,
      defender,
      1_000_000,
    );
    const allFacts = builder
      .getSequences()
      .flatMap((sequence) => sequence.facts);
    expect(allFacts.filter((entry) => entry.type === 'unit_died')).toHaveLength(
      1,
    );
    expect(allFacts.slice(-2).map((entry) => entry.type)).toEqual([
      'damage',
      'unit_died',
    ]);

    damageSystem.destroy();
    builder.destroy();
  });

  it('stops an active multi-effect chain when reflect kills its owner', () => {
    const builder = new CombatRecordBuilderV3(EventBus.instance);
    const damageSystem = new DamageSystem();
    const attacker = unit('attacker', '进攻者');
    const defender = unit('defender', '反击者');
    attacker.setHp(10);
    const skill = AbilityFactory.create({
      slug: 'two-hit-strike',
      name: '两段斩',
      type: AbilityType.ACTIVE_SKILL,
      tags: [
        GameplayTags.ABILITY.KIND.SKILL,
        GameplayTags.ABILITY.FUNCTION.DAMAGE,
        GameplayTags.ABILITY.CHANNEL.TRUE,
      ],
      effects: [
        {
          type: 'damage',
          params: {
            value: { base: 10, attribute: AttributeType.ATK, coefficient: 0 },
            damageType: DamageType.TRUE,
          },
        },
        {
          type: 'damage',
          params: {
            value: { base: 10, attribute: AttributeType.ATK, coefficient: 0 },
            damageType: DamageType.TRUE,
          },
        },
      ],
    });
    const reflectOrigin = ownedOrigin(defender, {
      kind: 'equipment',
      id: 'reflect-armor',
      name: '反震甲',
    });
    EventBus.instance.subscribe(
      'DamageTakenEvent',
      (event: CombatEvent & { caster?: Unit; target: Unit }) => {
        if (event.target !== defender || event.caster !== attacker) return;
        EventBus.instance.publish<DamageRequestEvent>({
          type: 'DamageRequestEvent',
          timestamp: Date.now(),
          caster: defender,
          target: attacker,
          damageSource: DamageSource.REFLECT,
          damageType: DamageType.TRUE,
          calculationMode: 'resolved_final',
          baseDamage: 100,
          finalDamage: 100,
          origin: reflectOrigin,
        });
      },
      1_000,
    );

    builder.runInSequence(
      {
        id: 'sequence:two-hit-reflect',
        phase: 'action',
        turn: 1,
        actor: attacker,
      },
      () => {
        const trigger = EventBus.instance.publish({
          type: 'TwoHitCastEvent',
          timestamp: Date.now(),
          origin: ownedOrigin(attacker, {
            kind: 'ability',
            id: skill.id,
            name: skill.name,
          }),
        });
        EventBus.instance.runInCausalContext(
          { origin: trigger.origin, trace: trigger.trace },
          () => skill.execute({ caster: attacker, target: defender }),
        );
      },
    );

    const facts = builder.getSequences()[0].facts;
    expect(attacker.isAlive()).toBe(false);
    expect(
      facts.filter(
        (entry) =>
          entry.type === 'damage' &&
          entry.origin.kind === 'owned' &&
          entry.origin.owner.id === attacker.id,
      ),
    ).toHaveLength(1);
    expect(facts.map((entry) => entry.type)).toEqual([
      'damage',
      'damage',
      'unit_died',
    ]);

    damageSystem.destroy();
    builder.destroy();
  });

  it('does not record death when a hit reaction restores hp from zero', () => {
    const builder = new CombatRecordBuilderV3(EventBus.instance);
    const damageSystem = new DamageSystem();
    const attacker = unit('attacker', '进攻者');
    const defender = unit('defender', '防守者');
    defender.setHp(10);
    const recoveryOrigin = ownedOrigin(defender, {
      kind: 'gongfa',
      id: 'recovery-art',
      name: '回生诀',
    });

    EventBus.instance.subscribe(
      'DamageTakenEvent',
      (event: CombatEvent & { target: Unit }) => {
        if (event.target !== defender || defender.getCurrentHp() > 0) return;
        const amount = defender.heal(25);
        new CombatResultEmitterV3().commit(
          defender,
          {
            type: 'recovery',
            resource: 'hp',
            amount,
            after: defender.getCurrentHp(),
          },
          { origin: recoveryOrigin, parentTrace: event.trace! },
        );
      },
      1_000,
    );

    publishDamage(builder, 'sequence:zero-recovery', attacker, defender, 100);
    const facts = builder.getSequences()[0].facts;
    expect(facts.map((entry) => entry.type)).toEqual(['damage', 'recovery']);
    expect(facts[0]).toMatchObject({ type: 'damage', afterHp: 25 });
    expect(facts[1].origin).toMatchObject({
      kind: 'owned',
      owner: { id: defender.id },
      carrier: { kind: 'gongfa', id: 'recovery-art' },
    });

    damageSystem.destroy();
    builder.destroy();
  });

  it('sorts facts by ordinal and groups only consecutive equal attribution', () => {
    const owner = { id: 'owner', name: '归属者' };
    const target = { id: 'target', name: '目标' };
    const origin: CombatOriginV3 = {
      kind: 'owned',
      owner,
      carrier: { kind: 'gongfa', id: 'gongfa', name: '归藏' },
    };
    const otherOrigin: CombatOriginV3 = {
      kind: 'owned',
      owner,
      carrier: { kind: 'buff', id: 'buff', name: '余韵' },
    };
    const mechanic = (
      id: string,
      ordinal: number,
      factOrigin: CombatOriginV3,
      name: string,
    ): CombatFactV3 => ({
      id,
      type: 'mechanic',
      trace: { eventId: id, sequenceId: 'sequence', ordinal },
      origin: factOrigin,
      target,
      mechanic: id,
      code: id,
      name,
    });
    const sequence: CombatSequenceV3 = {
      id: 'sequence',
      turn: 1,
      phase: 'action',
      facts: [
        mechanic('third', 3, otherOrigin, '第三'),
        mechanic('first', 1, origin, '第一'),
        mechanic('second', 2, origin, '第二'),
        mechanic('fourth', 4, origin, '第四'),
      ],
    };

    const lines = new CombatPresenterV3().format(sequence);
    expect(lines.join('\n')).toMatch(/第一[\s\S]*第二[\s\S]*第三[\s\S]*第四/);
    expect(lines.filter((line) => line.includes('「归藏」'))).toHaveLength(2);
  });

  it('renders action-state phases with domain text instead of internal values', () => {
    const sequence: CombatSequenceV3 = {
      id: 'sequence:action-state',
      turn: 1,
      phase: 'action',
      facts: [
        {
          id: 'action-state:1',
          type: 'action_state',
          trace: {
            eventId: 'action-state:1',
            sequenceId: 'sequence:action-state',
            ordinal: 1,
          },
          origin: {
            kind: 'system',
            carrier: { kind: 'system', id: 'action_flow', name: '行动流程' },
          },
          target: { id: 'owner', name: '归属者' },
          stateType: 'queued_action',
          phase: 'entered',
          name: '蓄势',
          remainingActions: 1,
        },
      ],
    };

    const output = new CombatPresenterV3().format(sequence).join('\n');
    expect(output).toContain('蓄势：进入');
    expect(output).not.toContain('entered');
  });

  it('initializes buffs without publishing combat facts or gameplay events', () => {
    const owner = unit('owner', '归属者');
    const buff = new Buff('initial-guard', '初始护体', BuffType.BUFF, -1);
    const observed: string[] = [];
    for (const eventType of [
      'BuffAddEvent',
      'BuffLayerChangedEvent',
      'BuffAppliedEvent',
      'CombatResultCommittedEventV3',
    ]) {
      EventBus.instance.subscribe(eventType, () => observed.push(eventType));
    }

    owner.buffs.initializeBuff(buff, owner);

    expect(observed).toEqual([]);
    expect(owner.buffs.getAllBuffs()).toContain(buff);
    expect(buff.getCombatAttributionV3()?.origin).toMatchObject({
      kind: 'owned',
      owner: { id: owner.id },
      carrier: { kind: 'buff', id: buff.id },
    });
  });

  it('renders committed mechanic and defense semantics without leaking internal ids', () => {
    const builder = new CombatRecordBuilderV3(EventBus.instance);
    const attacker = unit('attacker', '进攻者');
    const defender = unit('defender', '防守者');
    const ability = AbilityFactory.create({
      slug: 'transform-source',
      name: '化势诀',
      type: AbilityType.PASSIVE_SKILL,
      tags: [
        GameplayTags.ABILITY.KIND.GONGFA,
        GameplayTags.ABILITY.FUNCTION.BUFF,
      ],
      listeners: [],
    });

    builder.runInSequence(
      { id: 'sequence:presentation', phase: 'action', turn: 1 },
      () => {
        const trigger = EventBus.instance.publish({
          type: 'PresentationTriggerEvent',
          timestamp: Date.now(),
        });
        const context = EffectExecutionContextV3.passiveAbility({
          owner: defender,
          caster: attacker,
          target: defender,
          ability,
          trace: trigger.trace!,
        });
        executeGameplayEffectV3(
          new AbilityTransformEffect({
            id: 'internal_transform_rule',
            triggers: 1,
          }),
          context,
        );
        context.commit(defender, {
          type: 'defense',
          defense: 'mana_shield',
          amount: 12,
          detail: '消耗12点法力',
        });
      },
    );

    const output = new CombatPresenterV3()
      .format(builder.getSequences()[0])
      .join('\n');
    expect(output).toContain('能力强化');
    expect(output).not.toContain('internal_transform_rule');
    expect(output).toContain('数值：1');
    expect(output).toContain('法力护盾');
    expect(output).toContain('12');
    expect(output).toContain('消耗12点法力');
    builder.destroy();
  });

  it('does not commit a status spread fact when the 1v1 battle has no spread target', () => {
    const builder = new CombatRecordBuilderV3(EventBus.instance);
    const attacker = unit('attacker', '进攻者');
    const defender = unit('defender', '防守者');
    const ability = AbilityFactory.create({
      slug: 'spread-source',
      name: '扩散诀',
      type: AbilityType.ACTIVE_SKILL,
      tags: [
        GameplayTags.ABILITY.KIND.SKILL,
        GameplayTags.ABILITY.FUNCTION.BUFF,
      ],
      effects: [],
    });

    builder.runInSequence(
      { id: 'sequence:no-spread-target', phase: 'action', turn: 1 },
      () => {
        const trigger = EventBus.instance.publish({
          type: 'SpreadTriggerEvent',
          timestamp: Date.now(),
        });
        executeGameplayEffectV3(
          new StatusSpreadEffect({ match: {} }),
          EffectExecutionContextV3.activeAbility({
            owner: attacker,
            caster: attacker,
            target: defender,
            ability,
            trace: trigger.trace!,
          }),
        );
      },
    );

    expect(builder.getSequences()[0].facts).toEqual([]);
    builder.destroy();
  });

  it('dispatches committed results as immutable events', () => {
    const builder = new CombatRecordBuilderV3(EventBus.instance);
    const target = unit('target', '目标');
    const origin = ownedOrigin(target, {
      kind: 'mechanic',
      id: 'immutable-result',
      name: '不可变结果',
    });
    let observed = false;
    EventBus.instance.subscribe<
      import('./events').CombatResultCommittedEventV3
    >(
      'CombatResultCommittedEventV3',
      (event) => {
        observed = true;
        expect(Object.isFrozen(event)).toBe(true);
        expect(Object.isFrozen(event.trace)).toBe(true);
        expect(Object.isFrozen(event.origin)).toBe(true);
        expect(Object.isFrozen(event.result)).toBe(true);
      },
      2_000,
    );

    builder.runInSequence(
      { id: 'sequence:immutable', phase: 'action', turn: 1 },
      () => {
        const trigger = EventBus.instance.publish({
          type: 'ImmutableTriggerEvent',
          timestamp: Date.now(),
        });
        new CombatResultEmitterV3().commit(
          target,
          {
            type: 'mechanic',
            mechanic: 'immutable_result',
            code: 'immutable_result',
            name: '不可变结果',
          },
          { origin, parentTrace: trigger.trace! },
        );
      },
    );

    expect(observed).toBe(true);
    const fact = builder.getSequences()[0].facts[0];
    expect(Object.isFrozen(fact)).toBe(true);
    expect(Object.isFrozen(fact.target)).toBe(true);
    builder.destroy();
  });

  it('rejects missing result scope and invalid record invariants', () => {
    const target = unit('target', '目标');
    expect(() =>
      new CombatResultEmitterV3().commit(
        target,
        {
          type: 'mechanic',
          mechanic: 'invalid',
          code: 'invalid',
          name: '无来源',
        },
        undefined as unknown as CombatResultScopeV3,
      ),
    ).toThrow(/has no origin/);

    expect(() =>
      validateBattleRecordV3(
        recordWithFacts([
          {
            ...fact('mechanic', 1, 'death_prevented'),
            type: 'mechanic',
            mechanic: '',
            code: '',
            name: '',
          },
        ]),
      ),
    ).toThrow(/mechanic fact .* incomplete/);

    expect(() =>
      validateBattleRecordV3(
        recordWithFacts([fact('death:1', 1), fact('death:2', 2)]),
      ),
    ).toThrow(/duplicate death/);
    expect(() =>
      validateBattleRecordV3(
        recordWithFacts([
          fact('prevented', 1, 'death_prevented'),
          fact('death', 2),
        ]),
      ),
    ).toThrow(/both death prevention and death/);

    const duplicateOrdinal = recordWithFacts([
      fact('death', 1),
      {
        ...fact('mechanic', 1, 'death_prevented', 'resolution:2'),
        type: 'death_prevented',
      },
    ]);
    expect(() => validateBattleRecordV3(duplicateOrdinal)).toThrow(
      /duplicate ordinal|not monotonic/,
    );

    const orphan = recordWithFacts([]);
    orphan.stateTimeline.frames[0].sourceSequenceId = 'sequence:missing';
    expect(() => validateBattleRecordV3(orphan)).toThrow(/unknown sequence/);

    const inconsistent = recordWithFacts([]);
    inconsistent.finalSnapshots.loser = snapshot('loser', '败者', false);
    expect(() => new BattleRecordValidatorV3(inconsistent).validate()).toThrow(
      /final snapshots/,
    );

    const invalidResource = recordWithFacts([
      {
        ...fact('resource', 1, 'death_prevented'),
        type: 'resource',
        resourceId: 'guard',
        resourceName: '守势',
        before: 1,
        after: 3,
        applied: 1,
      },
    ]);
    expect(() => validateBattleRecordV3(invalidResource)).toThrow(
      /inconsistent applied value/,
    );

    expect(() =>
      validateBattleRecordV3(recordWithFacts([fact('orphan-death', 1)])),
    ).toThrow(/has no matching damage/);
    expect(() =>
      validateBattleRecordV3(
        recordWithFacts([fact('orphan-prevention', 1, 'death_prevented')]),
      ),
    ).toThrow(/has no matching damage/);

    expect(() =>
      validateBattleRecordV3(
        recordWithFacts([damageFact('damage:1', 1), damageFact('damage:2', 2)]),
      ),
    ).toThrow(/duplicate damage facts/);

    expect(() =>
      validateBattleRecordV3(
        recordWithFacts([
          damageFact('damage:target', 1),
          {
            ...fact('prevention:other-target', 2, 'death_prevented'),
            target: { id: 'winner', name: '胜者' },
          },
        ]),
      ),
    ).toThrow(/does not match damage target/);

    const invalidActionState = recordWithFacts([
      {
        ...damageFact('damage:valid', 1),
        type: 'action_state',
        stateType: 'internal_state' as 'rest',
        phase: 'internal_phase' as 'entered',
        name: '',
        remainingActions: 1,
      },
    ]);
    expect(() => validateBattleRecordV3(invalidActionState)).toThrow(
      /invalid action state/,
    );
  });

  it('rejects a dead unit entering a later action sequence', () => {
    const record = recordWithFacts([damageFact('damage', 1), fact('death', 2)]);
    record.sequences.splice(1, 0, {
      id: 'sequence:illegal-action',
      turn: 1,
      phase: 'action',
      actor: { id: 'loser', name: '败者' },
      facts: [],
    });
    expect(() => validateBattleRecordV3(record)).toThrow(/dead unit/);
  });

  it('rejects owned facts committed after the owner dies in the same sequence', () => {
    const record = recordWithFacts([
      damageFact('damage', 1),
      fact('death', 2),
      {
        ...damageFact('post-death-damage', 3, 'resolution:2'),
        origin: {
          kind: 'owned',
          owner: { id: 'loser', name: '败者' },
          carrier: { kind: 'ability', id: 'late-hit', name: '迟来的攻击' },
        },
        target: { id: 'winner', name: '胜者' },
        beforeHp: 2,
        afterHp: 1,
      },
    ]);

    expect(() => validateBattleRecordV3(record)).toThrow(
      /dead unit .* commits owned fact/,
    );
  });

  it('validates a complete deterministic battle against its final timeline', () => {
    const player = unit('player', '玩家', 600);
    const opponent = unit('opponent', '对手', 10);
    const engine = new BattleEngineV5(player, opponent);
    const result = withBattleRandomSource(
      new SeededBattleRandomSource('combat-v3'),
      () => engine.execute(),
    );
    const record: BattleRecordV3 = {
      participants: {
        player: { id: player.id, name: player.name },
        opponent: { id: opponent.id, name: opponent.name },
      },
      outcome: {
        winner: {
          id: result.winner,
          name: result.winner === player.id ? player.name : opponent.name,
        },
        loser: {
          id: result.loser,
          name: result.loser === player.id ? player.name : opponent.name,
        },
        turns: result.turns,
      },
      sequences: result.sequences,
      stateTimeline: result.stateTimeline,
      finalSnapshots: {
        winner: result.winnerSnapshot,
        loser: result.loserSnapshot,
      },
    };

    expect(() => validateBattleRecordV3(record)).not.toThrow();
    expect(record.finalSnapshots.loser.alive).toBe(false);
    engine.destroy();
  });
});

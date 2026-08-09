import { GameplayTags } from '@shared/engine/shared/tag-domain';
import { describe, expect, it } from 'vitest';
import { BattleRoster } from '../core/BattleRoster';
import { SeededBattleRandomSource } from '../core/BattleRandom';
import { setQueuedAction } from '../core/runtimeState';
import { AbilityType, AttributeType, DamageType } from '../core/types';
import { AbilityFactory } from '../factories/AbilityFactory';
import { restoreBattleSave } from '../persistence/BattleStateCodec';
import { BattleRuntime } from '../runtime/BattleRuntime';
import { Unit } from '../units/Unit';
import { resolveBattleToCompletion } from './BattleAutoResolver';

function createDuel(seed = 'auto-duel') {
  const runtime = new BattleRuntime({
    random: new SeededBattleRandomSource(seed),
  });
  const attacker = new Unit(
    'attacker',
    '攻击者',
    {
      [AttributeType.VITALITY]: 20,
      [AttributeType.STRENGTH]: 40,
      [AttributeType.SPEED]: 30,
    },
    { runtime, teamId: 'alpha', slot: 0 },
  );
  const defender = new Unit(
    'defender',
    '防守者',
    { [AttributeType.VITALITY]: 20 },
    { runtime, teamId: 'beta', slot: 0 },
  );
  attacker.abilities.addAbility(AbilityFactory.create({
    slug: 'auto-strike',
    name: '自动斩击',
    type: AbilityType.ACTIVE_SKILL,
    priority: 100,
    cooldown: 1,
    targetPolicy: { team: 'enemy', scope: 'single' },
    tags: [
      GameplayTags.ABILITY.KIND.SKILL,
      GameplayTags.ABILITY.FUNCTION.DAMAGE,
      GameplayTags.ABILITY.CHANNEL.TRUE,
    ],
    effects: [{
      type: 'damage',
      params: {
        value: { base: 180, coefficient: 0 },
        damageType: DamageType.TRUE,
        canCrit: false,
      },
    }],
  }));
  return { runtime, attacker, defender };
}

describe('BattleAutoResolver', () => {
  it('uses the Team/Roster round resolver until a duel ends', () => {
    const { runtime, attacker, defender } = createDuel();
    const result = resolveBattleToCompletion({
      battleId: 'auto-duel',
      roster: BattleRoster.fromDuel(attacker, defender),
      runtime,
    });

    expect(result.outcome.winnerTeamId).toBe('alpha');
    expect(result.rounds).toBeGreaterThan(0);
    expect(result.sequences[0].phase).toBe('battle_init');
    expect(result.sequences.at(-1)?.phase).toBe('battle_end');
    expect(result.stateTimeline.frames[0].phase).toBe('battle_init');
    expect(result.stateTimeline.frames.at(-1)?.phase).toBe('battle_end');
    expect(
      result.sequences.some((sequence) =>
        sequence.facts.some(
          (fact) =>
            fact.type === 'damage' &&
            fact.origin.kind === 'owned' &&
            fact.origin.carrier.id === 'auto-strike',
        ),
      ),
    ).toBe(true);
  });

  it('is deterministic for the same initial roster and seed', () => {
    const left = createDuel('same-seed');
    const right = createDuel('same-seed');
    const resolve = (duel: ReturnType<typeof createDuel>) =>
      resolveBattleToCompletion({
        battleId: 'deterministic-auto-duel',
        roster: BattleRoster.fromDuel(duel.attacker, duel.defender),
        runtime: duel.runtime,
      });

    expect(resolve(left)).toEqual(resolve(right));
  });

  it('forces a queued release through a basic-attack target intent', () => {
    const { runtime, attacker, defender } = createDuel('queued-auto');
    setQueuedAction(attacker, {
      slug: 'queued-release',
      name: '后发一击',
      type: AbilityType.ACTIVE_SKILL,
      targetPolicy: { team: 'enemy', scope: 'single' },
      tags: [
        GameplayTags.ABILITY.KIND.SKILL,
        GameplayTags.ABILITY.FUNCTION.DAMAGE,
        GameplayTags.ABILITY.CHANNEL.TRUE,
      ],
      effects: [{
        type: 'damage',
        params: {
          value: { base: 500, coefficient: 0 },
          damageType: DamageType.TRUE,
          canCrit: false,
        },
      }],
    }, { interruptPolicy: 'uninterruptible', hitPolicy: 'guaranteed' });
    const result = resolveBattleToCompletion({
      battleId: 'queued-auto-duel',
      roster: BattleRoster.fromDuel(attacker, defender),
      runtime,
    });
    const final = restoreBattleSave(result.finalSave);

    expect(
      result.sequences.some((sequence) =>
        sequence.facts.some(
          (fact) =>
            fact.type === 'damage' &&
            fact.origin.kind === 'owned' &&
            fact.origin.carrier.id === 'queued-release',
        ),
      ),
    ).toBe(true);
    expect(final.roster.getUnit(attacker.id).isAlive()).toBe(true);
    final.runtime.dispose();
  });
});

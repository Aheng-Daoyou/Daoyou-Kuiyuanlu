import { GameplayTags } from '@shared/engine/shared/tag-domain';
import { ActiveSkill } from '../abilities/ActiveSkill';
import type { TargetPolicy } from '../abilities/TargetPolicy';
import { executeEffectConfigs } from '../core/effectExecutor';
import {
  ActionPostEvent,
  ActionPreEvent,
  ActionStateEvent,
  ControlledSkipEvent,
  RoundPostEvent,
  RoundPreEvent,
  RoundStartEvent,
  SkillPreCastEvent,
  TurnOrderEvent,
  VictoryCheckEvent,
} from '../core/events';
import {
  beginRuntimeAction,
  clearPendingActionStates,
  consumeQueuedAction,
  consumeSkippedAction,
  peekQueuedAction,
  setRuntimeRound,
  shouldTickBuffDuration,
} from '../core/runtimeState';
import { EffectExecutionContextV3 } from '../effects/Effect';
import { AbilityFactory } from '../factories/AbilityFactory';
import {
  captureBattleCheckpoint,
  restoreBattleSave,
} from '../persistence/BattleStateCodec';
import type { BattleSaveV1 } from '../persistence/types';
import { ActionExecutionSystem } from '../systems/ActionExecutionSystem';
import { DamageSystem } from '../systems/DamageSystem';
import { InitiativeSystem } from '../systems/InitiativeSystem';
import { BattleStateRecorder } from '../systems/state/BattleStateRecorder';
import { TargetSelectionSystem } from '../systems/TargetSelectionSystem';
import { TeamVictorySystem } from '../systems/TeamVictorySystem';
import type { Unit } from '../units/Unit';
import { toBattleStateTimelineV3 } from '../v3/BattleRecordV3';
import { CombatSystemSourceV3 } from '../v3/origin';
import { createBattlePlanningView } from './BattlePlanningView';
import { BattleResolutionContext } from './BattleResolutionContext';
import type {
  BattleActionIntentV1,
  BattleRoundResolutionV1,
  RoundCommandSetV1,
} from './types';

export function sealRoundCommandSet(
  save: BattleSaveV1,
  commandSet: RoundCommandSetV1,
): Readonly<RoundCommandSetV1> {
  const restored = restoreBattleSave(save);
  try {
    const livingUnits = restored.roster.getLivingUnits();
    validateRoundCommandSet(save, livingUnits, commandSet);
    validateAllIntents(restored.roster.getAllUnits(), livingUnits, commandSet);
    return deepFreeze(
      JSON.parse(JSON.stringify(commandSet)) as RoundCommandSetV1,
    );
  } finally {
    restored.runtime.dispose();
  }
}

export function resolveBattleRound(
  save: BattleSaveV1,
  commandSet: RoundCommandSetV1,
): BattleRoundResolutionV1 {
  const restored = restoreBattleSave(save);
  try {
    return resolveRestoredBattleRound(save, commandSet, restored);
  } finally {
    restored.runtime.dispose();
  }
}

function resolveRestoredBattleRound(
  save: BattleSaveV1,
  commandSet: RoundCommandSetV1,
  restored: ReturnType<typeof restoreBattleSave>,
): BattleRoundResolutionV1 {
  const { runtime, roster } = restored;
  const livingAtPlanning = roster.getLivingUnits();
  validateRoundCommandSet(save, livingAtPlanning, commandSet);
  validateAllIntents(roster.getAllUnits(), livingAtPlanning, commandSet);

  const eventBus = runtime.events;
  const resolutionContext = new BattleResolutionContext(runtime);
  const actionSystem = new ActionExecutionSystem(eventBus);
  const damageSystem = new DamageSystem(eventBus, runtime.random);
  try {
    const stateRecorder = new BattleStateRecorder();
    const targetSystem = new TargetSelectionSystem();
    const allUnits = roster.getAllUnits();
    const round = commandSet.round;
    for (const unit of allUnits) setRuntimeRound(unit, round);

    let order: Unit[] = [];
    resolutionContext.runFrame({ phase: 'round_start', turn: round }, () => {
      eventBus.publish<RoundStartEvent>({
        type: 'RoundStartEvent',
        timestamp: runtime.clock.now(),
        turn: round,
      });
      eventBus.publish<RoundPreEvent>({
        type: 'RoundPreEvent',
        timestamp: runtime.clock.now(),
        turn: round,
      });
      order = InitiativeSystem.order(roster.getLivingUnits(), runtime.random);
      eventBus.publish<TurnOrderEvent>({
        type: 'TurnOrderEvent',
        timestamp: runtime.clock.now(),
        turn: round,
        units: order,
      });
    });

    for (const actor of order) {
      if (!actor.isAlive()) {
        clearPendingActionStates(actor);
        continue;
      }
      beginRuntimeAction(actor);
      resolutionContext.runFrame(
        {
          phase: 'action_pre',
          turn: round,
          actor: { id: actor.id, name: actor.name },
        },
        (sequence) => {
          eventBus.publish<ActionPreEvent>({
            type: 'ActionPreEvent',
            timestamp: runtime.clock.now(),
            caster: actor,
          });
          stateRecorder.record(
            'action_pre',
            round,
            allUnits,
            actor.id,
            sequence.id,
          );
        },
      );

      let controlledSkip = false;
      resolutionContext.runFrame(
        {
          phase: 'action',
          turn: round,
          actor: { id: actor.id, name: actor.name },
        },
        () => {
          if (!actor.isAlive()) return;
          actor.combatResources.beginAction();
          const skipState = consumeSkippedAction(actor);
          const controlTag = getSkipControlTag(actor);
          controlledSkip = Boolean(controlTag);
          if (skipState || controlTag) {
            if (controlTag) {
              eventBus.publish<ControlledSkipEvent>({
                type: 'ControlledSkipEvent',
                timestamp: runtime.clock.now(),
                unit: actor,
                controlTag,
              });
            }
            return;
          }
          executePlannedAction(
            actor,
            commandSet.intents[actor.id],
            allUnits,
            targetSystem,
          );
        },
      );

      resolutionContext.runFrame(
        {
          phase: 'action_after',
          turn: round,
          actor: { id: actor.id, name: actor.name },
        },
        (sequence) => {
          if (actor.isAlive()) {
            eventBus.publish<ActionPostEvent>({
              type: 'ActionPostEvent',
              timestamp: runtime.clock.now(),
              caster: actor,
            });
            actor.combatResources.finishAction(
              controlledSkip,
              actor.getCurrentShield() > 0,
            );
            processBuffDurations(actor);
            actor.abilities.tickAbilitiesCooldown();
          }
          stateRecorder.record(
            'action_post',
            round,
            allUnits,
            actor.id,
            sequence.id,
          );
        },
      );
    }

    let outcome!: ReturnType<typeof TeamVictorySystem.check>;
    resolutionContext.runFrame({ phase: 'round_post', turn: round }, () => {
      eventBus.publish<RoundPostEvent>({
        type: 'RoundPostEvent',
        timestamp: runtime.clock.now(),
        turn: round,
      });
      outcome = TeamVictorySystem.check(roster, round);
      eventBus.publish<VictoryCheckEvent>({
        type: 'VictoryCheckEvent',
        timestamp: runtime.clock.now(),
        turn: round,
        battleEnded: outcome.battleEnded,
        winner: outcome.winnerTeamId ?? null,
      });
    });

    const sequences = resolutionContext.getSequences();
    const stateTimeline = toBattleStateTimelineV3(
      stateRecorder.getTimeline(allUnits),
    );
    const checkpoint = captureBattleCheckpoint({
      blueprint: save.blueprint,
      roster,
      runtime,
      round,
      checkpointRevision: commandSet.checkpointRevision + 1,
    });
    const nextSave: BattleSaveV1 = {
      version: 'battle_save_v1',
      blueprint: save.blueprint,
      checkpoint,
    };
    const nextPlanningView = outcome.battleEnded
      ? undefined
      : createBattlePlanningView({
          roster,
          round: round + 1,
          checkpointRevision: checkpoint.checkpointRevision,
        });
    return {
      version: 'battle_round_resolution_v1',
      commandSetId: commandSet.commandSetId,
      round,
      outcome,
      sequences,
      stateTimeline,
      checkpoint,
      save: nextSave,
      nextPlanningView,
    };
  } finally {
    actionSystem.destroy();
    damageSystem.destroy();
    resolutionContext.destroy();
  }
}

function executePlannedAction(
  actor: Unit,
  intent: BattleActionIntentV1,
  allUnits: Unit[],
  targetSystem: TargetSelectionSystem,
): void {
  const queued = consumeQueuedAction(actor);
  if (queued) {
    if (
      queued.interruptPolicy !== 'uninterruptible' &&
      actor.tags.hasTag(GameplayTags.STATUS.CONTROL.NO_SKILL)
    ) {
      cancelQueuedAction(actor, queued);
      return;
    }
    const ability = AbilityFactory.create(queued.ability);
    if (!(ability instanceof ActiveSkill)) {
      throw new Error(
        `Queued action ${queued.ability.slug} is not an active skill`,
      );
    }
    const targets = resolveTargets(
      actor,
      ability.targetPolicy,
      intent.targetUnitId,
      allUnits,
      targetSystem,
      true,
    );
    const primary = targets[0];
    if (!primary) return;
    castAbility(actor, ability, primary, targets, {
      interruptPolicy: queued.interruptPolicy,
      hitPolicy: queued.hitPolicy,
      queuedActionState: {
        name: '蓄势',
        sourceAbility: queued.sourceAbility,
      },
    });
    return;
  }
  if (intent.kind === 'basic_attack') {
    if (actor.tags.hasTag(GameplayTags.STATUS.CONTROL.NO_BASIC)) return;
    const basicAttack = actor.abilities.getDefaultAttack();
    if (!(basicAttack instanceof ActiveSkill)) return;
    const targets = resolveTargets(
      actor,
      basicAttack.targetPolicy,
      intent.targetUnitId,
      allUnits,
      targetSystem,
      true,
    );
    const primary = targets[0];
    if (!primary || !basicAttack.canTrigger({ caster: actor, target: primary }))
      return;
    castAbility(actor, basicAttack, primary, targets);
    return;
  }
  const ability = actor.abilities.getAbility(intent.abilityId);
  if (!(ability instanceof ActiveSkill)) {
    throw new Error(`Unit ${actor.id} cannot use ability ${intent.abilityId}`);
  }
  if (actor.tags.hasTag(GameplayTags.STATUS.CONTROL.NO_SKILL)) return;
  const targets = resolveTargets(
    actor,
    ability.targetPolicy,
    intent.targetUnitId,
    allUnits,
    targetSystem,
    true,
  );
  const primary = targets[0];
  if (!primary || !ability.canTrigger({ caster: actor, target: primary })) {
    return;
  }
  castAbility(actor, ability, primary, targets);
}

function castAbility(
  actor: Unit,
  ability: ActiveSkill,
  primary: Unit,
  targets: Unit[],
  options: {
    interruptPolicy?: 'normal' | 'uninterruptible';
    hitPolicy?: 'normal' | 'guaranteed';
    queuedActionState?: {
      name: string;
      sourceAbility?: { id: string; name: string };
    };
  } = {},
): void {
  ability.prepareCast({ caster: actor, target: primary });
  actor.runtime.events.publish<SkillPreCastEvent>({
    type: 'SkillPreCastEvent',
    timestamp: actor.runtime.clock.now(),
    caster: actor,
    target: primary,
    targets,
    ability,
    isInterrupted: false,
    interruptPolicy: options.interruptPolicy,
    hitPolicy: options.hitPolicy ?? ability.hitPolicy,
    queuedActionState: options.queuedActionState,
  });
}

function cancelQueuedAction(
  actor: Unit,
  queued: NonNullable<ReturnType<typeof consumeQueuedAction>>,
): void {
  const context = EffectExecutionContextV3.system({
    owner: actor,
    caster: actor,
    target: actor,
    source: CombatSystemSourceV3.ACTION_FLOW,
    trace: actor.runtime.events.reserveTrace(),
  });
  executeEffectConfigs(queued.cancelEffects, context);
  context.commit(actor, {
    type: 'action_state',
    stateType: 'queued_action',
    phase: 'cancelled',
    name: '蓄势',
    remainingActions: 0,
    ability: { id: queued.ability.slug, name: queued.ability.name },
  });
  context.emit<ActionStateEvent>({
    type: 'ActionStateEvent',
    timestamp: actor.runtime.clock.now(),
    unit: actor,
    stateType: 'queued_action',
    phase: 'cancelled',
    name: '蓄势',
    remainingActions: 0,
    sourceAbility: queued.sourceAbility,
    ability: { id: queued.ability.slug, name: queued.ability.name },
    reason: GameplayTags.STATUS.CONTROL.NO_SKILL,
  });
}

function resolveTargets(
  actor: Unit,
  policy: TargetPolicy,
  targetUnitId: string | undefined,
  allUnits: Unit[],
  targetSystem: TargetSelectionSystem,
  retargetMissing = false,
): Unit[] {
  const candidates = targetSystem.getTargetCandidates(actor, policy, allUnits);
  if (policy.scope === 'single') {
    if (targetUnitId) {
      const target = candidates.find(
        (candidate) => candidate.id === targetUnitId,
      );
      if (!target) {
        if (retargetMissing) return candidates.slice(0, 1);
        throw new Error(`Illegal target ${targetUnitId} for unit ${actor.id}`);
      }
      return [target];
    }
    if (policy.team !== 'self') {
      throw new Error(`Ability target is required for unit ${actor.id}`);
    }
  }
  return targetSystem.selectTargets(actor, policy, allUnits);
}

function validateAllIntents(
  allUnits: Unit[],
  livingUnits: Unit[],
  commandSet: RoundCommandSetV1,
): void {
  const targetSystem = new TargetSelectionSystem();
  for (const actor of livingUnits) {
    const intent = commandSet.intents[actor.id];
    const queued = peekQueuedAction(actor);
    if (queued) {
      const ability = AbilityFactory.create(queued.ability);
      if (!(ability instanceof ActiveSkill) || intent.kind !== 'basic_attack') {
        throw new Error(
          `Unit ${actor.id} must select a target for its queued action`,
        );
      }
      const candidates = targetSystem.getTargetCandidates(
        actor,
        ability.targetPolicy,
        allUnits,
      );
      if (
        !candidates.some((candidate) => candidate.id === intent.targetUnitId)
      ) {
        throw new Error(
          `Queued action target is not legal for unit ${actor.id}`,
        );
      }
      continue;
    }
    if (intent.kind === 'basic_attack') {
      const ability = actor.abilities.getDefaultAttack();
      if (!(ability instanceof ActiveSkill)) {
        throw new Error(`Unit ${actor.id} has no basic attack`);
      }
      const candidates = targetSystem.getTargetCandidates(
        actor,
        ability.targetPolicy,
        allUnits,
      );
      const target = candidates.find(
        (candidate) => candidate.id === intent.targetUnitId,
      );
      if (!target || !ability.canTrigger({ caster: actor, target })) {
        throw new Error(`Basic attack is not legal for unit ${actor.id}`);
      }
      continue;
    }
    const ability = actor.abilities.getAbility(intent.abilityId);
    if (!(ability instanceof ActiveSkill)) {
      throw new Error(
        `Unit ${actor.id} cannot use ability ${intent.abilityId}`,
      );
    }
    const candidates = targetSystem.getTargetCandidates(
      actor,
      ability.targetPolicy,
      allUnits,
    );
    const target = intent.targetUnitId
      ? candidates.find((candidate) => candidate.id === intent.targetUnitId)
      : candidates[0];
    if (
      ability.targetPolicy.scope === 'single' &&
      ability.targetPolicy.team !== 'self' &&
      !intent.targetUnitId
    ) {
      throw new Error(`Ability target is required for unit ${actor.id}`);
    }
    if (
      !target ||
      (intent.targetUnitId && !candidates.includes(target)) ||
      !ability.canTrigger({ caster: actor, target })
    ) {
      throw new Error(
        `Ability ${ability.id} is not legal for unit ${actor.id}`,
      );
    }
  }
}

function validateRoundCommandSet(
  save: BattleSaveV1,
  livingUnits: Unit[],
  commandSet: RoundCommandSetV1,
): void {
  if (
    !commandSet ||
    commandSet.version !== 'round_command_set_v1' ||
    !commandSet.commandSetId ||
    commandSet.round !== save.checkpoint.round + 1 ||
    commandSet.checkpointRevision !== save.checkpoint.checkpointRevision
  ) {
    throw new Error('Round command set does not match the checkpoint');
  }
  const expected = new Set(livingUnits.map((unit) => unit.id));
  const actual = Object.keys(commandSet.intents);
  if (
    actual.length !== expected.size ||
    actual.some((unitId) => !expected.has(unitId))
  ) {
    throw new Error(
      'Round command set must contain every living unit exactly once',
    );
  }
  for (const intent of Object.values(commandSet.intents)) {
    if (
      !intent ||
      (intent.kind !== 'ability' && intent.kind !== 'basic_attack') ||
      (intent.submittedBy !== 'player' && intent.submittedBy !== 'timeout')
    ) {
      throw new Error('Round command set contains an invalid intent');
    }
  }
}

function processBuffDurations(unit: Unit): void {
  for (const buff of unit.buffs.getAllBuffs()) {
    if (!unit.isAlive()) break;
    if (!shouldTickBuffDuration(unit, buff)) continue;
    buff.tickDuration();
    if (buff.isExpired()) {
      unit.buffs.removeBuffExpired(buff.id, {
        trace: unit.runtime.events.reserveTrace(),
      });
    }
  }
}

function getSkipControlTag(unit: Unit): string | null {
  if (unit.tags.hasTag(GameplayTags.STATUS.CONTROL.STUNNED)) {
    return GameplayTags.STATUS.CONTROL.STUNNED;
  }
  if (unit.tags.hasTag(GameplayTags.STATUS.CONTROL.NO_ACTION)) {
    return GameplayTags.STATUS.CONTROL.NO_ACTION;
  }
  return null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

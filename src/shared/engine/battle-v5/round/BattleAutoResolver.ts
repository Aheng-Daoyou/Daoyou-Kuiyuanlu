import { GameplayTags } from '@shared/engine/shared/tag-domain';
import type { AbilitySelectionStrategy } from '../abilities/AbilitySelectionStrategy';
import { ActiveSkill } from '../abilities/ActiveSkill';
import { AbilityFactory } from '../factories/AbilityFactory';
import { BattleRoster } from '../core/BattleRoster';
import { peekQueuedAction } from '../core/runtimeState';
import type { TeamId } from '../core/types';
import {
  captureBattleCheckpoint,
  createBattleBlueprint,
  restoreBattleSave,
} from '../persistence/BattleStateCodec';
import type { BattleSaveV1 } from '../persistence/types';
import type { BattleRuntime } from '../runtime/BattleRuntime';
import { BattleStateRecorder } from '../systems/state/BattleStateRecorder';
import type { UnitStateSnapshot } from '../systems/state/types';
import { TargetSelectionSystem } from '../systems/TargetSelectionSystem';
import type { TeamVictoryResult } from '../systems/TeamVictorySystem';
import type { Unit } from '../units/Unit';
import type {
  BattleStateFrameV3,
  BattleStateTimelineV3,
  CombatSequenceV3,
} from '../v3/types';
import { BattleResolutionContext } from './BattleResolutionContext';
import { resolveBattleRound, sealRoundCommandSet } from './BattleRoundResolver';
import type {
  BattleActionIntentV1,
  RoundCommandSetV1,
} from './types';

export interface AutomaticBattleResolutionV1 {
  readonly outcome: TeamVictoryResult;
  readonly rounds: number;
  readonly sequences: CombatSequenceV3[];
  readonly stateTimeline: BattleStateTimelineV3;
  readonly finalSnapshots: Readonly<Record<string, UnitStateSnapshot>>;
  readonly finalSave: BattleSaveV1;
}

export interface AutomaticDuelResolutionV1 {
  readonly winner: string;
  readonly loser: string;
  readonly turns: number;
  readonly sequences: CombatSequenceV3[];
  readonly stateTimeline: BattleStateTimelineV3;
  readonly winnerSnapshot: UnitStateSnapshot;
  readonly loserSnapshot: UnitStateSnapshot;
  readonly finalSave: BattleSaveV1;
}

export function resolveDuelToCompletion(input: {
  battleId: string;
  player: Unit;
  opponent: Unit;
  runtime: BattleRuntime;
}): AutomaticDuelResolutionV1 {
  if (input.player.teamId === input.opponent.teamId) {
    throw new Error('Duel units must belong to different teams');
  }
  const result = resolveBattleToCompletion({
    battleId: input.battleId,
    roster: BattleRoster.fromDuel(input.player, input.opponent),
    runtime: input.runtime,
  });
  const winner = result.outcome.winnerTeamId === input.opponent.teamId
    ? input.opponent
    : input.player;
  const loser = winner === input.player ? input.opponent : input.player;
  const winnerSnapshot = result.finalSnapshots[winner.id];
  const loserSnapshot = result.finalSnapshots[loser.id];
  if (!winnerSnapshot || !loserSnapshot) {
    throw new Error('Battle final state is missing a duel participant');
  }
  return {
    winner: winner.id,
    loser: loser.id,
    turns: result.rounds,
    sequences: result.sequences,
    stateTimeline: result.stateTimeline,
    winnerSnapshot,
    loserSnapshot,
    finalSave: result.finalSave,
  };
}

/**
 * Resolves a complete deterministic battle by repeatedly feeding automatic
 * intents into the same single-round resolver used by realtime matches.
 */
export function resolveBattleToCompletion(input: {
  battleId: string;
  roster: BattleRoster;
  runtime: BattleRuntime;
}): AutomaticBattleResolutionV1 {
  assertRuntimeMatchesRoster(input.roster, input.runtime);
  const allUnits = input.roster.getAllUnits();
  const selectionStrategies = new Map(
    allUnits.map((unit) => [
      unit.id,
      unit.abilities.getSelectionStrategy(),
    ]),
  );
  const blueprint = createBattleBlueprint(input.battleId, input.roster);
  const initialBoundary = captureBoundary({
    roster: input.roster,
    runtime: input.runtime,
    phase: 'battle_init',
    round: 0,
  });
  let save: BattleSaveV1 = {
    version: 'battle_save_v1',
    blueprint,
    checkpoint: captureBattleCheckpoint({
      blueprint,
      roster: input.roster,
      runtime: input.runtime,
      round: 0,
      checkpointRevision: 0,
    }),
  };
  const sequences: CombatSequenceV3[] = [...initialBoundary.sequences];
  const frames: BattleStateFrameV3[] = [...initialBoundary.frames];
  let outcome: TeamVictoryResult = { battleEnded: false };

  while (!outcome.battleEnded) {
    const commandSet = createAutomaticCommandSet(save, selectionStrategies);
    const resolution = resolveBattleRound(
      save,
      sealRoundCommandSet(save, commandSet),
    );
    sequences.push(...resolution.sequences);
    frames.push(...resolution.stateTimeline.frames);
    outcome = resolution.outcome;
    save = resolution.save;
  }

  const restored = restoreBattleSave(save);
  try {
    const winnerTeamId = resolveAutomaticWinnerTeam(
      outcome,
      restored.roster,
    );
    const winner = restored.roster.getLivingUnits(winnerTeamId)[0]
      ?? restored.roster.getUnit(restored.roster.getTeam(winnerTeamId).unitIds[0]);
    const finalBoundary = captureBoundary({
      roster: restored.roster,
      runtime: restored.runtime,
      phase: 'battle_end',
      round: save.checkpoint.round,
      actor: winner,
    });
    sequences.push(...finalBoundary.sequences);
    frames.push(...finalBoundary.frames);
    const normalizedFrames = frames.map((frame, index) => ({
      ...frame,
      frameId: index + 1,
    }));
    const finalFrame = normalizedFrames[normalizedFrames.length - 1];
    return {
      outcome,
      rounds: save.checkpoint.round,
      sequences,
      stateTimeline: {
        unitIds: allUnits.map((unit) => unit.id),
        unitNames: Object.fromEntries(
          allUnits.map((unit) => [unit.id, unit.name]),
        ),
        frames: normalizedFrames,
      },
      finalSnapshots: finalFrame.units,
      finalSave: save,
    };
  } finally {
    restored.runtime.dispose();
  }
}

function createAutomaticCommandSet(
  save: BattleSaveV1,
  selectionStrategies: ReadonlyMap<string, AbilitySelectionStrategy>,
): RoundCommandSetV1 {
  const restored = restoreBattleSave(save);
  try {
    for (const unit of restored.roster.getAllUnits()) {
      const strategy = selectionStrategies.get(unit.id);
      if (strategy) unit.abilities.setSelectionStrategy(strategy);
    }
    const intents = Object.fromEntries(
      restored.roster.getLivingUnits().map((unit) => [
        unit.id,
        createAutomaticIntent(unit, restored.roster.getAllUnits()),
      ]),
    );
    const round = save.checkpoint.round + 1;
    return {
      version: 'round_command_set_v1',
      commandSetId: `${save.blueprint.battleId}:auto:${round}:${save.checkpoint.checkpointRevision}`,
      round,
      checkpointRevision: save.checkpoint.checkpointRevision,
      intents,
    };
  } finally {
    restored.runtime.dispose();
  }
}

function createAutomaticIntent(
  unit: Unit,
  allUnits: Unit[],
): BattleActionIntentV1 {
  const targetSystem = new TargetSelectionSystem();
  const queued = peekQueuedAction(unit);
  if (queued) {
    const queuedAbility = AbilityFactory.create(queued.ability);
    if (!(queuedAbility instanceof ActiveSkill)) {
      throw new Error(`Queued action ${queued.ability.slug} is not active`);
    }
    const target = targetSystem.getTargetCandidates(
      unit,
      queuedAbility.targetPolicy,
      allUnits,
    )[0];
    if (!target) throw new Error(`Queued action has no target for ${unit.id}`);
    return {
      kind: 'basic_attack',
      targetUnitId: target.id,
      submittedBy: 'timeout',
    };
  }

  if (!unit.tags.hasTag(GameplayTags.STATUS.CONTROL.NO_SKILL)) {
    const candidates = unit.abilities
      .getAllAbilities()
      .filter((ability): ability is ActiveSkill =>
        ability instanceof ActiveSkill,
      )
      .flatMap((ability, order) => {
        const target = targetSystem
          .getTargetCandidates(unit, ability.targetPolicy, allUnits)
          .find((candidate) =>
            ability.canTrigger({ caster: unit, target: candidate }),
          );
        return target ? [{ ability, target, order }] : [];
      });
    const opponent = allUnits.find(
      (candidate) => candidate.teamId !== unit.teamId && candidate.isAlive(),
    ) ?? null;
    const selected = unit.abilities.getSelectionStrategy().select({
      caster: unit,
      opponent,
      candidates,
    });
    if (selected) {
      return {
        kind: 'ability',
        abilityId: selected.ability.id,
        targetUnitId: selected.target.id,
        submittedBy: 'timeout',
      };
    }
  }

  const basicAttack = unit.abilities.getDefaultAttack();
  if (!(basicAttack instanceof ActiveSkill)) {
    throw new Error(`Unit ${unit.id} has no basic attack`);
  }
  const target = targetSystem
    .getTargetCandidates(unit, basicAttack.targetPolicy, allUnits)
    .find((candidate) =>
      basicAttack.canTrigger({ caster: unit, target: candidate }),
    );
  if (!target) throw new Error(`Unit ${unit.id} has no legal automatic action`);
  return {
    kind: 'basic_attack',
    targetUnitId: target.id,
    submittedBy: 'timeout',
  };
}

function captureBoundary(input: {
  roster: BattleRoster;
  runtime: BattleRuntime;
  phase: 'battle_init' | 'battle_end';
  round: number;
  actor?: Unit;
}): { sequences: CombatSequenceV3[]; frames: BattleStateFrameV3[] } {
  const context = new BattleResolutionContext(input.runtime);
  const recorder = new BattleStateRecorder();
  try {
    context.runFrame(
      {
        phase: input.phase,
        turn: input.round,
        actor: input.actor
          ? { id: input.actor.id, name: input.actor.name }
          : undefined,
      },
      (sequence) => {
        recorder.record(
          input.phase,
          input.round,
          input.roster.getAllUnits(),
          undefined,
          sequence.id,
        );
      },
    );
    return {
      sequences: context.getSequences(),
      frames: recorder.getFrames().map((frame) => ({
        ...frame,
        sourceSequenceId: frame.sourceSequenceId!,
      })),
    };
  } finally {
    context.destroy();
  }
}

function resolveAutomaticWinnerTeam(
  outcome: TeamVictoryResult,
  roster: BattleRoster,
): TeamId {
  if (outcome.winnerTeamId) return outcome.winnerTeamId;
  return [...roster.teams.keys()][0];
}

function assertRuntimeMatchesRoster(
  roster: BattleRoster,
  runtime: BattleRuntime,
): void {
  if (roster.getAllUnits().some((unit) => unit.runtime !== runtime)) {
    throw new Error('All battle units must belong to the supplied runtime');
  }
}

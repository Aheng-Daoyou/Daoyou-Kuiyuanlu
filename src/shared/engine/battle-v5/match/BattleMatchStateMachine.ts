import { ROUND_PLANNING_TIMEOUT_MS } from '../round/types';
import { sealRoundCommandSet } from '../round/BattleRoundResolver';
import type { BattleActionIntentV1, RoundCommandSetV1 } from '../round/types';
import type { BattleSaveV1 } from '../persistence/types';
import type {
  BattleControllerV1,
  BattleMatchCommandV1,
  BattleMatchPlayerViewV1,
  BattleResolutionFailureV1,
  BattleMatchStateV1,
  BattleMatchTransitionV1,
  BattleRoundResolutionPublicV1,
  ClientBattleIntentV1,
  CreateBattleMatchInput,
  PlayerId,
} from './types';
import { createBattlePlanningView } from '../round/BattlePlanningView';
import {
  restoreBattleSave,
  validateBattleSave,
} from '../persistence/BattleStateCodec';
import { createBattlePublicSnapshot } from './BattlePublicSnapshot';
import { peekQueuedAction } from '../core/runtimeState';
import { AbilityFactory } from '../factories/AbilityFactory';
import { ActiveSkill } from '../abilities/ActiveSkill';
import { TargetSelectionSystem } from '../systems/TargetSelectionSystem';

export function createBattleMatchState(
  input: CreateBattleMatchInput,
): BattleMatchStateV1 {
  validateBattleSave(input.battle);
  validateControllers(input.battle, input.controllers);
  if (!input.matchId || !Number.isFinite(input.now)) {
    throw new Error('Battle match requires an id and finite creation time');
  }
  const timeout = input.planningTimeoutMs ?? ROUND_PLANNING_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('Battle match planning timeout must be positive');
  }
  const state: BattleMatchStateV1 = {
    version: 'battle_match_state_v1',
    matchId: input.matchId,
    status: 'planning',
    revision: 0,
    processedRequestIds: [],
    battle: clone(input.battle),
    controllers: clone(input.controllers),
    planning: {
      round: input.battle.checkpoint.round + 1,
      checkpointRevision: input.battle.checkpoint.checkpointRevision,
      deadlineAt: input.now + timeout,
      submissions: {},
      committedPlayerIds: [],
    },
    createdAt: input.now,
    updatedAt: input.now,
  };
  return clone(state);
}

export function transitionBattleMatch(
  state: BattleMatchStateV1,
  command: BattleMatchCommandV1,
  now: number,
): BattleMatchTransitionV1 {
  const current = clone(state);
  if (!command.requestId) throw new Error('Battle match command requires requestId');
  if (!Number.isFinite(now)) throw new Error('Battle match time must be finite');
  if (current.processedRequestIds.includes(command.requestId)) {
    return { state: current, effects: [], changed: false, duplicateRequest: true };
  }
  if (command.expectedMatchRevision !== current.revision) {
    throw new Error('Battle match revision is stale');
  }
  if (
    command.expectedCheckpointRevision !== current.battle.checkpoint.checkpointRevision
  ) {
    throw new Error('Battle checkpoint revision is stale');
  }
  if (command.matchId !== current.matchId) {
    throw new Error('Battle match id does not match state');
  }
  if (current.status !== 'planning' || !current.planning) {
    throw new Error(`Battle match is not planning: ${current.status}`);
  }
  if (command.type !== 'resolve_planning_timeout' && now >= current.planning.deadlineAt) {
    throw new Error('Battle planning deadline has been reached');
  }

  if (command.type === 'commit_player_intents') {
    const controller = getController(current, command.playerId);
    if (current.planning.committedPlayerIds.includes(command.playerId)) {
      throw new Error('Committed player cannot change intents');
    }
    const restored = restoreBattleSave(current.battle);
    let livingUnitIds: string[];
    try {
      livingUnitIds = controller.unitIds.filter((unitId) =>
        restored.roster.getUnit(unitId).isAlive(),
      );
    } finally {
      restored.runtime.dispose();
    }
    const submittedUnitIds = Object.keys(command.intents).sort();
    if (
      submittedUnitIds.length !== livingUnitIds.length ||
      submittedUnitIds.some((unitId) => !livingUnitIds.includes(unitId))
    ) {
      throw new Error('Player must commit every living controlled unit exactly once');
    }
    const normalized = Object.fromEntries(
      livingUnitIds.map((unitId) => [
        unitId,
        normalizeClientIntent(command.intents[unitId]),
      ]),
    );
    const submissions = {
      ...current.planning.submissions,
      ...normalized,
    };
    const committed = [...current.planning.committedPlayerIds, command.playerId].sort();
    const candidate = {
      ...current,
      planning: {
        ...current.planning,
        submissions,
        committedPlayerIds: committed,
      },
    };
    // Validate the complete prospective round now, filling other players with
    // deterministic timeout attacks. Invalid targets never remain latent until
    // the final player commits.
    sealRoundCommandSet(candidate.battle, buildCommandSet(candidate));
    return transition(current, {
      planning: candidate.planning,
      updatedAt: now,
    }, now, command.requestId);
  }

  if (now < current.planning.deadlineAt) {
    throw new Error('Battle planning deadline has not been reached');
  }
  const committedPlayerIds = current.controllers.map((controller) => controller.playerId);
  const submissions = fillTimeouts(current);
  return transition(current, {
    planning: { ...current.planning, submissions, committedPlayerIds },
    updatedAt: now,
  }, now, command.requestId);
}

export function applyBattleRoundResolution(
  state: BattleMatchStateV1,
  resolution: import('../round/types').BattleRoundResolutionV1,
  now: number,
): BattleMatchStateV1 {
  if (state.status !== 'resolving' || !state.resolving) {
    throw new Error('Battle match is not resolving');
  }
  if (state.resolving.commandSet.commandSetId !== resolution.commandSetId) {
    throw new Error('Resolution does not match the sealed command set');
  }
  const next = resolution.outcome.battleEnded
    ? { status: 'finished' as const, planning: undefined, resolving: undefined }
    : {
        status: 'planning' as const,
        planning: {
          round: resolution.checkpoint.round + 1,
          checkpointRevision: resolution.checkpoint.checkpointRevision,
          deadlineAt: now + ROUND_PLANNING_TIMEOUT_MS,
          submissions: {},
          committedPlayerIds: [],
        },
        resolving: undefined,
      };
  return clone({
    ...state,
    ...next,
    battle: resolution.save,
    latestResolution: resolution,
    revision: state.revision + 1,
    updatedAt: now,
  });
}

export function markBattleResolutionFailed(
  state: BattleMatchStateV1,
  error: unknown,
  now: number,
): BattleMatchStateV1 {
  if (state.status !== 'resolving' || !state.resolving) return clone(state);
  const failure = createBattleResolutionFailure(error, now);
  return clone({
    ...state,
    status: 'resolution_failed',
    resolving: { ...state.resolving, failure },
    revision: state.revision + 1,
    updatedAt: now,
  });
}

export function retryFailedBattleResolution(
  state: BattleMatchStateV1,
  now: number,
): BattleMatchStateV1 {
  if (state.status !== 'resolution_failed' || !state.resolving) return clone(state);
  return clone({
    ...state,
    status: 'resolving',
    resolving: { commandSet: state.resolving.commandSet, startedAt: now },
    revision: state.revision + 1,
    updatedAt: now,
  });
}

export function cancelBattleResolution(
  state: BattleMatchStateV1,
  now: number,
): BattleMatchStateV1 {
  if (state.status !== 'resolution_failed' && state.status !== 'resolving') {
    return clone(state);
  }
  return clone({
    ...state,
    status: 'cancelled',
    planning: undefined,
    resolving: undefined,
    revision: state.revision + 1,
    updatedAt: now,
  });
}

function createBattleResolutionFailure(
  error: unknown,
  failedAt: number,
): BattleResolutionFailureV1 {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === 'object' &&
    'code' in error && error.code === 'BATTLE_RESOLUTION_LIMIT_EXCEEDED'
      ? 'BATTLE_RESOLUTION_LIMIT_EXCEEDED' as const
      : 'BATTLE_ROUND_RESOLUTION_FAILED' as const;
  return {
    code,
    fingerprint: stableErrorFingerprint(
      `${error instanceof Error ? error.name : 'Error'}:${message}`,
    ),
    message,
    failedAt,
  };
}

function stableErrorFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `resolution-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createBattleMatchPlayerView(
  state: BattleMatchStateV1,
  playerId: PlayerId,
  now: number,
): BattleMatchPlayerViewV1 {
  const controller = getController(state, playerId);
  const planning = state.planning;
  let planningView;
  if (planning) {
    const restored = restoreBattleSave(state.battle);
    try {
      planningView = createBattlePlanningView({
        roster: restored.roster,
        round: planning.round,
        checkpointRevision: planning.checkpointRevision,
        teamId: controller.teamId,
      });
    } finally {
      restored.runtime.dispose();
    }
  }
  return clone({
    version: 'battle_match_player_view_v1',
    matchId: state.matchId,
    status: state.status,
    revision: state.revision,
    playerId,
    teamId: controller.teamId,
    controlledUnitIds: controller.unitIds,
    round:
      planning?.round ??
      state.resolving?.commandSet.round ??
      state.battle.checkpoint.round,
    checkpointRevision:
      planning?.checkpointRevision ??
      state.resolving?.commandSet.checkpointRevision ??
      state.battle.checkpoint.checkpointRevision,
    deadlineAt: planning?.deadlineAt,
    serverNow: now,
    publicSnapshot: createBattlePublicSnapshot(state.battle),
    planningView,
    ownSubmissions: Object.fromEntries(
      controller.unitIds
        .filter((unitId) => planning?.submissions[unitId])
        .map((unitId) => [unitId, planning!.submissions[unitId]]),
    ),
    committedPlayerIds: planning?.committedPlayerIds ?? [],
    latestResolution: state.latestResolution
      ? toPublicResolution(state.latestResolution)
      : undefined,
    resolutionFailure: state.resolving?.failure
      ? {
          code: state.resolving.failure.code,
          fingerprint: state.resolving.failure.fingerprint,
          failedAt: state.resolving.failure.failedAt,
        }
      : undefined,
  });
}

function toPublicResolution(
  resolution: import('../round/types').BattleRoundResolutionV1,
): BattleRoundResolutionPublicV1 {
  return {
    version: 'battle_round_resolution_public_v1',
    commandSetId: resolution.commandSetId,
    round: resolution.round,
    outcome: resolution.outcome,
    sequences: resolution.sequences,
  };
}

function transition(
  state: BattleMatchStateV1,
  patch: Partial<BattleMatchStateV1>,
  now: number,
  requestId: string,
): BattleMatchTransitionV1 {
  let next = clone({
    ...state,
    ...patch,
    processedRequestIds: [...state.processedRequestIds, requestId].slice(-128),
    revision: state.revision + 1,
    updatedAt: now,
  });
  const planning = next.planning;
  if (planning && allControllersCommitted(next)) {
    const commandSet = buildCommandSet(next);
    const sealed = sealRoundCommandSet(next.battle, commandSet);
    next = clone({
      ...next,
      status: 'resolving',
      planning: undefined,
      resolving: { commandSet: sealed, startedAt: now },
      revision: next.revision + 1,
    });
    return { state: next, effects: [{ type: 'resolve_round', commandSet: sealed }], changed: true, duplicateRequest: false };
  }
  return { state: next, effects: [], changed: true, duplicateRequest: false };
}

function buildCommandSet(state: BattleMatchStateV1): RoundCommandSetV1 {
  const submissions = fillTimeouts(state);
  return {
    version: 'round_command_set_v1',
    commandSetId: `${state.matchId}:${state.planning!.round}:${state.planning!.checkpointRevision}`,
    round: state.planning!.round,
    checkpointRevision: state.planning!.checkpointRevision,
    intents: submissions,
  };
}

function fillTimeouts(state: BattleMatchStateV1): Record<string, BattleActionIntentV1> {
  const restored = restoreBattleSave(state.battle);
  try {
    const result: Record<string, BattleActionIntentV1> = { ...state.planning!.submissions };
    const allUnits = restored.roster.getAllUnits();
    const targetSystem = new TargetSelectionSystem();
    for (const unit of restored.roster.getLivingUnits()) {
      if (result[unit.id]) continue;
      const queued = peekQueuedAction(unit);
      const ability = queued
        ? AbilityFactory.create(queued.ability)
        : unit.abilities.getDefaultAttack();
      if (!(ability instanceof ActiveSkill)) {
        throw new Error(`Unit ${unit.id} has no timeout attack`);
      }
      const target = targetSystem
        .getTargetCandidates(unit, ability.targetPolicy, allUnits)
        .find((candidate) => ability.canTrigger({ caster: unit, target: candidate }));
      if (!target) throw new Error(`Unit ${unit.id} has no legal timeout attack target`);
      result[unit.id] = {
        kind: 'basic_attack',
        targetUnitId: target.id,
        submittedBy: 'timeout',
      };
    }
    return result;
  } finally {
    restored.runtime.dispose();
  }
}

function allControllersCommitted(state: BattleMatchStateV1): boolean {
  return state.controllers.every((controller) =>
    state.planning!.committedPlayerIds.includes(controller.playerId),
  );
}

function getController(state: BattleMatchStateV1, playerId: string): BattleControllerV1 {
  const controller = state.controllers.find((entry) => entry.playerId === playerId);
  if (!controller) throw new Error('Player is not a battle controller');
  return controller;
}

function normalizeClientIntent(intent: ClientBattleIntentV1): BattleActionIntentV1 {
  if (intent.kind === 'basic_attack' && intent.targetUnitId) {
    return {
      kind: 'basic_attack',
      targetUnitId: intent.targetUnitId,
      submittedBy: 'player',
    };
  }
  if (intent.kind !== 'ability' || !intent.abilityId) throw new Error('Invalid ability intent');
  return {
    kind: 'ability',
    abilityId: intent.abilityId,
    ...(intent.targetUnitId ? { targetUnitId: intent.targetUnitId } : {}),
    submittedBy: 'player',
  };
}

function validateControllers(save: BattleSaveV1, controllers: readonly BattleControllerV1[]): void {
  if (controllers.length < 2 || new Set(controllers.map((entry) => entry.playerId)).size !== controllers.length) {
    throw new Error('Battle match requires at least two unique controllers');
  }
  const units = new Set(Object.keys(save.checkpoint.units));
  const controlled = new Set<string>();
  for (const controller of controllers) {
    if (!controller.playerId || !controller.teamId || controller.unitIds.length < 1) throw new Error('Invalid battle controller');
    if (!save.blueprint.teams.some((team) => team.id === controller.teamId)) throw new Error('Controller references unknown team');
    for (const unitId of controller.unitIds) {
      if (!units.has(unitId) || controlled.has(unitId)) throw new Error('Controller references invalid or duplicate unit');
      controlled.add(unitId);
      const team = save.blueprint.teams.find((entry) => entry.units.some((unit) => unit.id === unitId));
      if (team?.id !== controller.teamId) throw new Error('Controller unit is not on the declared team');
    }
  }
  if (controlled.size !== units.size) throw new Error('Every battle unit must have a controller');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

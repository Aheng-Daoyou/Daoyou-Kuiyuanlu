import {
  adaptCombatSequenceV3ToVisualAction,
  projectCombatVisualAction,
  type CombatVisualActionInput,
  type CombatVisualTimeline,
} from '@shared/engine/battle-v5/presentation';
import type { CombatControlVisual } from '@shared/engine/battle-v5/presentation';
import type { BattleMatchPlayerViewV1 } from '@shared/engine/battle-v5/match/types';
import type { BattlePublicUnitStateV1 } from '@shared/engine/battle-v5/match/BattlePublicSnapshot';

export type BattlePresentationTeamV1 = 'allies' | 'enemies';

export interface BattlePresentationEffectV1 {
  readonly id: string;
  readonly label: string;
  readonly tone: 'buff' | 'debuff';
  readonly statusType: 'buff' | 'debuff' | 'control';
  readonly layers: number;
  readonly until: number;
  readonly controlVisual?: CombatControlVisual;
}

export interface BattlePresentationResourceV1 {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly current: number;
  readonly max: number;
  readonly iconHueRotation?: number;
}

export interface BattlePresentationActionStateV1 {
  readonly id: string;
  readonly label: string;
  readonly tone: 'preparing' | 'control' | 'mode';
  readonly until: number;
}

/**
 * Renderer-facing entity data. This deliberately contains only public
 * presentation data; it is not a battle-v5 save or runtime unit snapshot.
 */
export interface BattlePresentationEntityV1 {
  readonly id: string;
  readonly name: string;
  readonly team: BattlePresentationTeamV1;
  readonly kind: 'cultivator' | 'spirit-pet';
  readonly slot?: 0 | 1 | 2 | 3;
  readonly ownerId?: string;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly qi: number;
  readonly maxQi: number;
  readonly shield: number;
  readonly alive: boolean;
  readonly effects: readonly BattlePresentationEffectV1[];
  readonly combatResources: readonly BattlePresentationResourceV1[];
  readonly actionStates: readonly BattlePresentationActionStateV1[];
}

export interface BattlePresentationSnapshotV1 {
  readonly version: 'battle_presentation_snapshot_v1';
  readonly elapsedMs: number;
  readonly cycle: number;
  readonly phase: string;
  readonly focusedEntityId: string;
  readonly latestAction?: CombatVisualActionInput;
  readonly entities: readonly BattlePresentationEntityV1[];
}

export interface BattlePresentationRoundV1 {
  readonly commandSetId: string;
  readonly round: number;
  readonly actions: readonly CombatVisualActionInput[];
  readonly timelines: readonly CombatVisualTimeline[];
}

function teamForViewer(
  unit: BattlePublicUnitStateV1,
  viewerTeamId: string,
): BattlePresentationTeamV1 {
  return unit.teamId === viewerTeamId ? 'allies' : 'enemies';
}

function phaseLabel(view: BattleMatchPlayerViewV1): string {
  switch (view.status) {
    case 'waiting':
      return '等待入阵';
    case 'planning':
      return '选招';
    case 'resolving':
      return '统一结算';
    case 'finished':
      return '战局已定';
    case 'cancelled':
      return '战局取消';
  }
}

function elapsedPlanningMs(view: BattleMatchPlayerViewV1): number {
  if (!view.deadlineAt || view.status !== 'planning') return 0;
  return Math.max(0, Math.min(30_000, view.serverNow - (view.deadlineAt - 30_000)));
}

function toEntity(
  unit: BattlePublicUnitStateV1,
  viewerTeamId: string,
  elapsedMs: number,
): BattlePresentationEntityV1 {
  return {
    id: unit.unitId,
    name: unit.name,
    team: teamForViewer(unit, viewerTeamId),
    kind: 'cultivator',
    slot: unit.slot,
    x: 0,
    y: 0,
    hp: unit.hp.current,
    maxHp: unit.hp.max,
    qi: unit.mp.current,
    maxQi: unit.mp.max,
    shield: unit.shield,
    alive: unit.alive,
    effects: unit.effects.map((effect) => ({
      id: effect.id,
      label: effect.label,
      tone: effect.statusType === 'buff' ? 'buff' : 'debuff',
      statusType: effect.statusType,
      layers: effect.layers,
      until: effect.permanent
        ? Number.MAX_SAFE_INTEGER
        : elapsedMs + effect.remainingActions * 30_000,
      ...(effect.statusType === 'control'
        ? { controlVisual: 'generic' as const }
        : {}),
    })),
    combatResources: unit.combatResources.map((resource) => ({
      id: resource.id,
      name: resource.name,
      icon: resource.icon ?? '◆',
      current: resource.current,
      max: resource.max,
    })),
    actionStates: unit.actionStates.map((state) => ({
      id: state.id,
      label: state.label,
      tone: state.type === 'rest'
        ? 'control'
        : state.type === 'queued_action'
          ? 'preparing'
          : 'mode',
      until: elapsedMs + state.remainingActions * 30_000,
    })),
  };
}

export function createBattlePresentationSnapshot(
  view: BattleMatchPlayerViewV1,
  focusedEntityId?: string,
): BattlePresentationSnapshotV1 {
  const units = view.publicSnapshot.units;
  const elapsedMs = elapsedPlanningMs(view);
  const fallbackFocus = units.find(
    (unit) => unit.teamId === view.teamId && unit.alive,
  )?.unitId ?? units[0]?.unitId ?? '';
  return {
    version: 'battle_presentation_snapshot_v1',
    elapsedMs,
    cycle: view.round,
    phase: phaseLabel(view),
    focusedEntityId:
      focusedEntityId && units.some((unit) => unit.unitId === focusedEntityId)
        ? focusedEntityId
        : fallbackFocus,
    entities: units.map((unit) => toEntity(unit, view.teamId, elapsedMs)),
  };
}

export function createBattlePresentationRound(
  view: BattleMatchPlayerViewV1,
): BattlePresentationRoundV1 | null {
  const resolution = view.latestResolution;
  if (!resolution) return null;
  const actions = resolution.sequences
    .map((sequence) => adaptCombatSequenceV3ToVisualAction(sequence))
    .filter((action): action is CombatVisualActionInput => Boolean(action));
  return {
    commandSetId: resolution.commandSetId,
    round: resolution.round,
    actions,
    timelines: actions.map((action) => projectCombatVisualAction(action)),
  };
}

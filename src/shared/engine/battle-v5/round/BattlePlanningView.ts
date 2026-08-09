import { ActiveSkill } from '../abilities/ActiveSkill';
import type { BattleRoster } from '../core/BattleRoster';
import type { TeamId } from '../core/types';
import { TargetSelectionSystem } from '../systems/TargetSelectionSystem';
import { AbilityFactory } from '../factories/AbilityFactory';
import { peekQueuedAction } from '../core/runtimeState';
import type {
  BattlePlanningViewV1,
  PlanningAbilityViewV1,
} from './types';

export function createBattlePlanningView(input: {
  roster: BattleRoster;
  round: number;
  checkpointRevision: number;
  teamId?: TeamId;
}): BattlePlanningViewV1 {
  const targetSystem = new TargetSelectionSystem();
  const allUnits = input.roster.getAllUnits();
  const units = allUnits
    .filter((unit) => !input.teamId || unit.teamId === input.teamId)
    .map((unit) => {
      const queued = unit.isAlive() ? peekQueuedAction(unit) : undefined;
      const queuedAbility = queued ? AbilityFactory.create(queued.ability) : undefined;
      const forcedTargets = queuedAbility instanceof ActiveSkill
        ? targetSystem.getTargetCandidates(unit, queuedAbility.targetPolicy, allUnits)
        : [];
      const defaultAttack = unit.isAlive() ? unit.abilities.getDefaultAttack() : undefined;
      const basicTargets = defaultAttack instanceof ActiveSkill
        ? targetSystem.getTargetCandidates(unit, defaultAttack.targetPolicy, allUnits)
        : [];
      const basicReady = basicTargets.some((target) =>
        defaultAttack instanceof ActiveSkill
          ? defaultAttack.canTrigger({ caster: unit, target })
          : false,
      );
      return {
        unitId: unit.id,
        teamId: unit.teamId,
        alive: unit.isAlive(),
        basicAttack: unit.isAlive()
          ? {
              abilityId: 'basic_attack' as const,
              name: defaultAttack?.name ?? '普攻',
              ready: basicReady,
              unavailableReason: basicTargets.length === 0
                ? 'no_target' as const
                : basicReady
                  ? undefined
                  : 'condition' as const,
              legalTargetIds: basicTargets.map((target) => target.id),
            }
          : undefined,
        forcedAction: queuedAbility instanceof ActiveSkill
          ? {
              kind: 'queued_action_target' as const,
              abilityId: queuedAbility.id,
              abilityName: queuedAbility.name,
              legalTargetIds: forcedTargets.map((target) => target.id),
            }
          : undefined,
        abilities: unit.isAlive() && !queued
        ? unit.abilities
            .getAllAbilities()
            .filter(
              (ability): ability is ActiveSkill =>
                ability instanceof ActiveSkill,
            )
            .map((ability): PlanningAbilityViewV1 => {
              const candidates = targetSystem.getTargetCandidates(
                unit,
                ability.targetPolicy,
                allUnits,
              );
              const hasEnoughResources = ability.hasEnoughResources(unit);
              const hasTriggerableTarget = candidates.some((target) =>
                ability.canTrigger({ caster: unit, target }),
              );
              return {
                abilityId: ability.id,
                name: ability.name,
                description: ability.description,
                visual: ability.getSerializableConfig()?.presentation?.visual,
                costs: ability.resourceCosts.map((cost) => ({
                  resource: cost.type,
                  amount: cost.amount,
                  mode: cost.mode,
                })),
                cooldown: {
                  current: ability.currentCooldown,
                  max: ability.maxCooldown,
                },
                ready:
                  ability.isReady() &&
                  hasEnoughResources &&
                  hasTriggerableTarget,
                unavailableReason: !ability.isReady()
                  ? 'cooldown'
                  : candidates.length === 0
                    ? 'no_target'
                    : !hasEnoughResources
                      ? 'resource'
                      : hasTriggerableTarget
                        ? undefined
                        : 'condition',
                targetTeam: ability.targetPolicy.team,
                targetScope: ability.targetPolicy.scope,
                legalTargetIds: candidates.map((target) => target.id),
              };
            })
        : [],
      };
    });
  return {
    version: 'battle_planning_view_v1',
    round: input.round,
    checkpointRevision: input.checkpointRevision,
    units,
  };
}

import type {
  BattleInitConfigV5,
} from '@shared/engine/battle-v5/setup/types';
import type {
  ConditionStatusInstance,
  ConditionStatusKey,
} from '@shared/types/condition';
import type { CultivatorCombatInput } from '@shared/engine/battle-v5/adapters/CultivatorCombatAdapter';
import { ConditionService } from '../services/ConditionService';

export function buildPersistentStatus(
  statusKey: ConditionStatusKey,
  stacks: number,
): ConditionStatusInstance {
  const now = new Date().toISOString();
  return {
    key: statusKey,
    stacks: Math.max(1, Math.floor(stacks)),
    source: 'event',
    duration: { kind: 'until_removed' },
    createdAt: now,
    updatedAt: now,
  };
}

export function buildDungeonBattleInit(
  cultivator: CultivatorCombatInput,
): BattleInitConfigV5 {
  return ConditionService.buildBattleInit(
    cultivator,
    cultivator.condition,
    'persistent_pve',
  );
}

export function incrementOrInsertStatus(
  statuses: ConditionStatusInstance[],
  statusKey: ConditionStatusKey,
  stacks: number,
  cap = 10,
): ConditionStatusInstance[] {
  const next = [...statuses];
  const existing = next.find((status) => status.key === statusKey);
  if (existing) {
    existing.stacks = Math.min(cap, existing.stacks + Math.floor(stacks));
    existing.updatedAt = new Date().toISOString();
    return next;
  }

  next.push(buildPersistentStatus(statusKey, stacks));
  return next;
}

export function promoteInjuryStatus(
  statuses: ConditionStatusInstance[],
): ConditionStatusInstance[] {
  const hasMinorWound = statuses.find((status) => status.key === 'minor_wound');
  const hasMajorWound = statuses.find((status) => status.key === 'major_wound');
  const hasNearDeath = statuses.find((status) => status.key === 'near_death');

  if (hasNearDeath) {
    hasNearDeath.stacks = Math.min(10, hasNearDeath.stacks + 1);
    hasNearDeath.updatedAt = new Date().toISOString();
    return [...statuses];
  }

  if (hasMajorWound) {
    return [
      ...statuses.filter((status) => status.key !== 'major_wound'),
      buildPersistentStatus('near_death', 1),
    ];
  }

  if (hasMinorWound) {
    return [
      ...statuses.filter((status) => status.key !== 'minor_wound'),
      buildPersistentStatus('major_wound', 1),
    ];
  }

  return [...statuses, buildPersistentStatus('minor_wound', 1)];
}

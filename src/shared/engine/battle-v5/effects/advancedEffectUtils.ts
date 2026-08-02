import { Buff } from '../buffs/Buff';
import { BuffMatchParams } from '../core/configs';
import type { Unit } from '../units/Unit';
import type { CombatMechanicOperationV3 } from '../v3/mechanics';
import { EffectExecutionContextV3 } from './Effect';

export function matchesBuff(buff: Buff, match?: BuffMatchParams): boolean {
  if (!match) return true;
  if (match.id && buff.id !== match.id) return false;
  if (match.tags && match.tags.length > 0) {
    return match.tags.some((tag) => buff.tags.hasTag(tag));
  }
  return true;
}

export function findMatchingBuffs(
  target: EffectExecutionContextV3['target'],
  match?: BuffMatchParams,
): Buff[] {
  return target.buffs.getAllBuffs().filter((buff) => matchesBuff(buff, match));
}

export function commitMechanicResultV3(
  context: EffectExecutionContextV3,
  event: {
    mechanic: string;
    code: string;
    displayName: string;
    target: Unit;
    detail?: string;
    value?: number;
    visibility?: 'player' | 'debug';
    operation?: CombatMechanicOperationV3;
    previousDisplayName?: string;
  },
): void {
  if (event.visibility === 'debug') return;
  context.commit(event.target, {
    type: 'mechanic',
    mechanic: event.mechanic,
    code: event.code,
    name: event.displayName,
    operation: event.operation,
    previousName: event.previousDisplayName,
    detail: event.detail,
    value: event.value,
  });
}

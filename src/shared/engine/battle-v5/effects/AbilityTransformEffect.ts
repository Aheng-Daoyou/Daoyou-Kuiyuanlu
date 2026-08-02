import { AbilityTransformParams } from '../core/configs';
import { addAbilityTransform } from '../core/runtimeState';
import { EffectRegistry } from '../factories/EffectRegistry';
import { CombatMechanicDisplayNameV3 } from '../v3/mechanics';
import { EffectExecutionContextV3, GameplayEffect } from './Effect';
import { commitMechanicResultV3 } from './advancedEffectUtils';

export class AbilityTransformEffect extends GameplayEffect {
  constructor(private params: AbilityTransformParams) {
    super();
  }

  execute(context: EffectExecutionContextV3): void {
    addAbilityTransform(context.caster, {
      id: this.params.id,
      remainingTriggers: Math.max(1, this.params.triggers ?? 1),
      appliesToTags: this.params.appliesToTags,
      trueDamage: this.params.trueDamage,
      addDispel: this.params.addDispel
        ? { type: 'dispel', params: this.params.addDispel }
        : undefined,
      mpCostToHp: this.params.mpCostToHp,
      freeManaCost: this.params.freeManaCost,
      cooldownModify: this.params.cooldownModify,
      forceCritical: this.params.forceCritical,
      bonusDamageMemory: this.params.bonusDamageMemory,
    });
    commitMechanicResultV3(context, {
      mechanic: 'ability_transform',
      code: this.params.id,
      target: context.caster,
      displayName: CombatMechanicDisplayNameV3.ABILITY_TRANSFORM,
      value: this.params.triggers ?? 1,
    });
  }
}

EffectRegistry.getInstance().register(
  'ability_transform',
  (params) => new AbilityTransformEffect(params),
);

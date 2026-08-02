import { NextHitRuleParams } from '../core/configs';
import { addAbilityTransform } from '../core/runtimeState';
import { EffectRegistry } from '../factories/EffectRegistry';
import { CombatMechanicCodeV3 } from '../v3/mechanics';
import { EffectExecutionContextV3, GameplayEffect } from './Effect';
import { commitMechanicResultV3 } from './advancedEffectUtils';

export class NextHitRuleEffect extends GameplayEffect {
  constructor(private params: NextHitRuleParams) {
    super();
  }

  execute(context: EffectExecutionContextV3): void {
    addAbilityTransform(context.caster, {
      id: `next_hit_rule_${context.ability?.id ?? 'effect'}`,
      remainingTriggers: Math.max(1, this.params.triggers ?? 1),
      appliesToTags: this.params.appliesToTags,
      forceCritical: this.params.forceCritical,
    });
    commitMechanicResultV3(context, {
      mechanic: 'ability_transform',
      code: CombatMechanicCodeV3.NEXT_HIT_RULE,
      target: context.caster,
      displayName: '下一击规则',
      visibility: 'player',
      value: this.params.triggers ?? 1,
    });
  }
}

EffectRegistry.getInstance().register(
  'next_hit_rule',
  (params) => new NextHitRuleEffect(params),
);

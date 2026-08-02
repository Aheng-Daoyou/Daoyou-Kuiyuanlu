import { GameplayTags } from '@shared/engine/shared/tag-domain';
import { AttributeType } from '../core';
import { TagTriggerParams } from '../core/configs';
import { executeEffectConfigs } from '../core/effectExecutor';
import { TagTriggerEvent } from '../core/events';
import { EffectRegistry } from '../factories/EffectRegistry';
import { CombatMechanicCodeV3 } from '../v3/mechanics';
import { DamageEffect } from './DamageEffect';
import {
  EffectExecutionContextV3,
  GameplayEffect,
  executeGameplayEffectV3,
} from './Effect';

/**
 * 标签触发原子效果
 * 检查目标是否有指定标签，如果有则执行后续逻辑
 */
export class TagTriggerEffect extends GameplayEffect {
  constructor(private params: TagTriggerParams) {
    super();
  }

  execute(context: EffectExecutionContextV3): void {
    const { target, caster, ability } = context;

    // 1. 检查目标是否拥有该标签
    if (
      this.params.triggerTag !== GameplayTags.STATUS.ROOT &&
      !target.tags.hasTag(this.params.triggerTag)
    ) {
      return;
    }

    context.commit(target, {
      type: 'mechanic',
      mechanic: 'tag_trigger',
      code: CombatMechanicCodeV3.TAG_TRIGGER,
      name: this.params.displayName ?? '标签触发',
    });

    context.emit<TagTriggerEvent>({
      type: 'TagTriggerEvent',
      timestamp: Date.now(),
      caster,
      target,
      ability,
      tag: this.params.triggerTag,
      displayName: this.params.displayName,
    });
    if (!context.canExecuteEffect()) return;

    if (this.params.effects && this.params.effects.length > 0) {
      executeEffectConfigs(this.params.effects, context);
    } else {
      // Legacy fallback: old tag_trigger implied a fixed Spirit-scaling damage hit.
      const damageEffect = new DamageEffect({
        value: {
          base: 50,
          coefficient: this.params.damageRatio || 2.0,
          attribute: AttributeType.SPIRIT,
        },
      });
      executeGameplayEffectV3(damageEffect, context);
    }

    if (!context.canExecuteEffect()) return;
    if (this.params.removeOnTrigger) {
      const buffs = target.buffs.getAllBuffs();
      const targetBuff = buffs.find((b) =>
        b.tags.hasTag(this.params.triggerTag),
      );
      if (targetBuff) {
        target.buffs.removeBuff(targetBuff.id, {
          ability: context.ability,
          buff: context.buff,
          attribution: context.attribution,
          trace: context.trace,
        });
      }
    }
  }
}

// 注册
EffectRegistry.getInstance().register(
  'tag_trigger',
  (params) => new TagTriggerEffect(params),
);

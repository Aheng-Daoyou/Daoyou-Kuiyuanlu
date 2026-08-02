import { ActiveSkill } from '../abilities/ActiveSkill';
import { CooldownModifyParams } from '../core/configs';
import { CooldownModifyEvent } from '../core/events';
import { EffectRegistry } from '../factories/EffectRegistry';
import { CombatMechanicCodeV3 } from '../v3/mechanics';
import { EffectExecutionContextV3, GameplayEffect } from './Effect';

/**
 * 冷却修改原子效果
 * 扰动技能的时序逻辑
 */
export class CooldownModifyEffect extends GameplayEffect {
  constructor(private params: CooldownModifyParams) {
    super();
  }

  execute(context: EffectExecutionContextV3): void {
    const { target, caster, ability } = context;
    const recipient = this.params.target === 'caster' ? caster : target;
    const abilities = recipient.abilities.getAllAbilities();
    const matchedSkills = abilities.filter(
      (skill): skill is ActiveSkill =>
        skill instanceof ActiveSkill &&
        (this.params.includeCurrent || ability !== skill) &&
        (!this.params.tags || skill.tags.hasAnyTag(this.params.tags)),
    );
    const countToModify =
      this.params.maxCount === undefined
        ? matchedSkills.length
        : Math.min(
            matchedSkills.length,
            Math.max(0, Math.floor(this.params.maxCount)),
          );

    for (let i = 0; i < countToModify; i++) {
      if (!context.canExecuteEffect()) break;
      const skill = matchedSkills[i];

      // 调用 ActiveSkill 提供的标准化方法修改冷却
      skill.modifyCooldown(this.params.cdModifyValue);

      context.commit(recipient, {
        type: 'mechanic',
        mechanic: 'cooldown_modify',
        code: CombatMechanicCodeV3.COOLDOWN_MODIFY,
        name: '冷却变化',
        detail: skill.name,
        value: this.params.cdModifyValue,
      });

      // 发布冷却修改事件
      context.emit<CooldownModifyEvent>({
        type: 'CooldownModifyEvent',
        timestamp: Date.now(),
        caster,
        target: recipient,
        ability,
        cdModifyValue: this.params.cdModifyValue,
        affectedAbilityName: skill.name,
      });
    }
  }
}

// 注册
EffectRegistry.getInstance().register(
  'cooldown_modify',
  (params) => new CooldownModifyEffect(params),
);

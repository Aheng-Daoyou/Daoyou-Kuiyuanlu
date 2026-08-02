export const CombatMechanicCodeV3 = {
  ABILITY_LOCK: 'ability_lock',
  BUFF_LAYER_MODIFY: 'buff_layer_modify',
  CONSUME_STATUS: 'consume_status',
  CONTROL_SKIP: 'control_skip',
  COOLDOWN_MODIFY: 'cooldown_modify',
  DAMAGE_DEFER: 'damage_defer',
  HP_SACRIFICE: 'hp_sacrifice',
  MANA_BURN: 'mana_burn',
  NEXT_HIT_RULE: 'next_hit_rule',
  TAG_TRIGGER: 'tag_trigger',
} as const;

export type CombatMechanicOperationV3 =
  'apply' | 'refresh' | 'replace' | 'consume';

export const CombatMechanicDisplayNameV3 = {
  ABILITY_TRANSFORM: '能力强化',
  DAMAGE_MEMORY_RECORD: '伤害记录',
  DAMAGE_MEMORY_RELEASE: '蓄力释放',
} as const;

import type { ActionStatePhase } from '../core/actionState';
import type {
  CombatFactV3,
  CombatSequenceV3,
  PresentedLogLineV3,
  PresentedLogPartV3,
} from './types';

const part = (
  text: string,
  kind: PresentedLogPartV3['kind'] = 'text',
  tone?: PresentedLogPartV3['tone'],
  emphasis?: PresentedLogPartV3['emphasis'],
): PresentedLogPartV3 => ({ text, kind, tone, emphasis });

function attributionPrefix(fact: CombatFactV3): PresentedLogPartV3[] {
  if (fact.origin.kind === 'system') {
    return [part(`「${fact.origin.carrier.name}」`, 'status')];
  }
  return [
    part(`「${fact.origin.owner.name}」`, 'unit'),
    part(`的「${fact.origin.carrier.name}」`, 'status'),
  ];
}

function attributionKey(fact: CombatFactV3): string {
  const ownerId =
    fact.origin.kind === 'owned' ? fact.origin.owner.id : 'system';
  return `${ownerId}:${fact.origin.carrier.kind}:${fact.origin.carrier.id}`;
}

const DEFENSE_NAME: Record<
  Extract<CombatFactV3, { type: 'defense' }>['defense'],
  string
> = {
  mana_shield: '法力护盾',
  damage_immune: '伤害免疫',
  dodge: '闪避',
  resist: '抵抗',
  dispel: '驱散',
  interrupt: '打断',
};

const ACTION_STATE_PHASE_NAME: Record<ActionStatePhase, string> = {
  entered: '进入',
  cancelled: '取消',
  skipped: '跳过',
  triggered: '触发',
};

function statusSuffix(fact: Extract<CombatFactV3, { type: 'status' }>): string {
  if (fact.operation !== 'apply') return '';
  const descriptions: string[] = [];
  if (fact.layers !== undefined && fact.layers > 1) {
    descriptions.push(`${fact.layers}层`);
  }
  if (fact.duration === -1) {
    descriptions.push('永久');
  } else if (fact.duration !== undefined && fact.duration > 0) {
    descriptions.push(`持续${fact.duration}回合`);
  }
  return descriptions.length ? `（${descriptions.join('，')}）` : '';
}

function mechanicText(
  fact: Extract<CombatFactV3, { type: 'mechanic' }>,
): string {
  switch (fact.operation) {
    case 'apply':
      return `施加「${fact.name}」`;
    case 'refresh':
      return `刷新「${fact.name}」`;
    case 'replace':
      return fact.previousName
        ? `将「${fact.previousName}」替换为「${fact.name}」`
        : `替换为「${fact.name}」`;
    case 'consume':
      return `消耗「${fact.name}」`;
    default:
      return `触发「${fact.name}」`;
  }
}

function mechanicDetailParts(
  fact: Extract<CombatFactV3, { type: 'mechanic' }>,
): PresentedLogPartV3[] {
  if (fact.detail && fact.value !== undefined) {
    return [
      part(`（${fact.detail}：`),
      part(String(fact.value), 'number', 'mechanic'),
      part('）'),
    ];
  }
  if (fact.detail) return [part(`（${fact.detail}）`)];
  if (fact.value !== undefined) {
    return [
      part('（数值：'),
      part(String(fact.value), 'number', 'mechanic'),
      part('）'),
    ];
  }
  return [];
}

export class CombatPresenterV3 {
  present(sequence: CombatSequenceV3): PresentedLogLineV3[] {
    const lines: PresentedLogLineV3[] = [];
    if (sequence.phase === 'battle_init') {
      lines.push({ role: 'system', parts: [part('【战斗开始】')] });
    } else if (sequence.phase === 'round_start') {
      lines.push({
        role: 'system',
        parts: [part(`【第 ${sequence.turn} 回合】`, 'text', 'secondary')],
      });
    } else if (sequence.phase === 'battle_end') {
      lines.push({
        role: 'system',
        parts: [
          part('【战斗结束】'),
          part(`「${sequence.actor?.name ?? '未知'}」`, 'unit'),
          part('获胜！', 'text', 'fatal', 'strong'),
        ],
      });
    } else if (sequence.phase === 'action' && sequence.actor) {
      lines.push({
        role: 'header',
        parts: [
          part(`「${sequence.actor.name}」`, 'unit'),
          sequence.ability
            ? part(`施放《${sequence.ability.name}》`, 'ability', 'ability')
            : part('采取行动'),
        ],
      });
    }

    const orderedFacts = [...sequence.facts].sort(
      (left, right) => left.trace.ordinal - right.trace.ordinal,
    );
    let previousAttribution: string | undefined;
    for (const fact of orderedFacts) {
      const currentAttribution = attributionKey(fact);
      const prefix =
        currentAttribution === previousAttribution
          ? []
          : attributionPrefix(fact);
      previousAttribution = currentAttribution;
      switch (fact.type) {
        case 'damage':
          lines.push({
            role: fact.damageSource === 'direct' ? 'primary' : 'secondary',
            parts: [
              ...prefix,
              part(`对「${fact.target.name}」造成 `),
              part(String(fact.amount), 'number', 'damage', 'strong'),
              part(' 点伤害'),
              ...(fact.critical
                ? [part('（暴击）', 'text', 'damage', 'strong')]
                : []),
              ...(fact.shieldAbsorbed > 0
                ? [
                    part('，其中护盾吸收 '),
                    part(String(fact.shieldAbsorbed), 'number', 'shield'),
                    part(' 点'),
                  ]
                : []),
            ],
          });
          break;
        case 'recovery':
          if (fact.amount <= 0) break;
          lines.push({
            role: 'trigger',
            parts: [
              ...prefix,
              part(`使「${fact.target.name}」恢复 `),
              part(String(fact.amount), 'number', 'positive'),
              part(fact.resource === 'hp' ? ' 点气血' : ' 点法力'),
            ],
          });
          break;
        case 'shield':
          lines.push({
            role: 'trigger',
            parts: [
              ...prefix,
              part(`为「${fact.target.name}」提供 `),
              part(String(fact.amount), 'number', 'shield'),
              part(' 点护盾'),
            ],
          });
          break;
        case 'status':
          lines.push({
            role: 'trigger',
            parts: [
              ...prefix,
              part(
                fact.operation === 'apply'
                  ? `为「${fact.target.name}」施加「${fact.statusName}」`
                  : fact.operation === 'remove'
                    ? `移除「${fact.target.name}」的「${fact.statusName}」`
                    : `使「${fact.target.name}」免疫「${fact.statusName}」`,
              ),
              part(statusSuffix(fact)),
            ],
          });
          break;
        case 'death_prevented':
          lines.push({
            role: 'state',
            parts: [
              ...prefix,
              part(
                `使「${fact.target.name}」免于死亡`,
                'text',
                'defense',
                'strong',
              ),
            ],
          });
          break;
        case 'unit_died':
          lines.push({
            role: 'state',
            parts: [
              part(`「${fact.target.name}」`, 'unit'),
              part('被击败！', 'text', 'fatal', 'strong'),
            ],
          });
          break;
        case 'defense':
          lines.push({
            role: 'trigger',
            parts: [
              ...prefix,
              part(
                `为「${fact.target.name}」触发「${DEFENSE_NAME[fact.defense]}」`,
                'text',
                'defense',
              ),
              ...(fact.amount !== undefined
                ? [
                    part('，效果值 '),
                    part(String(fact.amount), 'number', 'defense'),
                  ]
                : []),
              ...(fact.detail ? [part(`（${fact.detail}）`)] : []),
            ],
          });
          break;
        case 'resource':
          lines.push({
            role: 'resource',
            parts: [
              ...prefix,
              part(`使「${fact.target.name}」的${fact.resourceName}由 `),
              part(String(fact.before), 'number', 'resource'),
              part(' 变为 '),
              part(String(fact.after), 'number', 'resource'),
            ],
          });
          break;
        case 'mechanic':
          lines.push({
            role: 'trigger',
            parts: [
              ...prefix,
              part(mechanicText(fact), 'text', 'mechanic'),
              ...mechanicDetailParts(fact),
            ],
          });
          break;
        case 'action_state':
          lines.push({
            role: 'state',
            parts: [
              ...prefix,
              part(
                `使「${fact.target.name}」${fact.name}：${
                  ACTION_STATE_PHASE_NAME[fact.phase]
                }`,
              ),
            ],
          });
          break;
      }
    }
    return lines;
  }

  format(sequence: CombatSequenceV3): string[] {
    return this.present(sequence).map((line) =>
      line.parts.map((entry) => entry.text).join(''),
    );
  }

  formatAll(sequences: CombatSequenceV3[]): string[] {
    return sequences.flatMap((sequence) => this.format(sequence));
  }
}

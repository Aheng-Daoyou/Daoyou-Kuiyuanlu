import { getMaterialTypeInfo } from '@shared/lib/gameConceptDisplay';
import { QUALITY_VALUES } from '@shared/types/constants';
import type { Material } from '@shared/types/cultivator';

export type BlackMarketDescriptionSensitivity =
  'vague' | 'moderate' | 'strong';

export type BlackMarketDescriptionHintItem = Pick<
  Material,
  'name' | 'description' | 'type' | 'element' | 'rank'
>;

export interface BlackMarketDescriptionHint {
  id: string;
  safeText: string;
  sensitivity: BlackMarketDescriptionSensitivity;
}

const SENSITIVITY_ORDER: BlackMarketDescriptionSensitivity[] = [
  'vague',
  'moderate',
  'strong',
];

function splitDescription(description?: string): string[] {
  if (!description) return [];
  return description
    .split(/[。；！？\n]/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length >= 6);
}

function isExplicitIdentity(
  clause: string,
  item: BlackMarketDescriptionHintItem,
): boolean {
  if (item.name && clause.includes(item.name)) return true;
  return QUALITY_VALUES.some((quality) => clause.includes(quality));
}

function genericHint(
  item: BlackMarketDescriptionHintItem,
  index: number,
): BlackMarketDescriptionHint {
  const typeInfo = getMaterialTypeInfo(item.type);
  const variants = [
    `它的形制仍能看出几分${typeInfo.label}的底子，只是被伪装掩住了。`,
    item.element
      ? `凑近之后，气息里隐隐有${item.element}行的痕迹。`
      : '凑近之后，气息驳杂，看不出明显的五行偏向。',
    '保存得不算差，但明显不是第一次经手。',
  ];
  return {
    id: `description-hint-${index}`,
    safeText: variants[index % variants.length],
    sensitivity: SENSITIVITY_ORDER[index % SENSITIVITY_ORDER.length],
  };
}

export function buildFallbackBlackMarketDescriptionHints(
  item: BlackMarketDescriptionHintItem,
): BlackMarketDescriptionHint[] {
  const safeClauses = splitDescription(item.description)
    .filter((clause) => !isExplicitIdentity(clause, item))
    .slice(0, 3);

  const hints: BlackMarketDescriptionHint[] = safeClauses.map(
    (safeText, index) => ({
      id: `description-hint-${index}`,
      safeText,
      sensitivity:
        SENSITIVITY_ORDER[index % SENSITIVITY_ORDER.length],
    }),
  );

  for (let index = hints.length; index < 3; index += 1) {
    hints.push(genericHint(item, index));
  }

  return hints;
}

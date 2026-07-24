import type { SectSubmissionCandidateData } from '@shared/contracts/sect';
import { QUALITY_ORDER, type Quality } from '@shared/types/constants';
import type { ItemSubmissionOption } from './ItemSubmissionDialog';

function itemFacts(candidate: SectSubmissionCandidateData): string[] {
  const item = candidate.item;
  const common = [item.quality, `数量 ${item.quantity}`];
  if (item.kind === 'pill')
    return [
      ...common,
      `丹类 ${item.family}`,
      ...(item.appearance ? [`品相 ${item.appearance}`] : []),
      ...item.traits.map((trait) => `功效 ${trait}`),
    ];
  if (item.kind === 'artifact')
    return [
      ...common,
      ...(item.slot ? [`部位 ${item.slot}`] : []),
      `完美词条 ${item.perfectAffixCount}`,
      ...(item.isEquipped ? ['已装备'] : []),
    ];
  return [
    ...common,
    `材料 ${item.materialType}`,
    ...(item.element ? [`属性 ${item.element}`] : []),
  ];
}

export function createItemSubmissionOptions(
  candidates: SectSubmissionCandidateData[],
  minimumQuality: Quality,
): ItemSubmissionOption[] {
  return [...candidates]
    .sort((left, right) => Number(right.eligible) - Number(left.eligible))
    .map((candidate) => ({
      id: candidate.item.id,
      title: candidate.item.name,
      facts: itemFacts(candidate),
      eligible: candidate.eligible,
      reasons: candidate.violations.map((item) => item.message),
      ...(QUALITY_ORDER[candidate.item.quality] > QUALITY_ORDER[minimumQuality]
        ? { warning: '该物品品质高于委托最低要求，奖励不会因此增加。' }
        : {}),
    }));
}

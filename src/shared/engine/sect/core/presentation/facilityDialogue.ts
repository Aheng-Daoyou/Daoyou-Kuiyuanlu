import type {
  SectConstructionProjectState,
  SectFacilityState,
} from '../domain';
import type {
  SectBenefitMetric,
  SectFacilityEffectSnapshot,
} from '../organization';

export type SectFacilityDialogueEmphasis =
  'level' | 'benefit' | 'progress' | 'warning';

export interface SectFacilityDialogueSegment {
  text: string;
  emphasis?: SectFacilityDialogueEmphasis;
}

function formatMetric(metric: SectBenefitMetric): string {
  if (metric.format === 'percent' && typeof metric.value === 'number')
    return `${Math.round(metric.value * 10_000) / 100}%`;
  if (metric.format === 'number' && typeof metric.value === 'number')
    return metric.value.toLocaleString('zh-CN');
  return String(metric.value);
}

export function describeSectFacilityStatus(args: {
  facilityLabel: string;
  facility: SectFacilityState;
  effect?: SectFacilityEffectSnapshot;
}): SectFacilityDialogueSegment[] {
  const metrics =
    args.effect?.metrics.filter((metric) => metric.key !== 'level') ?? [];
  const segments: SectFacilityDialogueSegment[] = [
    { text: `${args.facilityLabel}如今是` },
    { text: `${args.facility.level}级`, emphasis: 'level' },
    { text: '。' },
  ];
  if (args.effect?.summary.trim()) {
    segments.push({
      text: args.effect.summary.replace(/[。；]+$/u, ''),
      emphasis: 'benefit',
    });
    segments.push({ text: '。' });
  }
  if (metrics.length) {
    segments.push({
      text: metrics
        .map((metric) => `${metric.label}${formatMetric(metric)}`)
        .join('，'),
    });
    segments.push({ text: '。' });
  }
  return segments;
}

export function describeSectConstructionProject(args: {
  project: SectConstructionProjectState | null;
  facilityLabel?: string;
}): SectFacilityDialogueSegment[] {
  if (!args.project)
    return [{ text: '本周工程尚在议定，眼下没有正在推进的设施。' }];
  const percentage = Math.min(
    100,
    Math.floor((args.project.progress / args.project.target) * 100),
  );
  return [
    { text: `本周正在将${args.facilityLabel ?? '当前设施'}提升至` },
    { text: `${args.project.targetLevel}级`, emphasis: 'level' },
    { text: '，已经完成' },
    { text: `${percentage}%`, emphasis: 'progress' },
    {
      text: `，现有${args.project.progress.toLocaleString('zh-CN')}点，共需${args.project.target.toLocaleString('zh-CN')}点。`,
    },
  ];
}

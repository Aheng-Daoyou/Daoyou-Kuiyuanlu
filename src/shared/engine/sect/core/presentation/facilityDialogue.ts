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

const isPlayerFacingText = (value: string): boolean =>
  Boolean(value.trim()) && !/[A-Za-z_]/u.test(value);

function formatMetric(metric: SectBenefitMetric): string | undefined {
  if (
    metric.format === 'percent' &&
    typeof metric.value === 'number' &&
    Number.isFinite(metric.value)
  )
    return `${Math.round(metric.value * 10_000) / 100}%`;
  if (
    metric.format === 'number' &&
    typeof metric.value === 'number' &&
    Number.isFinite(metric.value)
  )
    return metric.value.toLocaleString('zh-CN');
  if (metric.format === 'text' && isPlayerFacingText(String(metric.value)))
    return String(metric.value);
  return undefined;
}

export function describeSectFacilityStatus(args: {
  facilityLabel: string;
  facility: SectFacilityState;
  effect?: SectFacilityEffectSnapshot;
}): SectFacilityDialogueSegment[] {
  const facilityLabel = isPlayerFacingText(args.facilityLabel)
    ? args.facilityLabel.trim()
    : '此处设施';
  const metrics =
    args.effect?.metrics
      .filter(
        (metric) =>
          metric.key !== 'level' &&
          isPlayerFacingText(metric.label) &&
          formatMetric(metric) !== undefined,
      )
      .map((metric) => ({
        label: metric.label.trim(),
        value: formatMetric(metric) as string,
      })) ?? [];
  const segments: SectFacilityDialogueSegment[] = [
    { text: `${facilityLabel}如今是` },
    { text: `${args.facility.level}级`, emphasis: 'level' },
    { text: '。' },
  ];
  if (args.effect?.summary.trim() && isPlayerFacingText(args.effect.summary)) {
    segments.push({
      text: args.effect.summary.replace(/[。；]+$/u, ''),
      emphasis: 'benefit',
    });
    segments.push({ text: '。' });
  }
  if (metrics.length) {
    segments.push({
      text: metrics
        .map((metric) => `${metric.label}${metric.value}`)
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
  const progress = Math.max(0, args.project.progress);
  const target = Math.max(0, args.project.target);
  const percentage =
    target > 0
      ? Math.min(100, Math.max(0, Math.floor((progress / target) * 100)))
      : 0;
  const facilityLabel =
    args.facilityLabel && isPlayerFacingText(args.facilityLabel)
      ? args.facilityLabel.trim()
      : '当前设施';
  return [
    { text: `本周正在将${facilityLabel}提升至` },
    { text: `${args.project.targetLevel}级`, emphasis: 'level' },
    { text: '，已经完成' },
    { text: `${percentage}%`, emphasis: 'progress' },
    {
      text: `，现有${progress.toLocaleString('zh-CN')}点，共需${target.toLocaleString('zh-CN')}点。`,
    },
  ];
}

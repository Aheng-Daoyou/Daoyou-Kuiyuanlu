import { InkButton, InkCard } from '@app/components/ui';
import type { SectTaskViewData } from '@shared/contracts/sect';

const STATE_LABEL: Record<SectTaskViewData['state'], string> = {
  offered: '待揭榜',
  active: '办理中',
  claimable: '待领赏',
  claimed: '已结清',
  locked: '未开放',
};

export function SectTaskNotice({
  task,
  onOpen,
}: {
  task: SectTaskViewData;
  onOpen(): void;
}) {
  const muted = task.state === 'claimed' || task.state === 'locked';
  return (
    <InkCard
      highlighted={task.state === 'claimable'}
      className={muted ? 'opacity-65' : undefined}
    >
      <article className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <strong className="text-base">{task.presentation.title}</strong>
          <span className="shrink-0 text-xs text-stone-500">
            {STATE_LABEL[task.state]}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">
          {task.presentation.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
          {task.presentation.metadata.slice(0, 2).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="mt-auto pt-4">
          <InkButton
            variant={task.state === 'claimable' ? 'primary' : 'secondary'}
            onClick={onOpen}
          >
            {task.state === 'claimable' ? '交卷领赏' : '查看告示'}
          </InkButton>
        </div>
      </article>
    </InkCard>
  );
}

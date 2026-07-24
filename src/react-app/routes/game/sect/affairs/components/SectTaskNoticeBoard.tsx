import type { SectTaskViewData } from '@shared/contracts/sect';
import { SectTaskNotice } from './SectTaskNotice';

export function SectTaskNoticeBoard({
  tasks,
  onOpen,
}: {
  tasks: SectTaskViewData[];
  onOpen(task: SectTaskViewData): void;
}) {
  const actionableCount = tasks.filter(
    (task) => task.state === 'offered' || task.state === 'active',
  ).length;
  const claimableCount = tasks.filter(
    (task) => task.state === 'claimable',
  ).length;
  return (
    <section
      aria-label="宗门事务告示榜"
      className="bg-[linear-gradient(145deg,rgba(120,91,54,0.08),rgba(255,255,255,0.12))] p-3 md:p-5"
    >
      <header className="mb-4 flex items-end justify-between gap-4 border-b border-stone-800/15 pb-3">
        <div>
          <h2 className="text-lg font-semibold">宗门事务告示榜</h2>
          <p className="mt-1 text-xs text-stone-500">揭榜 · 办差 · 交卷领赏</p>
        </div>
        <p className="shrink-0 text-right text-xs text-stone-500">
          {claimableCount > 0
            ? `${claimableCount} 张待领赏`
            : `${actionableCount} 张可办理`}
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tasks.map((task) => (
          <SectTaskNotice
            key={`${task.periodKey}:${task.definitionId}`}
            task={task}
            onOpen={() => onOpen(task)}
          />
        ))}
      </div>
    </section>
  );
}

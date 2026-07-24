import type { SectTaskViewData } from '@shared/contracts/sect';

const STATE_ORDER: Record<SectTaskViewData['state'], number> = {
  claimable: 0,
  active: 1,
  offered: 2,
  locked: 3,
  claimed: 4,
};

const KIND_ORDER: Record<SectTaskViewData['kind'], number> = {
  daily: 0,
  weekly: 1,
  promotion: 2,
};

export function sortSectTaskNotices(
  tasks: SectTaskViewData[],
): SectTaskViewData[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (left, right) =>
        STATE_ORDER[left.task.state] - STATE_ORDER[right.task.state] ||
        KIND_ORDER[left.task.kind] - KIND_ORDER[right.task.kind] ||
        left.index - right.index,
    )
    .map(({ task }) => task);
}

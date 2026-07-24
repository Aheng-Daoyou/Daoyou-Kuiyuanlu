import { InkModal } from '@app/components/layout/InkModal';
import { InkNotice } from '@app/components/ui';
import type { SectTaskViewData } from '@shared/contracts/sect';
import { describeSectDeliveryRequirement } from '@shared/engine/sect';
import { SectTaskActionRenderer } from './SectTaskActionRenderer';

export function SectTaskDetailDialog({
  task,
  onClose,
}: {
  task?: SectTaskViewData;
  onClose(): void;
}) {
  if (!task) return null;
  return (
    <InkModal
      isOpen
      onClose={onClose}
      title={task.presentation.title}
      footer={
        task.actions.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            {task.actions.map((action) => (
              <SectTaskActionRenderer
                key={action.key}
                task={task}
                action={action}
              />
            ))}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4 text-sm leading-7">
        <p>{task.presentation.description}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-stone-500">
          {task.presentation.metadata.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        {task.requirement ? (
          <InkNotice>
            交付要求：{describeSectDeliveryRequirement(task.requirement)}
          </InkNotice>
        ) : null}
        {task.progress.target > 1 || task.state === 'active' ? (
          <p>
            当前进度 {task.progress.current} / {task.progress.target}
          </p>
        ) : null}
        {task.reward ? (
          <div>
            <p className="font-semibold">结算赏赐</p>
            {task.reward.summary.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : (
          <p>完成并结清后，将取得对应宗门资格。</p>
        )}
        {task.state === 'claimable' ? (
          <p className="text-crimson">回执已成，赏赐尚未入账。</p>
        ) : task.state === 'claimed' ? (
          <p className="text-stone-500">本期委托已经结清。</p>
        ) : task.state === 'locked' ? (
          <p className="text-stone-500">
            {task.actions[0]?.disabledReason ?? '当前尚未开放'}
          </p>
        ) : null}
      </div>
    </InkModal>
  );
}

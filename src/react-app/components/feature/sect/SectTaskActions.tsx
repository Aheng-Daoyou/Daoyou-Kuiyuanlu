import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui';
import type { SectTaskViewData } from '@shared/contracts/sect';
import { describeSectDeliveryRequirement } from '@shared/engine/sect';
import { useState } from 'react';
import { useSectTaskInteraction } from './SectTaskInteractionProvider';
import { SectTaskSubmissionDialog } from './SectTaskSubmissionDialog';

export type SectTaskViewAction = SectTaskViewData['actions'][number];

export interface SectTaskActionRendererProps {
  task: SectTaskViewData;
  action: SectTaskViewAction;
}

function rewardLines(task: SectTaskViewData) {
  return task.reward?.summary ?? ['此任务结清后授予对应宗门资格'];
}

export function AcceptAction({ task, action }: SectTaskActionRendererProps) {
  const { busy, execute } = useSectTaskInteraction();
  const { openDialog } = useInkUI();
  return (
    <InkButton
      variant="primary"
      disabled={busy || !action.enabled || !task.offerRevision}
      onClick={() =>
        openDialog({
          title: task.presentation.title,
          content: (
            <div className="space-y-3 text-sm leading-7">
              <p>{task.presentation.description}</p>
              {task.requirement ? (
                <p>
                  要求：
                  {describeSectDeliveryRequirement(task.requirement)}
                </p>
              ) : null}
              <div>
                {rewardLines(task).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <p className="text-stone-500">本任务每个周期只可完成一次。</p>
            </div>
          ),
          confirmLabel: '揭下告示',
          cancelLabel: '再看看',
          onConfirm: async () => {
            await execute(
              task,
              action,
              { offerRevision: task.offerRevision },
              `已领取「${task.presentation.title}」`,
            );
          },
        })
      }
    >
      {action.enabled ? action.label : (action.disabledReason ?? '尚未解锁')}
    </InkButton>
  );
}

export function ClaimAction({ task, action }: SectTaskActionRendererProps) {
  const { busy, execute } = useSectTaskInteraction();
  return (
    <InkButton
      variant="primary"
      disabled={busy || !action.enabled}
      onClick={() =>
        void execute(task, action, {}, `「${task.presentation.title}」已结清`)
      }
    >
      {action.enabled ? action.label : (action.disabledReason ?? '尚未解锁')}
    </InkButton>
  );
}

export function BattleAction({ task, action }: SectTaskActionRendererProps) {
  const { busy, navigate } = useSectTaskInteraction();
  return (
    <InkButton
      variant="primary"
      disabled={busy || !action.enabled}
      onClick={() =>
        navigate(
          `/game/sect/tasks/${encodeURIComponent(task.definitionId)}/battle?attemptId=${crypto.randomUUID()}`,
        )
      }
    >
      {action.enabled ? action.label : (action.disabledReason ?? '尚未解锁')}
    </InkButton>
  );
}

export function SweepEntryAction({ action }: SectTaskActionRendererProps) {
  const { busy, navigate } = useSectTaskInteraction();
  return (
    <InkButton
      variant="primary"
      disabled={busy || !action.enabled}
      onClick={() => navigate('/game/sect/gate')}
    >
      {action.enabled ? action.label : (action.disabledReason ?? '尚未解锁')}
    </InkButton>
  );
}

export function ItemDeliveryAction(props: SectTaskActionRendererProps) {
  const [open, setOpen] = useState(false);
  const { busy } = useSectTaskInteraction();
  return (
    <>
      <InkButton
        variant="primary"
        disabled={busy || !props.action.enabled}
        onClick={() => setOpen(true)}
      >
        {props.action.enabled
          ? props.action.label
          : (props.action.disabledReason ?? '尚未解锁')}
      </InkButton>
      <SectTaskSubmissionDialog
        open={open}
        task={props.task}
        action={props.action}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

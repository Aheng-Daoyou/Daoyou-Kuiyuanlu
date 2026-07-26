import {
  NpcConversation,
  RoomView,
  type NpcConversationMessage,
  type NpcConversationOption,
  type RoomActorView,
} from '@app/components/feature/room';
import { useSectPresentation } from '@app/components/feature/sect/SectQueryProvider';
import { SectTaskActionRenderer } from '@app/components/feature/sect/SectTaskActionRenderer';
import { useSectTaskInteraction } from '@app/components/feature/sect/SectTaskInteractionProvider';
import {
  decodeSectTaskOutcome,
  readRewardReceiptOutcome,
} from '@app/components/feature/sect/sectTaskOutcomeRegistry';
import type { SectTaskViewData } from '@shared/contracts/sect';
import type {
  SectAffairsTaskKind,
  SectRoomNpcPresentation,
  SectTaskDialogueEmphasis,
  SectTaskDialogueSegment,
} from '@shared/engine/sect';
import { useMemo, useState } from 'react';

const TASK_KINDS: readonly SectAffairsTaskKind[] = [
  'daily',
  'weekly',
  'promotion',
];

const STATE_ORDER: Record<SectTaskViewData['state'], number> = {
  claimable: 0,
  active: 1,
  offered: 2,
  claimed: 3,
  locked: 4,
};

const SEGMENT_CLASS: Record<SectTaskDialogueEmphasis, string> = {
  quantity: 'text-crimson font-medium',
  quality: 'text-tier-xuan font-medium',
  effect: 'text-teal font-medium',
  appearance: 'text-crimson font-medium',
  warning: 'text-crimson font-medium',
};

const LEAVE_CONVERSATION_OPTION = 'leave-conversation';
const RETURN_TO_TASKS_OPTION = 'return-to-tasks';

function taskKey(task: SectTaskViewData): string {
  return `${task.periodKey}:${task.definitionId}`;
}

function sortTasks(tasks: readonly SectTaskViewData[]): SectTaskViewData[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (left, right) =>
        STATE_ORDER[left.task.state] - STATE_ORDER[right.task.state] ||
        left.index - right.index,
    )
    .map(({ task }) => task);
}

function visibleTasks(tasks: readonly SectTaskViewData[]): SectTaskViewData[] {
  return tasks.filter((task) => task.state !== 'locked');
}

function npcStatus(
  tasks: readonly SectTaskViewData[],
  kind: SectAffairsTaskKind,
): RoomActorView['status'] {
  const visible = visibleTasks(tasks);
  if (visible.some((task) => task.state === 'claimable'))
    return { label: '有事务待交回', tone: 'attention' };
  if (visible.some((task) => task.state === 'active'))
    return { label: '有事务正在办理', tone: 'active' };
  if (visible.some((task) => task.state === 'offered')) {
    const label =
      kind === 'daily'
        ? '有新的今日委托'
        : kind === 'weekly'
          ? '有新的本周事务'
          : '可询问晋升事务';
    return { label, tone: 'attention' };
  }
  if (visible.some((task) => task.state === 'claimed'))
    return { label: '本期已结清', tone: 'muted' };
  return { label: '暂无事务', tone: 'muted' };
}

function taskTitles(tasks: readonly SectTaskViewData[]): string {
  return tasks.map((task) => `「${task.presentation.title}」`).join('、');
}

function npcOpening(
  npc: SectRoomNpcPresentation,
  tasks: readonly SectTaskViewData[],
): string {
  const visible = visibleTasks(tasks);
  const clauses = [
    visible.some((task) => task.state === 'offered')
      ? `眼下可接的有${taskTitles(visible.filter((task) => task.state === 'offered'))}`
      : undefined,
    visible.some((task) => task.state === 'active')
      ? `${taskTitles(visible.filter((task) => task.state === 'active'))}还在你名下`
      : undefined,
    visible.some((task) => task.state === 'claimable')
      ? `${taskTitles(visible.filter((task) => task.state === 'claimable'))}已经可以交回`
      : undefined,
  ].filter((clause): clause is string => Boolean(clause));

  if (clauses.length > 0) return `${npc.greeting} ${clauses.join('；')}。`;
  if (visible.some((task) => task.state === 'claimed'))
    return `${npc.greeting} 本期差事都已结清，若要查账便问我。`;
  return `${npc.greeting} 眼下没有需要你经办的事务。`;
}

function taskReply(task: SectTaskViewData): string {
  const dialogue = task.presentation.dialogue;
  if (task.state === 'offered') return dialogue.offeredReply;
  if (task.state === 'active') return dialogue.activeReply;
  if (task.state === 'claimable') return dialogue.claimableReply;
  return dialogue.claimedReply;
}

function TaskInstruction({
  segments,
}: {
  segments: readonly SectTaskDialogueSegment[];
}) {
  return (
    <>
      {segments.map((segment, index) => (
        <span
          key={`${index}:${segment.text}`}
          className={
            segment.emphasis ? SEGMENT_CLASS[segment.emphasis] : undefined
          }
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

export function SectAffairsRoom({
  tasks,
}: {
  tasks: readonly SectTaskViewData[];
}) {
  const presentation = useSectPresentation().affairsRoom;
  const interaction = useSectTaskInteraction();
  const [selectedKind, setSelectedKind] = useState<SectAffairsTaskKind>();
  const [selectedTaskKey, setSelectedTaskKey] = useState<string>();

  const groupedTasks = useMemo(
    () =>
      Object.fromEntries(
        TASK_KINDS.map((kind) => [
          kind,
          sortTasks(tasks.filter((task) => task.kind === kind)),
        ]),
      ) as Record<SectAffairsTaskKind, SectTaskViewData[]>,
    [tasks],
  );

  const actors = useMemo<RoomActorView[]>(
    () =>
      TASK_KINDS.map((kind) => {
        const npc = presentation.taskNpcs[kind];
        return {
          id: npc.id,
          sigil: npc.sigil,
          name: npc.name,
          identity: npc.identity,
          responsibility: npc.responsibility,
          status: npcStatus(groupedTasks[kind], kind),
        };
      }),
    [groupedTasks, presentation.taskNpcs],
  );

  const selectedNpc = selectedKind
    ? presentation.taskNpcs[selectedKind]
    : undefined;
  const selectedTask = selectedKind
    ? groupedTasks[selectedKind].find(
        (task) => taskKey(task) === selectedTaskKey,
      )
    : undefined;

  const selectActor = (actorId: string) => {
    const kind = TASK_KINDS.find(
      (candidate) => presentation.taskNpcs[candidate].id === actorId,
    );
    if (!kind) return;
    interaction.clearOutcome();
    setSelectedKind(kind);
    setSelectedTaskKey(undefined);
  };

  const selectTask = async (task: SectTaskViewData) => {
    interaction.clearOutcome();
    if (task.state === 'offered') {
      const action = task.actions.find(
        (candidate) => candidate.key === 'accept',
      );
      if (!action?.enabled || !task.offerRevision) return;
      const result = await interaction.execute(
        task,
        action,
        { offerRevision: task.offerRevision },
        `已接下「${task.presentation.title}」`,
      );
      if (result) setSelectedTaskKey(taskKey(result.task));
      return;
    }
    if (task.state === 'claimable') {
      const action = task.actions.find(
        (candidate) => candidate.key === 'claim',
      );
      if (!action?.enabled) return;
      const result = await interaction.execute(
        task,
        action,
        {},
        `「${task.presentation.title}」已结清`,
      );
      if (result) setSelectedTaskKey(taskKey(result.task));
      return;
    }
    setSelectedTaskKey(taskKey(task));
  };

  const leaveConversation = () => {
    interaction.clearOutcome();
    setSelectedKind(undefined);
    setSelectedTaskKey(undefined);
  };

  return (
    <RoomView
      eyebrow="宗门公牍 · 当值录事"
      description={presentation.description}
      actors={actors}
      selectedId={selectedNpc?.id}
      onSelect={selectActor}
      prompt="点击人物，与其交谈"
      detail={
        selectedNpc && selectedKind ? (
          selectedTask ? (
            <TaskConversation
              npc={selectedNpc}
              task={selectedTask}
              onExit={leaveConversation}
              onBack={() => {
                interaction.clearOutcome();
                setSelectedTaskKey(undefined);
              }}
            />
          ) : (
            <TaskListConversation
              npc={selectedNpc}
              tasks={groupedTasks[selectedKind]}
              busy={interaction.busy}
              error={interaction.error}
              onSelect={(task) => void selectTask(task)}
              onExit={leaveConversation}
            />
          )
        ) : undefined
      }
    />
  );
}

function TaskListConversation({
  npc,
  tasks,
  busy,
  error,
  onSelect,
  onExit,
}: {
  npc: SectRoomNpcPresentation;
  tasks: readonly SectTaskViewData[];
  busy: boolean;
  error?: string;
  onSelect(task: SectTaskViewData): void;
  onExit(): void;
}) {
  const visible = visibleTasks(tasks);
  const options: NpcConversationOption[] = [
    ...visible.map((task) => ({
      id: taskKey(task),
      label: taskReply(task),
      tone:
        task.state === 'claimable'
          ? ('primary' as const)
          : task.state === 'claimed'
            ? ('muted' as const)
            : ('normal' as const),
    })),
    {
      id: LEAVE_CONVERSATION_OPTION,
      label: '弟子告退',
      tone: 'muted',
    },
  ];
  const messages: NpcConversationMessage[] = [
    {
      id: 'greeting',
      speaker: npc.name,
      body: npcOpening(npc, tasks),
    },
  ];
  const taskByKey = new Map(visible.map((task) => [taskKey(task), task]));

  return (
    <NpcConversation
      actor={npc}
      messages={messages}
      options={options}
      busy={busy}
      error={error}
      onSelectOption={(optionId) => {
        if (optionId === LEAVE_CONVERSATION_OPTION) {
          onExit();
          return;
        }
        const task = taskByKey.get(optionId);
        if (task) onSelect(task);
      }}
    />
  );
}

function TaskConversation({
  npc,
  task,
  onBack,
  onExit,
}: {
  npc: SectRoomNpcPresentation;
  task: SectTaskViewData;
  onBack(): void;
  onExit(): void;
}) {
  const interaction = useSectTaskInteraction();
  const outcomeTask =
    interaction.outcome?.task.definitionId === task.definitionId
      ? interaction.outcome.task
      : undefined;
  const currentTask = outcomeTask ?? task;
  const currentOutcome =
    interaction.outcome?.task.definitionId === task.definitionId
      ? interaction.outcome.outcome
      : undefined;
  const decoded = currentOutcome
    ? decodeSectTaskOutcome(currentOutcome)
    : undefined;
  const receipt =
    decoded?.ok === true ? readRewardReceiptOutcome(decoded.value) : undefined;

  const messages: NpcConversationMessage[] = [];
  if (receipt) {
    messages.push({
      id: 'reward-receipt',
      speaker: npc.name,
      body: (
        <>
          此事已经结清。宗门贡献 +{receipt.rewards.contribution}，修为 +
          {receipt.rewards.cultivationExp.toLocaleString()}，灵石 +
          {receipt.rewards.spiritStones.toLocaleString()}，均已入账。
        </>
      ),
      tone: 'attention',
    });
  } else if (currentTask.state === 'claimed') {
    messages.push({
      id: 'claimed',
      speaker: npc.name,
      body: (
        <>
          此事本期已经结清。
          {currentTask.reward?.summary.length
            ? `${currentTask.reward.summary.join('，')}，都已记入功簿。`
            : '功簿上已经留有记录。'}
        </>
      ),
    });
  } else if (
    decoded?.ok &&
    decoded.value.renderer === 'sect.outcome.fulfilled'
  ) {
    messages.push({
      id: 'fulfilled',
      speaker: npc.name,
      body: '带来的东西已经验明，回执也已写好，现在可以交回结清。',
      tone: 'attention',
    });
  } else {
    messages.push({
      id: 'instruction',
      speaker: npc.name,
      body: (
        <TaskInstruction
          segments={currentTask.presentation.dialogue.instruction}
        />
      ),
    });
  }

  if (decoded?.ok === false) {
    messages.push({
      id: 'outcome-error',
      body: decoded.error,
      tone: 'attention',
    });
  }

  const visibleActions =
    currentTask.state === 'active' || currentTask.state === 'claimable'
      ? currentTask.actions
      : [];
  const options: NpcConversationOption[] = [
    {
      id: RETURN_TO_TASKS_OPTION,
      label: '我再问问别的',
    },
    {
      id: LEAVE_CONVERSATION_OPTION,
      label: '弟子告退',
      tone: 'muted',
    },
  ];

  return (
    <NpcConversation
      actor={npc}
      messages={messages}
      busy={interaction.busy}
      error={interaction.error}
      actions={
        visibleActions.length > 0
          ? visibleActions.map((action) => (
              <SectTaskActionRenderer
                key={action.key}
                task={currentTask}
                action={action}
                display="conversation"
              />
            ))
          : undefined
      }
      options={options}
      onSelectOption={(optionId) => {
        if (optionId === RETURN_TO_TASKS_OPTION) {
          onBack();
          return;
        }
        if (optionId === LEAVE_CONVERSATION_OPTION) onExit();
      }}
    />
  );
}

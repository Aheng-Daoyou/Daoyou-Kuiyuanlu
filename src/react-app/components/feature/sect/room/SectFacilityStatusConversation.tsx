import {
  NpcConversation,
  useConversationSession,
  type NpcConversationMessage,
  type NpcConversationOption,
} from '@app/components/feature/room';
import {
  useSectCurrentQuery,
  useSectPresentation,
  useSectResourceQuery,
} from '@app/components/feature/sect/SectQueryProvider';
import {
  createSectTaskBattleHref,
  isSectTaskActivityLocationKey,
  readSectTaskActivityLocation,
} from '@app/components/feature/sect/sectTaskActivityLocations';
import { fetchSectTasks } from '@app/lib/sect/sectClient';
import {
  describeSectFacilityStatus,
  type SectFacilityDialogueEmphasis,
} from '@shared/engine/sect';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { SectNpcConversationRendererProps } from './SectNpcConversationRegistry';

const emphasisClass: Record<SectFacilityDialogueEmphasis, string> = {
  level: 'text-crimson font-medium',
  benefit: 'text-teal font-medium',
  progress: 'text-crimson font-medium',
  warning: 'text-crimson font-medium',
};

const readText = (
  parameters: Readonly<Record<string, unknown>>,
  key: string,
) => {
  const value = parameters[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

export function SectFacilityStatusConversation({
  actor,
  parameters,
  onExit,
}: SectNpcConversationRendererProps) {
  const current = useSectCurrentQuery();
  const tasks = useSectResourceQuery('tasks', fetchSectTasks);
  const presentation = useSectPresentation();
  const navigate = useNavigate();
  const [showStatus, setShowStatus] = useState(false);
  const facilityKey = readText(parameters, 'facilityKey');
  const effectKey = readText(parameters, 'effectKey') ?? facilityKey;
  const statusReply = readText(parameters, 'statusReply') ?? '请说说这里的近况';
  const detail = readText(parameters, 'detail');
  const rawLocationKey = parameters.locationKey;
  const locationKey = isSectTaskActivityLocationKey(rawLocationKey)
    ? rawLocationKey
    : undefined;
  const snapshot = useMemo(
    () => ({ current: current.data, tasks: tasks.data }),
    [current.data, tasks.data],
  );
  const session = useConversationSession({
    sessionKey: actor.id,
    snapshot,
    load: async () => {
      await Promise.all([
        current.reload(),
        locationKey ? tasks.reload() : Promise.resolve(),
      ]);
    },
    perform: async () => undefined,
  });
  const facility = facilityKey
    ? current.data?.overview?.facilities.find(
        (candidate) => candidate.key === facilityKey,
      )
    : undefined;
  const effect = effectKey
    ? (current.data?.benefits ?? current.data?.overview?.benefits)
        ?.facilityEffects[effectKey]
    : undefined;
  const facilityLabel = facilityKey
    ? (presentation.facilityLabels[facilityKey] ?? '此处设施')
    : '此处设施';
  const locationTask = locationKey
    ? tasks.data?.items.find(
        (task) =>
          (task.state === 'active' || task.state === 'claimable') &&
          task.actions.some(
            (action) =>
              readSectTaskActivityLocation(action)?.key === locationKey,
          ),
      )
    : undefined;
  const battleAction = locationTask?.actions.find(
    (action) =>
      action.renderer === 'sect.action.battle' &&
      readSectTaskActivityLocation(action)?.key === locationKey,
  );

  const messages: NpcConversationMessage[] = [
    {
      id: 'greeting',
      speaker: actor.name,
      body: actor.greeting,
    },
  ];
  if (showStatus && facility) {
    const segments = describeSectFacilityStatus({
      facilityLabel,
      facility,
      effect,
    });
    const stages = Array.isArray(parameters.stages)
      ? parameters.stages.filter(
          (stage): stage is string =>
            typeof stage === 'string' && Boolean(stage.trim()),
        )
      : [];
    messages.push({
      id: 'status',
      speaker: actor.name,
      body: (
        <>
          {segments.map((segment, index) => (
            <span
              key={`${index}:${segment.text}`}
              className={
                segment.emphasis ? emphasisClass[segment.emphasis] : undefined
              }
            >
              {segment.text}
            </span>
          ))}
          {stages.length
            ? `眼下正是“${stages[Math.min(stages.length - 1, Math.max(0, facility.level - 1))]}”的长势。`
            : null}
          {detail}
        </>
      ),
    });
  }
  if (locationTask?.state === 'claimable') {
    messages.push({
      id: 'claimable',
      speaker: actor.name,
      body: `${locationTask.presentation.title}的回执已经写成，该回事务堂复命了。`,
      tone: 'attention',
    });
  }

  const options: NpcConversationOption[] = [
    {
      id: 'status',
      label: statusReply,
    },
    ...(locationTask?.state === 'active' && battleAction?.enabled
      ? [
          {
            id: 'start-activity',
            label: battleAction.label,
            tone: 'primary' as const,
          },
        ]
      : []),
    { id: 'leave', label: '弟子告退', tone: 'muted' },
  ];

  return (
    <NpcConversation
      actor={actor}
      messages={messages}
      options={options}
      busy={
        session.phase === 'loading' ||
        session.phase === 'submitting' ||
        current.loading ||
        tasks.loading
      }
      error={session.error ?? current.error ?? tasks.error}
      onSelectOption={(optionId) => {
        if (optionId === 'leave') {
          onExit();
          return;
        }
        if (optionId === 'status') {
          setShowStatus(true);
          return;
        }
        if (
          optionId === 'start-activity' &&
          locationKey &&
          locationTask &&
          battleAction?.enabled
        )
          navigate(
            createSectTaskBattleHref(locationTask.definitionId, locationKey),
          );
      }}
    />
  );
}

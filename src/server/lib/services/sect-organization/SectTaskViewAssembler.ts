import type { SectTaskViewData } from '@shared/contracts/sect';
import {
  describeSectDeliveryRequirement,
  type SectTaskDefinition,
  type SectTaskOfferSnapshot,
} from '@shared/engine/sect';
import type { SectTaskRecord } from './ports';
import type { SectTaskExecutor } from './task-executors/SectTaskExecutor';

function taskMetadata(
  definition: SectTaskDefinition,
  offer: SectTaskOfferSnapshot,
): string[] {
  return [
    definition.kind === 'daily'
      ? '日常委托'
      : definition.kind === 'weekly'
        ? '周常委托'
        : '晋升试炼',
    `难度：${offer.difficulty}`,
    ...(offer.requirement
      ? [describeSectDeliveryRequirement(offer.requirement)]
      : []),
  ];
}

export function toSectTaskView(args: {
  definition: SectTaskDefinition;
  record: SectTaskRecord;
  state: SectTaskViewData['state'];
  executor: SectTaskExecutor;
  enabled: boolean;
  disabledReason?: string;
}): SectTaskViewData {
  const offer = args.record.payload.offer;
  const actions =
    args.state === 'claimed'
      ? []
      : args.state === 'claimable'
        ? [
            {
              key: 'claim',
              renderer: 'sect.action.claim',
              label: '领取赏赐',
              enabled: args.enabled,
              ...(args.disabledReason
                ? { disabledReason: args.disabledReason }
                : {}),
            },
          ]
        : args.state === 'offered' || args.state === 'locked'
          ? [
              {
                key: 'accept',
                renderer: 'sect.action.accept',
                label: '揭下告示',
                enabled: args.enabled,
                ...(args.disabledReason
                  ? { disabledReason: args.disabledReason }
                  : {}),
              },
            ]
          : args.executor
              .actions(args.definition, args.record)
              .map((action) => ({
                ...action,
                enabled: args.enabled,
                ...(args.disabledReason
                  ? { disabledReason: args.disabledReason }
                  : {}),
              }));
  return {
    id: args.record.id,
    definitionId: args.definition.id,
    kind: args.definition.kind,
    state: args.state,
    periodKey: args.record.periodKey,
    progress: {
      current: args.record.progress,
      target: args.record.payload.target,
    },
    difficulty: offer.difficulty,
    requirement: offer.requirement,
    reward: offer.reward,
    ...(args.state === 'offered' || args.state === 'locked'
      ? { offerRevision: offer.offerRevision }
      : {}),
    presentation: {
      title: args.definition.presentation.title,
      description: args.definition.presentation.description,
      metadata: taskMetadata(args.definition, offer),
    },
    actions,
  };
}

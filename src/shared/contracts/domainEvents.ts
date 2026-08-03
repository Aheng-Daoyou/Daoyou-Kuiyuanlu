import { ALCHEMY_MODE_VALUES } from '@shared/types/consumable';
import { z } from 'zod';

export const DOMAIN_EVENT_STREAM = 'DAOYOU_DOMAIN_EVENTS';
export const DOMAIN_EVENT_SUBJECT_PREFIX = 'daoyou.domain';

export const DOMAIN_EVENT_TYPES = [
  'sect.construction.donated',
  'alchemy.craft.completed',
  'ranking.challenge.completed',
  'dungeon.run.settled',
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export const DomainEventTypeSchema = z.enum(DOMAIN_EVENT_TYPES);

export const DomainEventDataSchemas = {
  'sect.construction.donated': z
    .object({
      cultivatorId: z.uuid(),
      sectId: z.string().min(1).max(64),
      facilityKey: z.string().min(1).max(32),
      spiritStones: z.number().int().positive(),
      constructionPoints: z.number().int().positive(),
      contribution: z.number().int().positive(),
      referenceId: z.string().min(1).max(256),
    })
    .strict(),
  'alchemy.craft.completed': z
    .object({
      cultivatorId: z.uuid(),
      actionInstanceId: z.uuid(),
      mode: z.enum(ALCHEMY_MODE_VALUES),
    })
    .strict(),
  'ranking.challenge.completed': z
    .object({
      cultivatorId: z.uuid(),
      opponentCultivatorId: z.uuid(),
      battleRecordId: z.uuid(),
    })
    .strict(),
  'dungeon.run.settled': z
    .object({
      cultivatorId: z.uuid(),
      runId: z.uuid(),
      mapNodeId: z.string().min(1).max(100),
      outcome: z.enum([
        'completed',
        'retreated_after_battle',
        'abandoned_before_battle',
      ]),
    })
    .strict(),
} as const;

export type DomainEventData<TType extends DomainEventType> = z.infer<
  (typeof DomainEventDataSchemas)[TType]
>;

export const DOMAIN_EVENT_DEFINITIONS = {
  'sect.construction.donated': {
    version: 1,
    subject: `${DOMAIN_EVENT_SUBJECT_PREFIX}.sect.construction-donated.v1`,
  },
  'alchemy.craft.completed': {
    version: 1,
    subject: `${DOMAIN_EVENT_SUBJECT_PREFIX}.activity.alchemy-craft-completed.v1`,
  },
  'ranking.challenge.completed': {
    version: 1,
    subject: `${DOMAIN_EVENT_SUBJECT_PREFIX}.activity.ranking-challenge-completed.v1`,
  },
  'dungeon.run.settled': {
    version: 1,
    subject: `${DOMAIN_EVENT_SUBJECT_PREFIX}.activity.dungeon-run-settled.v1`,
  },
} as const satisfies Record<
  DomainEventType,
  { version: number; subject: string }
>;

const DomainEventEnvelopeBaseSchema = z
  .object({
    id: z.uuid(),
    type: DomainEventTypeSchema,
    version: z.number().int().positive(),
    subject: z.string().min(1).max(160),
    occurredAt: z.string().datetime(),
    aggregate: z
      .object({
        type: z.string().min(1).max(64),
        id: z.string().min(1).max(128),
      })
      .strict(),
    correlationId: z.string().min(1).max(128).optional(),
    causationId: z.string().min(1).max(128).optional(),
    data: z.unknown(),
  })
  .strict();

export type DomainEventEnvelope<
  TType extends DomainEventType = DomainEventType,
> = {
  id: string;
  type: TType;
  version: number;
  subject: string;
  occurredAt: string;
  aggregate: { type: string; id: string };
  correlationId?: string;
  causationId?: string;
  data: DomainEventData<TType>;
};

export function parseDomainEventEnvelope(input: unknown): DomainEventEnvelope {
  const envelope = DomainEventEnvelopeBaseSchema.parse(input);
  const definition = DOMAIN_EVENT_DEFINITIONS[envelope.type];
  if (
    envelope.version !== definition.version ||
    envelope.subject !== definition.subject
  ) {
    throw new Error(
      `领域事件定义不匹配: ${envelope.type}@v${envelope.version} subject=${envelope.subject}`,
    );
  }

  return {
    ...envelope,
    data: DomainEventDataSchemas[envelope.type].parse(envelope.data),
  } as DomainEventEnvelope;
}

export function isDomainEventType<TType extends DomainEventType>(
  event: DomainEventEnvelope,
  type: TType,
): event is DomainEventEnvelope<TType> {
  return event.type === type;
}

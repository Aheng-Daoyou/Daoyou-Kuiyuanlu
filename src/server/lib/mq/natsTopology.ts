import { getJetStreamManager } from '@server/lib/nats';
import {
  DOMAIN_EVENT_STREAM,
  DOMAIN_EVENT_SUBJECT_PREFIX,
} from '@shared/contracts/domainEvents';
import {
  AckPolicy,
  DeliverPolicy,
  DiscardPolicy,
  nanos,
  ReplayPolicy,
  RetentionPolicy,
  StorageType,
  type ConsumerConfig,
  type ConsumerUpdateConfig,
  type StreamConfig,
} from 'nats';

export const DEAD_LETTER_STREAM = 'DAOYOU_DOMAIN_EVENT_DLQ';
export const DEAD_LETTER_SUBJECT_PREFIX = 'daoyou.dead-letter';

export const DOMAIN_EVENT_CONSUMERS = {
  sectFacilityProjector: {
    name: 'sect-facility-projector-v1',
    filterSubject: `${DOMAIN_EVENT_SUBJECT_PREFIX}.sect.construction-donated.v1`,
    concurrency: 4,
  },
  taskProjector: {
    name: 'task-projector-v1',
    filterSubject: `${DOMAIN_EVENT_SUBJECT_PREFIX}.activity.*.v1`,
    concurrency: 8,
  },
} as const;

const DOMAIN_EVENT_STREAM_CONFIG: Partial<StreamConfig> = {
  name: DOMAIN_EVENT_STREAM,
  description: 'Daoyou versioned domain integration events',
  subjects: [`${DOMAIN_EVENT_SUBJECT_PREFIX}.>`],
  retention: RetentionPolicy.Limits,
  storage: StorageType.File,
  discard: DiscardPolicy.Old,
  max_age: nanos(14 * 24 * 60 * 60 * 1_000),
  max_bytes: 3 * 1_024 * 1_024 * 1_024,
  max_msg_size: 256 * 1_024,
  duplicate_window: nanos(2 * 60 * 1_000),
  num_replicas: 1,
  allow_direct: true,
};

const DEAD_LETTER_STREAM_CONFIG: Partial<StreamConfig> = {
  name: DEAD_LETTER_STREAM,
  description: 'Daoyou terminal domain event processing failures',
  subjects: [`${DEAD_LETTER_SUBJECT_PREFIX}.>`],
  retention: RetentionPolicy.Limits,
  storage: StorageType.File,
  discard: DiscardPolicy.Old,
  max_age: nanos(30 * 24 * 60 * 60 * 1_000),
  max_bytes: 1 * 1_024 * 1_024 * 1_024,
  max_msg_size: 512 * 1_024,
  duplicate_window: nanos(2 * 60 * 1_000),
  num_replicas: 1,
  allow_direct: true,
};

const CONSUMER_BACKOFF = [
  1_000,
  5_000,
  15_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
].map(nanos);

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String(error.code) === '404'
  );
}

async function ensureStream(config: Partial<StreamConfig> & { name: string }) {
  const manager = await getJetStreamManager();
  try {
    const current = await manager.streams.info(config.name);
    await manager.streams.update(config.name, {
      ...current.config,
      ...config,
    });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    await manager.streams.add(config);
  }
}

async function ensureConsumer(input: {
  name: string;
  filterSubject: string;
  concurrency: number;
}) {
  const manager = await getJetStreamManager();
  const mutableConfig: Partial<ConsumerUpdateConfig> = {
    description: `Daoyou domain event consumer ${input.name}`,
    ack_wait: nanos(2 * 60 * 1_000),
    max_deliver: -1,
    max_ack_pending: input.concurrency,
    max_batch: input.concurrency,
    backoff: CONSUMER_BACKOFF,
    filter_subject: input.filterSubject,
  };
  try {
    await manager.consumers.info(DOMAIN_EVENT_STREAM, input.name);
    await manager.consumers.update(
      DOMAIN_EVENT_STREAM,
      input.name,
      mutableConfig,
    );
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    await manager.consumers.add(DOMAIN_EVENT_STREAM, {
      ...mutableConfig,
      durable_name: input.name,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      replay_policy: ReplayPolicy.Instant,
    } satisfies Partial<ConsumerConfig>);
  }
}

export async function ensureDomainEventTopology(): Promise<void> {
  await ensureStream(
    DOMAIN_EVENT_STREAM_CONFIG as Partial<StreamConfig> & { name: string },
  );
  await ensureStream(
    DEAD_LETTER_STREAM_CONFIG as Partial<StreamConfig> & { name: string },
  );
  await Promise.all(Object.values(DOMAIN_EVENT_CONSUMERS).map(ensureConsumer));
  console.info('[nats] JetStream topology ready', {
    stream: DOMAIN_EVENT_STREAM,
    consumers: Object.values(DOMAIN_EVENT_CONSUMERS).map(
      (consumer) => consumer.name,
    ),
  });
}

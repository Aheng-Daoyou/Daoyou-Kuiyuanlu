import { getJetStreamClient } from '@server/lib/nats';
import {
  DOMAIN_EVENT_STREAM,
  parseDomainEventEnvelope,
  type DomainEventEnvelope,
  type DomainEventType,
} from '@shared/contracts/domainEvents';
import { JSONCodec, type ConsumerMessages, type JsMsg } from 'nats';
import { DEAD_LETTER_STREAM, DEAD_LETTER_SUBJECT_PREFIX } from './natsTopology';

const MAX_PROCESSING_ATTEMPTS = 10;
const codec = JSONCodec();
const runningConsumers = new Set<ConsumerMessages>();
const activeHandlers = new Set<Promise<void>>();

type DomainEventConsumerRegistration = {
  consumerName: string;
  concurrency: number;
  acceptedTypes: readonly DomainEventType[];
  handle(event: DomainEventEnvelope): Promise<void>;
};

async function publishDeadLetter(
  registration: DomainEventConsumerRegistration,
  message: JsMsg,
  error: unknown,
): Promise<void> {
  const jetStream = await getJetStreamClient();
  const subject = `${DEAD_LETTER_SUBJECT_PREFIX}.${registration.consumerName}`;
  const errorMessage = error instanceof Error ? error.message : String(error);
  await jetStream.publish(
    subject,
    codec.encode({
      consumerName: registration.consumerName,
      originalSubject: message.subject,
      streamSequence: message.info.streamSequence,
      deliveryCount: message.info.deliveryCount,
      failedAt: new Date().toISOString(),
      error: errorMessage.slice(0, 2_000),
      payload: message.string(),
    }),
    {
      msgID: `${registration.consumerName}:${message.info.streamSequence}`,
      expect: { streamName: DEAD_LETTER_STREAM },
      timeout: 5_000,
    },
  );
}

async function processMessage(
  registration: DomainEventConsumerRegistration,
  message: JsMsg,
): Promise<void> {
  try {
    const event = parseDomainEventEnvelope(message.json());
    if (event.subject !== message.subject) {
      throw new Error(
        `领域事件 subject 与 NATS subject 不一致: ${event.subject} != ${message.subject}`,
      );
    }
    if (!registration.acceptedTypes.includes(event.type)) {
      throw new Error(
        `消费者 ${registration.consumerName} 不接受事件 ${event.type}`,
      );
    }

    await registration.handle(event);
    const acknowledged = await message.ackAck({ timeout: 5_000 });
    if (!acknowledged) throw new Error('JetStream 双向 ACK 未确认');
  } catch (error) {
    console.error('[domain-event-consumer] processing failed', {
      consumerName: registration.consumerName,
      subject: message.subject,
      deliveryCount: message.info.deliveryCount,
      streamSequence: message.info.streamSequence,
      error,
    });
    if (message.info.deliveryCount >= MAX_PROCESSING_ATTEMPTS) {
      try {
        await publishDeadLetter(registration, message, error);
        message.term();
      } catch (deadLetterError) {
        console.error('[domain-event-consumer] dead-letter publish failed', {
          consumerName: registration.consumerName,
          streamSequence: message.info.streamSequence,
          deadLetterError,
        });
        message.nak(60_000);
      }
      return;
    }
    message.nak();
  }
}

export async function startDomainEventConsumer(
  registration: DomainEventConsumerRegistration,
): Promise<void> {
  const jetStream = await getJetStreamClient();
  const consumer = await jetStream.consumers.get(
    DOMAIN_EVENT_STREAM,
    registration.consumerName,
  );
  const messages = await consumer.consume({
    max_messages: registration.concurrency,
  });
  runningConsumers.add(messages);

  void (async () => {
    const consumerHandlers = new Set<Promise<void>>();
    try {
      for await (const message of messages) {
        const handler = processMessage(registration, message).finally(() => {
          activeHandlers.delete(handler);
          consumerHandlers.delete(handler);
        });
        activeHandlers.add(handler);
        consumerHandlers.add(handler);
        if (consumerHandlers.size >= registration.concurrency) {
          await Promise.race(consumerHandlers);
        }
      }
    } catch (error) {
      console.error('[domain-event-consumer] consumer loop stopped', {
        consumerName: registration.consumerName,
        error,
      });
    } finally {
      runningConsumers.delete(messages);
    }
  })();

  console.info('[domain-event-consumer] started', {
    consumerName: registration.consumerName,
    concurrency: registration.concurrency,
  });
}

export async function stopDomainEventConsumers(): Promise<void> {
  await Promise.allSettled(
    [...runningConsumers].map((messages) => messages.close()),
  );
  await Promise.allSettled([...activeHandlers]);
  runningConsumers.clear();
  activeHandlers.clear();
}

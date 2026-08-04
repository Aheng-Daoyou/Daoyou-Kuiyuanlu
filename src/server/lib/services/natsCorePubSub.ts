import { getNatsConnection } from '@server/lib/nats';
import { StringCodec, type Subscription } from 'nats';

type NatsMessageHandler = (message: string) => void;

type SharedSubscription = {
  handlers: Set<NatsMessageHandler>;
  subscription?: Subscription;
  closed: boolean;
  ready: Promise<void>;
};

const codec = StringCodec();
const subscriptions = new Map<string, SharedSubscription>();

function createSharedSubscription(subject: string): SharedSubscription {
  const shared: SharedSubscription = {
    handlers: new Set(),
    closed: false,
    ready: Promise.resolve(),
  };
  shared.ready = getNatsConnection()
    .then(async (connection) => {
      if (shared.closed) return;
      const subscription = connection.subscribe(subject);
      shared.subscription = subscription;
      for await (const message of subscription) {
        const decoded = codec.decode(message.data);
        for (const handler of shared.handlers) handler(decoded);
      }
    })
    .catch((error) => {
      if (!shared.closed) {
        console.warn('[nats-core] subscription stopped', { subject, error });
      }
    });
  subscriptions.set(subject, shared);
  return shared;
}

export function encodeNatsSubjectToken(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export async function publishNatsCoreMessage(
  subject: string,
  message: string,
): Promise<void> {
  try {
    const connection = await getNatsConnection();
    connection.publish(subject, codec.encode(message));
  } catch (error) {
    console.warn('[nats-core] publish failed', { subject, error });
  }
}

export function subscribeNatsCoreSubject(
  subject: string,
  handler: NatsMessageHandler,
): () => void {
  const shared =
    subscriptions.get(subject) ?? createSharedSubscription(subject);
  shared.handlers.add(handler);

  return () => {
    const current = subscriptions.get(subject);
    if (!current) return;
    current.handlers.delete(handler);
    if (current.handlers.size > 0) return;
    subscriptions.delete(subject);
    current.closed = true;
    current.subscription?.unsubscribe();
  };
}

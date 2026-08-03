import { closeNatsConnection, getNatsConnection } from '@server/lib/nats';
import { projectSectConstructionDonation } from '@server/lib/services/sect-organization/SectConstructionSettlementService';
import { projectTaskDomainEvent } from '@server/lib/services/TaskDomainEventProjector';
import {
  isDomainEventType,
  type DomainEventEnvelope,
} from '@shared/contracts/domainEvents';
import {
  startDomainEventConsumer,
  stopDomainEventConsumers,
} from './domainEventConsumer';
import { executeDomainEvent } from './DomainEventExecutor';
import {
  DOMAIN_EVENT_CONSUMERS,
  ensureDomainEventTopology,
} from './natsTopology';
import {
  startTransactionalMessageRelay,
  stopTransactionalMessageRelay,
} from './transactionalMessageRelay';

let registered = false;

export async function registerDomainEventInfrastructure(): Promise<void> {
  if (registered) return;

  await getNatsConnection();
  await ensureDomainEventTopology();
  await Promise.all([
    startDomainEventConsumer({
      consumerName: DOMAIN_EVENT_CONSUMERS.sectFacilityProjector.name,
      concurrency: DOMAIN_EVENT_CONSUMERS.sectFacilityProjector.concurrency,
      acceptedTypes: ['sect.construction.donated'],
      handle: handleSectConstructionEvent,
    }),
    startDomainEventConsumer({
      consumerName: DOMAIN_EVENT_CONSUMERS.taskProjector.name,
      concurrency: DOMAIN_EVENT_CONSUMERS.taskProjector.concurrency,
      acceptedTypes: [
        'alchemy.craft.completed',
        'ranking.challenge.completed',
        'dungeon.run.settled',
      ],
      handle: handleTaskEvent,
    }),
  ]);
  startTransactionalMessageRelay();
  registered = true;
}

async function handleSectConstructionEvent(event: DomainEventEnvelope) {
  if (!isDomainEventType(event, 'sect.construction.donated')) {
    throw new Error(`宗门设施投影不支持领域事件: ${event.type}`);
  }
  await executeDomainEvent({
    consumerName: DOMAIN_EVENT_CONSUMERS.sectFacilityProjector.name,
    source: 'sect_facility_domain_event',
    event,
    handle: projectSectConstructionDonation,
  });
}

async function handleTaskEvent(event: DomainEventEnvelope) {
  await executeDomainEvent({
    consumerName: DOMAIN_EVENT_CONSUMERS.taskProjector.name,
    source: 'task_domain_event',
    event,
    handle: projectTaskDomainEvent,
  });
}

export async function shutdownDomainEventInfrastructure(): Promise<void> {
  if (!registered) return;
  registered = false;
  stopTransactionalMessageRelay();
  await stopDomainEventConsumers();
  await closeNatsConnection();
}

import {
  DOMAIN_EVENT_DEFINITIONS,
  parseDomainEventEnvelope,
} from './domainEvents';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const CULTIVATOR_ID = '22222222-2222-4222-8222-222222222222';

describe('domain event contracts', () => {
  it('parses a versioned event envelope', () => {
    const definition = DOMAIN_EVENT_DEFINITIONS['alchemy.craft.completed'];
    const event = parseDomainEventEnvelope({
      id: EVENT_ID,
      type: 'alchemy.craft.completed',
      version: definition.version,
      subject: definition.subject,
      occurredAt: '2026-08-03T08:00:00.000Z',
      aggregate: { type: 'cultivator', id: CULTIVATOR_ID },
      data: {
        cultivatorId: CULTIVATOR_ID,
        actionInstanceId: '33333333-3333-4333-8333-333333333333',
        mode: 'formula',
      },
    });

    expect(event.type).toBe('alchemy.craft.completed');
    expect(event.data).toMatchObject({ mode: 'formula' });
  });

  it('rejects subject or version drift for a known event type', () => {
    expect(() =>
      parseDomainEventEnvelope({
        id: EVENT_ID,
        type: 'ranking.challenge.completed',
        version: 2,
        subject: 'daoyou.domain.activity.wrong.v2',
        occurredAt: '2026-08-03T08:00:00.000Z',
        aggregate: { type: 'cultivator', id: CULTIVATOR_ID },
        data: {},
      }),
    ).toThrow('领域事件定义不匹配');
  });

  it('rejects invalid event data', () => {
    const definition = DOMAIN_EVENT_DEFINITIONS['dungeon.run.settled'];
    expect(() =>
      parseDomainEventEnvelope({
        id: EVENT_ID,
        type: 'dungeon.run.settled',
        version: definition.version,
        subject: definition.subject,
        occurredAt: '2026-08-03T08:00:00.000Z',
        aggregate: {
          type: 'dungeon-run',
          id: '44444444-4444-4444-8444-444444444444',
        },
        data: {
          cultivatorId: CULTIVATOR_ID,
          runId: '44444444-4444-4444-8444-444444444444',
          mapNodeId: 'node-1',
          outcome: 'unknown',
        },
      }),
    ).toThrow();
  });
});

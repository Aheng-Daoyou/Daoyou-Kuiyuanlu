import { describe, expect, it } from 'vitest';
import {
  SectTaskRecordPayloadSchema,
  createSectTaskOfferSnapshot,
} from './taskOffer';
import { calculateRealmSectTaskReward } from './taskRewards';

describe('sect task offer snapshot', () => {
  const build = (rulesVersion: number) =>
    createSectTaskOfferSnapshot({
      rulesVersion,
      membershipId: 'membership-1',
      taskId: 'pill_delivery',
      anchorRealm: '金丹',
      anchorRealmStage: '中期',
      periodKey: '2026-07-23',
      executorKey: 'sect.delivery.pill',
      requirement: {
        kind: 'pill',
        quantity: 1,
        minQuality: '玄品',
        trait: 'increase_lifespan',
      },
      difficulty: 'hard',
      reward: calculateRealmSectTaskReward({
        realm: '金丹',
        realmStage: '中期',
        difficulty: 'hard',
        reward: { baseContribution: 35, frequencyBps: 10_000 },
      }),
    });

  it('creates stable revisions and changes them with rulesVersion', () => {
    expect(build(1)).toEqual(build(1));
    expect(build(2).offerRevision).not.toBe(build(1).offerRevision);
  });

  it('strictly parses the current payload shape', () => {
    const offer = build(1);
    expect(
      SectTaskRecordPayloadSchema.parse({
        schemaVersion: 1,
        target: 1,
        offer,
        executorData: {},
      }).offer.offerRevision,
    ).toBe(offer.offerRevision);
    expect(() =>
      SectTaskRecordPayloadSchema.parse({ target: 1, offer, executorData: {} }),
    ).toThrow();
  });
});

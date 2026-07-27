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
      anchorRealm: '金丹',
      anchorRealmStage: '中期',
      periodKey: '2026-07-23',
      executorKey: 'sect.delivery.pill',
      requirement: {
        kind: 'pill',
        quantity: 1,
        minQuality: '玄品',
        family: 'longevity',
        trait: 'increase_lifespan',
        appearance: { mode: 'at_least', grade: 'middle' },
      },
      difficulty: 'hard',
      reward: calculateRealmSectTaskReward({
        realm: '金丹',
        realmStage: '中期',
        difficulty: 'hard',
        cadence: 'daily',
        reward: { baseContribution: 35 },
      }),
    });

  it('creates a strict v2 snapshot without a pre-accept revision', () => {
    expect(build(1)).toEqual(build(1));
    expect(build(2).rulesVersion).not.toBe(build(1).rulesVersion);
    expect(build(1)).not.toHaveProperty('offerRevision');
  });

  it('strictly parses the current payload shape', () => {
    const offer = build(1);
    expect(
      SectTaskRecordPayloadSchema.parse({
        schemaVersion: 2,
        target: 1,
        offer,
        executorData: {},
      }).offer,
    ).toEqual(offer);
    expect(() =>
      SectTaskRecordPayloadSchema.parse({ target: 1, offer, executorData: {} }),
    ).toThrow();
  });

  it('parses single-item and multi-item completion snapshots', () => {
    const offer = build(1);
    const item = {
      itemId: 'material-1',
      kind: 'material' as const,
      name: '玄铁',
      quality: '玄品',
      quantity: 1,
      matchedFacts: ['玄品以上矿石'],
    };

    expect(
      SectTaskRecordPayloadSchema.parse({
        schemaVersion: 2,
        target: 1,
        offer,
        executorData: {},
        completionData: { submittedItem: item },
      }).completionData?.submittedItem,
    ).toEqual(item);
    expect(
      SectTaskRecordPayloadSchema.parse({
        schemaVersion: 2,
        target: 1,
        offer,
        executorData: {},
        completionData: {
          submittedItems: [
            item,
            { ...item, itemId: 'material-2', name: '赤铜', quantity: 2 },
          ],
        },
      }).completionData?.submittedItems,
    ).toHaveLength(2);
  });
});

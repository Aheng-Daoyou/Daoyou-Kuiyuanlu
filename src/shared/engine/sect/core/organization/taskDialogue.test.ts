import { describe, expect, it } from 'vitest';
import { StandardSectOrganizationModule } from './StandardSectOrganizationModule';
import { resolveSectTaskDialogue } from './taskDialogue';
import { createSectTaskOfferSnapshot } from './taskOffer';

function offer(args: {
  taskId: string;
  executorKey: string;
  requirement?: Parameters<
    typeof createSectTaskOfferSnapshot
  >[0]['requirement'];
}) {
  return createSectTaskOfferSnapshot({
    rulesVersion: 1,
    membershipId: 'membership-1',
    taskId: args.taskId,
    anchorRealm: '金丹',
    anchorRealmStage: '中期',
    periodKey: '2026-07-26',
    executorKey: args.executorKey,
    requirement: args.requirement,
    difficulty: 'hard',
  });
}

describe('sect task dialogue presentation', () => {
  it('resolves delivery requirements into semantic Chinese segments', () => {
    const definition = new StandardSectOrganizationModule().tasks.get(
      'pill_delivery',
    )!;
    const dialogue = resolveSectTaskDialogue({
      definition,
      offer: offer({
        taskId: definition.id,
        executorKey: definition.executorKey,
        requirement: {
          kind: 'pill',
          quantity: 1,
          minQuality: '玄品',
          family: 'longevity',
          trait: 'increase_lifespan',
          appearance: { mode: 'at_least', grade: 'middle' },
        },
      }),
      progress: { current: 0, target: 1 },
    });
    const text = dialogue.instruction.map((segment) => segment.text).join('');

    expect(dialogue.offeredReply).toBe('丹房所需之物，我来寻');
    expect(text).toBe(
      '替丹房寻来1颗玄品以上、具有增加寿元功效的延寿丹，品相不可低于中品，取得后直接带回事务堂即可。',
    );
    expect(text).not.toMatch(/longevity|increase_lifespan|middle|_/);
  });

  it('speaks multi-step progress as a natural sentence', () => {
    const definition = new StandardSectOrganizationModule().tasks.get(
      'weekly_diligence',
    )!;
    const dialogue = resolveSectTaskDialogue({
      definition,
      offer: offer({
        taskId: definition.id,
        executorKey: definition.executorKey,
      }),
      progress: { current: 2, target: 5 },
    });

    expect(dialogue.instruction.map((segment) => segment.text).join('')).toBe(
      '本周要完成五次宗门日常，功簿会逐次记下。 功簿上已经记下2次，还差3次。',
    );
  });

  it('keeps standard dialogue while applying non-task organization themes', () => {
    const definition = new StandardSectOrganizationModule({
      facilityNames: { archive: '宗门藏书阁' },
    }).tasks.get('gate_sweep')!;

    expect(definition.presentation.dialogue.offeredReply).toBe(
      '山门洒扫便交给我吧',
    );
    expect(definition.presentation.dialogue.instruction.text).toBe(
      '去山门步道清理落叶，完成一轮洒扫后回来复命。',
    );
  });
});

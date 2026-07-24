import type { SectTaskViewData } from '@shared/contracts/sect';
import { describe, expect, it } from 'vitest';
import { sortSectTaskNotices } from './sectTaskNoticeModel';

function task(
  definitionId: string,
  state: SectTaskViewData['state'],
  kind: SectTaskViewData['kind'],
): SectTaskViewData {
  return {
    id: definitionId,
    definitionId,
    state,
    kind,
    periodKey: 'period',
    progress: { current: 0, target: 1 },
    difficulty: 'easy',
    presentation: {
      title: definitionId,
      description: definitionId,
      metadata: [],
    },
    actions: [],
  };
}

describe('sect notice sorting', () => {
  it('prioritizes claimable then active and keeps catalog order', () => {
    const sorted = sortSectTaskNotices([
      task('offered', 'offered', 'daily'),
      task('weekly-active', 'active', 'weekly'),
      task('daily-active', 'active', 'daily'),
      task('claimable', 'claimable', 'weekly'),
      task('claimed', 'claimed', 'daily'),
    ]);
    expect(sorted.map((item) => item.definitionId)).toEqual([
      'claimable',
      'daily-active',
      'weekly-active',
      'offered',
      'claimed',
    ]);
  });
});

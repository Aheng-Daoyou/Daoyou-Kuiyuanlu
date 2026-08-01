import type { DbTransaction } from '@server/lib/drizzle/db';
import type { TaskProgressMessagePayload } from '@server/lib/mq/task-progress/message';
import { lockCultivatorForStateMutation } from '@server/lib/repositories/playerStateRepository';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import { readPlayerTaskSummary } from './PlayerResourceReaderService';
import { TaskService } from './TaskService';

export async function settleTaskProgressMessage(
  payload: TaskProgressMessagePayload,
  tx: DbTransaction,
) {
  await lockCultivatorForStateMutation(tx, payload.cultivatorId);

  if (payload.kind === 'dungeon_settlement') {
    if (payload.outcome === 'completed') {
      await TaskService.recordDungeonCompletion(
        payload.cultivatorId,
        payload.mapNodeId,
        { tx },
      );
    }
    await TaskService.recordTaskEvent(
      payload.cultivatorId,
      'dungeon_completed',
      { tx },
    );
  } else {
    await TaskService.recordTaskEvent(payload.cultivatorId, payload.event, {
      tx,
    });
  }

  const taskSummary = await readPlayerTaskSummary(payload.cultivatorId, tx);
  const scope = { kind: 'cultivator' as const, id: payload.cultivatorId };
  return {
    result: { status: 'applied' as const },
    resourceChanges: [
      {
        scope,
        resourceTopic: 'player.tasks',
        eventType: 'tasks.progress_changed',
        operation: 'invalidate',
      },
      {
        scope,
        resourceTopic: 'player.task-summary',
        eventType: 'tasks.progress_changed',
        operation: 'replace',
        payload: taskSummary,
      },
    ] satisfies ResourceChangeDescriptor[],
  };
}

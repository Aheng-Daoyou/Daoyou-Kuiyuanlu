import type { DbTransaction } from '@server/lib/drizzle/db';
import { createLocalTransactionMessage } from '@server/lib/repositories/localTransactionMessageRepository';
import { TASK_EVENT_VALUES } from '@shared/types/task';
import { z } from 'zod';
import { MQ_KEYS } from '../mqKeys';

export const TASK_PROGRESS_MESSAGE_KEY = MQ_KEYS.messages.taskProgress;

const TaskActivityEventSchema = z.enum(TASK_EVENT_VALUES);

const DungeonSettlementOutcomeSchema = z.enum([
  'completed',
  'retreated_after_battle',
  'abandoned_before_battle',
]);

export const TaskProgressMessagePayloadSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('activity_event'),
      cultivatorId: z.uuid(),
      event: TaskActivityEventSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('dungeon_settlement'),
      cultivatorId: z.uuid(),
      mapNodeId: z.string().min(1).max(100),
      outcome: DungeonSettlementOutcomeSchema,
    })
    .strict(),
]);

export type TaskProgressMessagePayload = z.infer<
  typeof TaskProgressMessagePayloadSchema
>;

export async function createTaskProgressMessage(
  input: {
    payload: TaskProgressMessagePayload;
    deduplicationKey: string;
  },
  tx: DbTransaction,
): Promise<{ id: string }> {
  const payload = TaskProgressMessagePayloadSchema.parse(input.payload);
  return createLocalTransactionMessage(
    {
      messageKey: TASK_PROGRESS_MESSAGE_KEY,
      payload,
      deduplicationKey: input.deduplicationKey,
    },
    tx,
  );
}

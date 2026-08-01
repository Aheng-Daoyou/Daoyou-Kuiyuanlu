import { executeLocalTransactionMessage } from '@server/lib/mq/LocalTransactionMessageExecutor';
import type { LocalTransactionMessageJobData } from '@server/lib/mq/localTransactionMessages';
import { createBullMqWorkerRedisConnection } from '@server/lib/redis';
import { settleTaskProgressMessage } from '@server/lib/services/TaskProgressMessageService';
import { Worker, type Job } from 'bullmq';
import { MQ_KEYS } from '../mqKeys';
import {
  TASK_PROGRESS_MESSAGE_KEY,
  TaskProgressMessagePayloadSchema,
} from './message';

const WORKER_CONCURRENCY = 8;

async function processTaskProgressJob(
  job: Job<LocalTransactionMessageJobData>,
): Promise<void> {
  if (!job.data.messageId) throw new Error('任务进度队列消息缺少消息编号');
  await executeLocalTransactionMessage({
    messageId: job.data.messageId,
    messageKey: TASK_PROGRESS_MESSAGE_KEY,
    source: 'task_progress_queue',
    payloadSchema: TaskProgressMessagePayloadSchema,
    handle: settleTaskProgressMessage,
  });
}

export function createTaskProgressWorker(): Worker<LocalTransactionMessageJobData> {
  const worker = new Worker<LocalTransactionMessageJobData>(
    MQ_KEYS.queues.taskProgress,
    processTaskProgressJob,
    {
      connection: createBullMqWorkerRedisConnection(),
      concurrency: WORKER_CONCURRENCY,
      prefix: MQ_KEYS.redisPrefix,
    },
  );
  worker.on('failed', (job, error) => {
    console.error('[task-progress-worker] job failed', {
      messageId: job?.data.messageId,
      attemptsMade: job?.attemptsMade,
      error,
    });
  });
  worker.on('error', (error) => {
    console.error('[task-progress-worker] worker error', error);
  });
  return worker;
}

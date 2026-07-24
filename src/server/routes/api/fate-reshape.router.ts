import {
  redisLockErrorResponse,
  requireActiveCultivator,
} from '@server/lib/hono/middleware';
import { jsonWithStatus } from '@server/lib/hono/response';
import type { AppEnv } from '@server/lib/hono/types';
import { redisLockKeys, withRedisLock } from '@server/lib/redis/lock';
import {
  FateReshapeService,
  FateReshapeServiceError,
  prepareFateReshapeConfirmation,
  prepareFateReshapeStart,
} from '@server/lib/services/FateReshapeService';
import {
  commitPlayerStateMutation,
  toPlayerStateMutationResponse,
} from '@server/lib/services/PlayerStateMutationService';
import { Hono } from 'hono';
import { z } from 'zod';

const ConfirmSchema = z.object({
  selectedIndices: z.array(z.number().int().nonnegative()).length(3),
});

const router = new Hono<AppEnv>();

router.get('/session', requireActiveCultivator(), async (c) => {
  const cultivator = c.get('cultivator');
  if (!cultivator) {
    return c.json({ success: false, error: '当前没有活跃角色' }, 404);
  }

  try {
    const [session, talismanCount] = await Promise.all([
      FateReshapeService.getSession(cultivator.id),
      FateReshapeService.getAvailableTalismanCount(cultivator.id),
    ]);

    return c.json({
      success: true,
      data: {
        session,
        talismanCount,
      },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取命格重塑状态失败',
      },
      400,
    );
  }
});

router.post('/session', requireActiveCultivator(), async (c) => {
  const user = c.get('user');
  const cultivator = c.get('cultivator');
  if (!user || !cultivator) {
    return c.json({ success: false, error: '未授权访问' }, 401);
  }

  try {
    return await withRedisLock(
      {
        key: redisLockKeys.cultivatorMutation(cultivator.id),
        context: 'fate-reshape-start',
        timeoutMs: 60_000,
        renewEveryMs: 20_000,
        retries: 0,
      },
      async (lease) => {
        const prepared = await prepareFateReshapeStart(user.id, cultivator.id);
        lease.assertHeld();
        let afterCommit: (() => Promise<void>) | undefined;
        const committed = await commitPlayerStateMutation({
          coordination: { mode: 'redis', lease },
          userId: user.id,
          cultivatorId: cultivator.id,
          source: 'fate_reshape_start',
          allowEmpty: true,
          run: async (tx) => {
            const preparedCommit = await prepared.commit(tx);
            afterCommit = preparedCommit.afterCommit;
            return {
              result: {
                session: preparedCommit.session,
              },
              changes: [],
            };
          },
        });
        await afterCommit?.();
        const talismanCount =
          await FateReshapeService.getAvailableTalismanCount(cultivator.id);
        return c.json(
          toPlayerStateMutationResponse({
            ...committed,
            result: {
              ...committed.result,
              talismanCount,
            },
          }),
        );
      },
    );
  } catch (error) {
    const lockErrorResponse = redisLockErrorResponse(error);
    if (lockErrorResponse) return lockErrorResponse;
    const status =
      error instanceof FateReshapeServiceError ? error.status : 400;
    return jsonWithStatus(
      c,
      {
        success: false,
        error: error instanceof Error ? error.message : '开启命格重塑失败',
      },
      status,
    );
  }
});

router.post('/reroll', requireActiveCultivator(), async (c) => {
  const cultivator = c.get('cultivator');
  if (!cultivator) {
    return c.json({ success: false, error: '当前没有活跃角色' }, 404);
  }

  try {
    const session = await FateReshapeService.rerollSession(cultivator.id);
    return c.json({
      success: true,
      data: { session },
    });
  } catch (error) {
    const status =
      error instanceof FateReshapeServiceError ? error.status : 400;
    return jsonWithStatus(
      c,
      {
        success: false,
        error: error instanceof Error ? error.message : '命格重抽失败',
      },
      status,
    );
  }
});

router.post('/confirm', requireActiveCultivator(), async (c) => {
  const user = c.get('user');
  const cultivator = c.get('cultivator');
  if (!user || !cultivator) {
    return c.json({ success: false, error: '未授权访问' }, 401);
  }

  try {
    const parsed = ConfirmSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ success: false, error: '请求参数格式错误' }, 400);
    }

    return await withRedisLock(
      {
        key: redisLockKeys.cultivatorMutation(cultivator.id),
        context: 'fate-reshape-confirm',
        timeoutMs: 10_000,
        retries: 0,
      },
      async (lease) => {
        const prepared = await prepareFateReshapeConfirmation(
          user.id,
          cultivator.id,
          parsed.data.selectedIndices,
        );
        lease.assertHeld();
        let afterCommit: (() => Promise<void>) | undefined;
        const committed = await commitPlayerStateMutation({
          coordination: { mode: 'redis', lease },
          userId: user.id,
          cultivatorId: cultivator.id,
          source: 'fate_reshape_confirm',
          run: async (tx) => {
            const preparedCommit = await prepared.commit(tx);
            afterCommit = preparedCommit.afterCommit;
            return {
              result: { selectedFates: preparedCommit.selectedFates },
              changes: [
                {
                  domain: 'profile',
                  eventType: 'profile.fates.changed',
                  invalidates: ['profile'],
                },
              ],
            };
          },
        });
        await afterCommit?.();
        return c.json(toPlayerStateMutationResponse(committed));
      },
    );
  } catch (error) {
    const lockErrorResponse = redisLockErrorResponse(error);
    if (lockErrorResponse) return lockErrorResponse;
    const status =
      error instanceof FateReshapeServiceError ? error.status : 400;
    return jsonWithStatus(
      c,
      {
        success: false,
        error: error instanceof Error ? error.message : '确认命格重塑失败',
      },
      status,
    );
  }
});

router.post('/abandon', requireActiveCultivator(), async (c) => {
  const cultivator = c.get('cultivator');
  if (!cultivator) {
    return c.json({ success: false, error: '当前没有活跃角色' }, 404);
  }

  try {
    await FateReshapeService.abandonSession(cultivator.id);
    return c.json({ success: true });
  } catch (error) {
    const status =
      error instanceof FateReshapeServiceError ? error.status : 400;
    return jsonWithStatus(
      c,
      {
        success: false,
        error: error instanceof Error ? error.message : '放弃命格重塑失败',
      },
      status,
    );
  }
});

export default router;

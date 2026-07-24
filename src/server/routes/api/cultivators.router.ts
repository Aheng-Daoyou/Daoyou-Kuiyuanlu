import {
  invalidateActiveCultivatorRef,
  requireUser,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  isRedisLockContention,
  redisLockKeys,
  withRedisLock,
} from '@server/lib/redis/lock';
import {
  buildCultivatorRuntime,
  deleteCultivator,
  getLastDeadCultivatorSummary,
  getPlayerLoadoutByCultivatorId,
  getPlayerProfileCultivatorsByUserId,
  getPlayerRuntimeCultivatorById,
  hasDeadCultivator,
} from '@server/lib/services/cultivatorService';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.get('/', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const cultivatorId = c.req.query('id');
  if (cultivatorId) {
    const cultivator = await getPlayerRuntimeCultivatorById(
      user.id,
      cultivatorId,
    );
    if (!cultivator) {
      return c.json({ error: '角色不存在' }, 404);
    }

    return c.json({
      success: true,
      data: cultivator,
    });
  }

  const profiles = await getPlayerProfileCultivatorsByUserId(user.id);
  const cultivators = await Promise.all(
    profiles.map(async (profile) =>
      buildCultivatorRuntime(
        profile,
        await getPlayerLoadoutByCultivatorId(profile.id!),
      ),
    ),
  );
  const deadExists = await hasDeadCultivator(user.id);
  return c.json({
    success: true,
    data: cultivators,
    meta: {
      hasActive: cultivators.length > 0,
      hasDead: deadExists,
    },
  });
});

router.delete('/', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const cultivatorId = c.req.query('id');
  if (!cultivatorId) {
    return c.json({ error: '请提供角色ID' }, 400);
  }

  try {
    return await withRedisLock(
      {
        key: redisLockKeys.cultivatorMutation(cultivatorId),
        context: 'cultivator-delete',
        timeoutMs: 15_000,
        retries: 0,
      },
      async (lease) => {
        lease.assertHeld();
        const success = await deleteCultivator(user.id, cultivatorId);
        if (!success) {
          return c.json({ error: '删除角色失败或角色不存在' }, 404);
        }

        await invalidateActiveCultivatorRef(user.id);
        return c.json({
          success: true,
          message: '角色删除成功',
        });
      },
    );
  } catch (error) {
    if (isRedisLockContention(error)) {
      return c.json({ error: '角色正在执行其他操作，请稍后重试' }, 429);
    }
    throw error;
  }
});

router.get('/reincarnate-context', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: '未授权访问' }, 401);
  }

  try {
    const summary = await getLastDeadCultivatorSummary(user.id);
    return c.json({
      success: true,
      data: summary ?? null,
    });
  } catch (err) {
    console.error('获取转世上下文 API 错误:', err);
    return c.json(
      {
        error:
          process.env.NODE_ENV === 'development'
            ? err instanceof Error
              ? err.message
              : '获取转世上下文失败'
            : '获取转世上下文失败，请稍后再试',
      },
      500,
    );
  }
});

export default router;

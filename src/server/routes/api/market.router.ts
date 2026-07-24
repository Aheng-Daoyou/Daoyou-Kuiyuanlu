import {
  redisLockErrorResponse,
  requireActiveCultivator,
} from '@server/lib/hono/middleware';
import { jsonWithStatus } from '@server/lib/hono/response';
import type { AppEnv } from '@server/lib/hono/types';
import { redisLockKeys, withRedisLock } from '@server/lib/redis/lock';
import {
  MarketRecycleError,
  prepareSellConfirmation,
  previewSell,
} from '@server/lib/services/MarketRecycleService';
import {
  getMarketListings,
  MarketServiceError,
  prepareBatchMarketPurchase,
  prepareMarketItemPurchase,
  resolveLayer,
  resolveNodeId,
} from '@server/lib/services/MarketService';
import {
  commitPlayerStateMutation,
  toPlayerStateMutationResponse,
  type StateChangeDescriptor,
} from '@server/lib/services/PlayerStateMutationService';
import { getPlayerProfileCultivatorById } from '@server/lib/services/cultivatorService';
import { RealmType } from '@shared/types/constants';
import type { PreHeavenFate } from '@shared/types/cultivator';
import type { SellConfirmResponse } from '@shared/types/market';
import { Hono } from 'hono';
import { z } from 'zod';

const BuySchema = z.object({
  listingId: z.string().optional(),
  quantity: z.number().min(1).default(1),
  layer: z.enum(['common', 'treasure', 'heaven', 'black']).optional(),
  items: z
    .array(
      z.object({
        listingId: z.string(),
        quantity: z.number().min(1),
      }),
    )
    .optional(),
});

const PreviewSchema = z
  .object({
    phase: z.literal('preview'),
    itemType: z.enum(['material', 'artifact']).optional(),
    itemIds: z.array(z.string()).min(1).optional(),
    materialIds: z.array(z.string()).min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasItemIds = Array.isArray(value.itemIds) && value.itemIds.length > 0;
    const hasMaterialIds =
      Array.isArray(value.materialIds) && value.materialIds.length > 0;

    if (!hasItemIds && !hasMaterialIds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '请至少选择一件物品',
      });
    }

    if (value.itemType === 'artifact' && hasMaterialIds && !hasItemIds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '法宝回收请使用 itemIds 参数',
      });
    }
  });

const ConfirmSchema = z.object({
  phase: z.literal('confirm'),
  sessionId: z.string().min(1),
});

const SellSchema = z.discriminatedUnion('phase', [
  PreviewSchema,
  ConfirmSchema,
]);

const router = new Hono<AppEnv>();

function marketBuyChanges(): StateChangeDescriptor[] {
  return [
    {
      domain: 'currency',
      eventType: 'currency.changed',
      invalidates: ['currency'],
    },
  ];
}

function marketSellChanges(
  result: SellConfirmResponse,
): StateChangeDescriptor[] {
  const changes: StateChangeDescriptor[] = [
    {
      domain: 'currency',
      eventType: 'currency.changed',
      patch: {
        currency: {
          spiritStones: result.remainingSpiritStones,
        },
      },
      invalidates: ['currency'],
    },
  ];

  if (result.itemType === 'artifact') {
    changes.push({
      domain: 'loadout',
      eventType: 'loadout.changed',
      invalidates: ['loadout'],
    });
  }

  return changes;
}

async function loadMarketFates(cultivator: {
  id: string;
  userId: string;
}): Promise<PreHeavenFate[]> {
  const profileCultivator = await getPlayerProfileCultivatorById(
    cultivator.userId,
    cultivator.id,
  );
  return profileCultivator?.pre_heaven_fates ?? [];
}

router.post('/sell', requireActiveCultivator(), async (c) => {
  const cultivator = c.get('cultivator');
  if (!cultivator) {
    return c.json({ error: '当前没有活跃角色' }, 404);
  }

  try {
    const parsed = SellSchema.parse(await c.req.json());

    if (parsed.phase === 'preview') {
      const itemType = parsed.itemType || 'material';
      const itemIds = parsed.itemIds || parsed.materialIds || [];
      const result = await previewSell(
        { id: cultivator.id },
        itemIds,
        itemType,
      );
      return c.json(result);
    }

    return await withRedisLock(
      {
        key: redisLockKeys.cultivatorMutation(cultivator.id),
        context: 'market-sell',
        timeoutMs: 10_000,
        retries: 0,
      },
      async (lease) => {
        const prepared = await prepareSellConfirmation(
          cultivator.id,
          parsed.sessionId,
        );
        lease.assertHeld();
        let afterCommit: (() => Promise<void>) | undefined;
        const committed = await commitPlayerStateMutation({
          coordination: { mode: 'redis', lease },
          userId: cultivator.userId,
          cultivatorId: cultivator.id,
          source: 'market_sell',
          run: async (tx) => {
            const { afterCommit: sellAfterCommit, ...result } =
              await prepared.commit(tx);
            afterCommit = sellAfterCommit
              ? async () => {
                  await sellAfterCommit();
                }
              : undefined;
            return {
              result,
              changes: marketSellChanges(result),
            };
          },
        });
        if (afterCommit) {
          try {
            await afterCommit();
          } catch (afterCommitError) {
            console.error('市场回收后置副作用失败:', {
              cultivatorId: cultivator.id,
              sessionId: parsed.sessionId,
              error: afterCommitError,
            });
          }
        }
        return c.json(toPlayerStateMutationResponse(committed));
      },
    );
  } catch (error) {
    const lockErrorResponse = redisLockErrorResponse(error);
    if (lockErrorResponse) return lockErrorResponse;
    if (error instanceof z.ZodError) {
      return c.json({ error: error.issues[0]?.message || '参数格式错误' }, 400);
    }
    if (error instanceof MarketRecycleError) {
      return jsonWithStatus(c, { error: error.message }, error.status);
    }

    console.error('market sell api error:', error);
    return c.json({ error: '回收失败，请稍后再试' }, 500);
  }
});

router.get('/:nodeId', requireActiveCultivator(), async (c) => {
  const cultivator = c.get('cultivator');
  if (!cultivator) {
    return c.json({ error: '当前没有活跃角色' }, 404);
  }

  try {
    const nodeId = resolveNodeId(c.req.param('nodeId'));
    const layer = resolveLayer(c.req.query('layer'));
    const fates = await loadMarketFates(cultivator);
    const result = await getMarketListings({
      nodeId,
      layer,
      userId: cultivator.userId,
      cultivatorRealm: cultivator.realm as RealmType,
      fates,
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof MarketServiceError) {
      return jsonWithStatus(c, { error: error.message }, error.status);
    }

    console.error('Market node API error:', error);
    return c.json({ error: 'Failed to fetch market listings' }, 500);
  }
});

router.post('/:nodeId/buy', requireActiveCultivator(), async (c) => {
  const cultivator = c.get('cultivator');
  if (!cultivator) {
    return c.json({ error: '当前没有活跃角色' }, 404);
  }

  try {
    const parsed = BuySchema.parse(await c.req.json());
    const nodeId = resolveNodeId(c.req.param('nodeId'));
    const layer = parsed.layer || resolveLayer(c.req.query('layer'));
    const fates = await loadMarketFates(cultivator);

    if (parsed.items && parsed.items.length > 0) {
      const items = parsed.items;
      return await withRedisLock(
        {
          key: redisLockKeys.cultivatorMutation(cultivator.id),
          context: 'market-batch-buy',
          timeoutMs: 30_000,
          retries: 0,
        },
        async (lease) => {
          const prepared = await prepareBatchMarketPurchase({
            nodeId,
            layer,
            items,
            userId: cultivator.userId,
            cultivatorId: cultivator.id,
            cultivatorRealm: cultivator.realm as RealmType,
            fates,
          });
          lease.assertHeld();
          let afterCommit: (() => Promise<void>) | undefined;
          const committed = await commitPlayerStateMutation({
            coordination: { mode: 'redis', lease },
            userId: cultivator.userId,
            cultivatorId: cultivator.id,
            source: 'market_batch_buy',
            run: async (tx) => {
              const preparedCommit = await prepared.commit(tx);
              const result = preparedCommit.result;
              afterCommit = preparedCommit.afterCommit;
              return {
                result,
                changes: marketBuyChanges(),
              };
            },
          });
          if (afterCommit) {
            try {
              await afterCommit();
            } catch (afterCommitError) {
              console.error('市场批量购买后置副作用失败:', {
                cultivatorId: cultivator.id,
                error: afterCommitError,
              });
            }
          }
          return c.json(toPlayerStateMutationResponse(committed));
        },
      );
    }

    if (!parsed.listingId) {
      return c.json({ error: '缺少 listingId' }, 400);
    }
    const listingId = parsed.listingId;

    return await withRedisLock(
      {
        key: redisLockKeys.cultivatorMutation(cultivator.id),
        context: 'market-buy',
        timeoutMs: 10_000,
        retries: 0,
      },
      async (lease) => {
        const prepared = await prepareMarketItemPurchase({
          nodeId,
          layer,
          listingId,
          quantity: parsed.quantity,
          userId: cultivator.userId,
          cultivatorId: cultivator.id,
          cultivatorRealm: cultivator.realm as RealmType,
          fates,
        });
        lease.assertHeld();
        let afterCommit: (() => Promise<void>) | undefined;
        const committed = await commitPlayerStateMutation({
          coordination: { mode: 'redis', lease },
          userId: cultivator.userId,
          cultivatorId: cultivator.id,
          source: 'market_buy',
          run: async (tx) => {
            const preparedCommit = await prepared.commit(tx);
            const result = preparedCommit.result;
            afterCommit = preparedCommit.afterCommit;
            return {
              result,
              changes: marketBuyChanges(),
            };
          },
        });
        if (afterCommit) {
          try {
            await afterCommit();
          } catch (afterCommitError) {
            console.error('市场购买后置副作用失败:', {
              cultivatorId: cultivator.id,
              listingId,
              error: afterCommitError,
            });
          }
        }

        return c.json(toPlayerStateMutationResponse(committed));
      },
    );
  } catch (error) {
    const lockErrorResponse = redisLockErrorResponse(error);
    if (lockErrorResponse) return lockErrorResponse;
    if (error instanceof MarketServiceError) {
      return jsonWithStatus(c, { error: error.message }, error.status);
    }
    if (error instanceof z.ZodError) {
      return c.json({ error: error.issues[0]?.message || '参数错误' }, 400);
    }

    console.error('Market buy API error:', error);
    return c.json({ error: '购买失败' }, 500);
  }
});

export default router;

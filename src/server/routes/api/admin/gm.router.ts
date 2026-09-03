import { getExecutor } from '@server/lib/drizzle/db';
import { cultivators, itemLibrary } from '@server/lib/drizzle/schema';
import { requireAdmin } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { resourceEventCommitter } from '@server/lib/services/ResourceEventCommitter';
import { publishResourceEvents } from '@server/lib/services/playerStateBroadcaster';
import { resourceEngine } from '@server/lib/services/resource/ResourceEngine';
import {
  GmGrantRequestSchema,
  GmPlayerQuerySchema,
  GM_GRANT_CHUNK_SIZES,
  type GmGrantResponse,
  type GmPlayerSummary,
} from '@shared/contracts/gmTools';
import type { ResourceChange } from '@shared/contracts/resources';
import type { ResourceOperation } from '@shared/engine/resource/types';
import { and, eq, ilike, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';

/**
 * GM 工具路由（requireAdmin 全程把关）：
 * - GET  /api/admin/gm/players?query=  按名字模糊搜索角色
 * - POST /api/admin/gm/grant           向角色直接发放灯油券/声望/灯韵/寿元/窥悟/道具库物品
 *                                      发放走与玩法相同的资源事件通道，客户端实时刷新
 */

const router = new Hono<AppEnv>();

router.get('/players', requireAdmin(), async (c) => {
  const parsed = GmPlayerQuerySchema.safeParse({ query: c.req.query('query') ?? '' });
  if (!parsed.success) {
    return c.json({ error: '请输入要搜索的角色名' }, 400);
  }

  const q = getExecutor();
  const rows = await q
    .select({
      id: cultivators.id,
      name: cultivators.name,
      realm: cultivators.realm,
      realmStage: cultivators.realm_stage,
      spiritStones: cultivators.spirit_stones,
      reputation: cultivators.reputation,
      userId: cultivators.userId,
    })
    .from(cultivators)
    .where(
      and(eq(cultivators.status, 'active'), ilike(cultivators.name, `%${parsed.data.query}%`)),
    )
    .orderBy(sql`length(${cultivators.name})`)
    .limit(10);

  const players: GmPlayerSummary[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    realm: row.realm,
    realmStage: row.realmStage,
    spiritStones: row.spiritStones,
    reputation: row.reputation,
    userId: row.userId,
  }));

  return c.json({ players });
});

router.post('/grant', requireAdmin(), async (c) => {
  const admin = c.get('user');
  if (!admin) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = GmGrantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: '参数错误', details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  const q = getExecutor();
  const [cultivator] = await q
    .select({
      id: cultivators.id,
      userId: cultivators.userId,
      name: cultivators.name,
    })
    .from(cultivators)
    .where(eq(cultivators.id, input.cultivatorId))
    .limit(1);

  if (!cultivator) {
    return c.json({ error: '角色不存在' }, 404);
  }

  // 物品类发放：按 itemId 从道具库取 payload 构造资源操作
  const grantedItems: Array<{
    itemId: string;
    name: string;
    quantity: number;
  }> = [];
  const itemOps: ResourceOperation[] = [];
  let inventoryTopic: 'inventory.materials' | 'inventory.consumables' | 'inventory.artifacts' | null =
    null;
  if (input.items?.length) {
    const rows = await q
      .select({
        itemId: itemLibrary.itemId,
        type: itemLibrary.type,
        name: itemLibrary.name,
        payload: itemLibrary.payload,
      })
      .from(itemLibrary)
      .where(inArray(itemLibrary.itemId, input.items.map((item) => item.itemId)));
    const byId = new Map(rows.map((row) => [row.itemId, row]));
    for (const item of input.items) {
      const row = byId.get(item.itemId);
      if (!row) {
        return c.json({ error: `道具不存在：${item.itemId}` }, 404);
      }
      if (
        row.type !== 'material' &&
        row.type !== 'consumable' &&
        row.type !== 'artifact'
      ) {
        return c.json(
          { error: `道具 ${row.name}（${item.itemId}）类型不支持直接发放` },
          400,
        );
      }
      itemOps.push({
        type: row.type,
        value: item.quantity,
        name: row.name,
        data: row.payload as ResourceOperation['data'],
      });
      grantedItems.push({
        itemId: row.itemId,
        name: row.name,
        quantity: item.quantity,
      });
      inventoryTopic =
        row.type === 'material'
          ? 'inventory.materials'
          : row.type === 'consumable'
            ? 'inventory.consumables'
            : 'inventory.artifacts';
    }
  }

  // 大额发放按引擎单次安全上限自动拆批（同一事务内多次小步结算，最终结果一致）
  const chunked = (value: number, chunkSize: number): number[] => {
    const ops: number[] = [];
    let remaining = value;
    while (remaining > 0) {
      const step = Math.min(chunkSize, remaining);
      ops.push(step);
      remaining -= step;
    }
    return ops;
  };

  const gain: ResourceOperation[] = [];
  if (input.spiritStones) {
    gain.push(
      ...chunked(input.spiritStones, GM_GRANT_CHUNK_SIZES.spiritStones).map(
        (value): ResourceOperation => ({ type: 'spirit_stones', value }),
      ),
    );
  }
  if (input.reputation) {
    gain.push(
      ...chunked(input.reputation, GM_GRANT_CHUNK_SIZES.reputation).map(
        (value): ResourceOperation => ({ type: 'reputation', value }),
      ),
    );
  }
  if (input.cultivationExp) {
    gain.push(
      ...chunked(input.cultivationExp, GM_GRANT_CHUNK_SIZES.cultivationExp).map(
        (value): ResourceOperation => ({ type: 'cultivation_exp', value }),
      ),
    );
  }
  if (input.lifespan) {
    gain.push(
      ...chunked(input.lifespan, GM_GRANT_CHUNK_SIZES.lifespan).map(
        (value): ResourceOperation => ({ type: 'lifespan', value }),
      ),
    );
  }
  if (input.comprehensionInsight) {
    gain.push({ type: 'comprehension_insight', value: input.comprehensionInsight });
  }
  gain.push(...itemOps);

  // 与正常玩法同一套资源事件通道：事务内落库变更事件 + 提交后广播，
  // 目标玩家的客户端会实时收到失效通知并自动重拉（无需手动强刷）。
  const { result, events } = await q.transaction(async (tx) => {
    const r = await resourceEngine.applyInTransaction({
      userId: cultivator.userId,
      cultivatorId: cultivator.id,
      gain,
      tx,
    });
    if (!r.success || !r.settlement) {
      return { result: r, events: [] as ResourceChange[] };
    }
    const commit = await resourceEventCommitter.commit(tx, {
      actor: { userId: admin.id },
      source: 'gm-grant',
      changes: [
        {
          resourceTopic: 'player.currency',
          eventType: 'gm.grant',
          operation: 'invalidate',
        },
        {
          resourceTopic: 'player.progress',
          eventType: 'gm.grant',
          operation: 'invalidate',
        },
        ...(inventoryTopic
          ? [
              {
                resourceTopic: inventoryTopic,
                eventType: 'gm.grant',
                operation: 'invalidate' as const,
              },
            ]
          : []),
      ],
      scopeDefaults: { accountId: cultivator.userId, cultivatorId: cultivator.id },
    });
    return { result: r, events: commit.changes };
  });
  if (events.length) publishResourceEvents(events);

  if (!result.success || !result.settlement) {
    return c.json(
      { error: result.errors?.[0] ?? '发放结算失败' },
      400,
    );
  }

  console.log(
    `[GM] ${admin.email ?? admin.id} 向角色 ${cultivator.name}(${cultivator.id}) 发放` +
      ` 灯油券=${input.spiritStones ?? 0} 声望=${input.reputation ?? 0} 灯韵=${input.cultivationExp ?? 0}` +
      ` 寿元=${input.lifespan ?? 0} 窥悟=${input.comprehensionInsight ?? 0}` +
      (input.note ? ` 备注：${input.note}` : ''),
  );

  const response: GmGrantResponse = {
    success: true,
    cultivatorId: cultivator.id,
    name: cultivator.name,
    granted: {
      spiritStones: input.spiritStones,
      reputation: input.reputation,
      cultivationExp: input.cultivationExp,
      lifespan: input.lifespan,
      comprehensionInsight: input.comprehensionInsight,
      items: grantedItems.length ? grantedItems : undefined,
    },
    balances: {
      spiritStones: result.settlement.spiritStones ?? 0,
      reputation: result.settlement.reputation ?? 0,
      lifespan: result.settlement.lifespan,
    },
  };
  return c.json(response);
});

export default router;

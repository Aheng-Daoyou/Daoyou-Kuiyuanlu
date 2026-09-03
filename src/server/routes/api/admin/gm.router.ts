import { getExecutor } from '@server/lib/drizzle/db';
import { cultivators } from '@server/lib/drizzle/schema';
import { requireAdmin } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { resourceEngine } from '@server/lib/services/resource/ResourceEngine';
import {
  GmGrantRequestSchema,
  GmPlayerQuerySchema,
  type GmGrantResponse,
  type GmPlayerSummary,
} from '@shared/contracts/gmTools';
import type { ResourceOperation } from '@shared/engine/resource/types';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { Hono } from 'hono';

/**
 * GM 工具路由（requireAdmin 全程把关）：
 * - GET  /api/admin/gm/players?query=  按名字搜索角色
 * - POST /api/admin/gm/grant           向角色直接发放灯油券/声望/灯韵
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

  const gain: ResourceOperation[] = [];
  if (input.spiritStones) gain.push({ type: 'spirit_stones', value: input.spiritStones });
  if (input.reputation) gain.push({ type: 'reputation', value: input.reputation });
  if (input.cultivationExp) gain.push({ type: 'cultivation_exp', value: input.cultivationExp });

  const result = await q.transaction(async (tx) =>
    resourceEngine.applyInTransaction({
      userId: cultivator.userId,
      cultivatorId: cultivator.id,
      gain,
      tx,
    }),
  );

  if (!result.success || !result.settlement) {
    return c.json(
      { error: result.errors?.[0] ?? '发放结算失败' },
      400,
    );
  }

  console.log(
    `[GM] ${admin.email ?? admin.id} 向角色 ${cultivator.name}(${cultivator.id}) 发放` +
      ` 灯油券=${input.spiritStones ?? 0} 声望=${input.reputation ?? 0} 灯韵=${input.cultivationExp ?? 0}` +
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
    },
    balances: {
      spiritStones: result.settlement.spiritStones ?? 0,
      reputation: result.settlement.reputation ?? 0,
    },
  };
  return c.json(response);
});

export default router;

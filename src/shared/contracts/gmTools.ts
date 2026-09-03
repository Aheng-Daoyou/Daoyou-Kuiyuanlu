import { z } from 'zod';

/** GM 工具契约 —— 管理员向指定角色直接发放资源（测试/补偿用） */

export const GmPlayerQuerySchema = z.object({
  query: z.string().trim().min(1).max(100),
});

export type GmPlayerQuery = z.infer<typeof GmPlayerQuerySchema>;

export interface GmPlayerSummary {
  id: string;
  name: string;
  realm: string;
  realmStage: string;
  spiritStones: number;
  reputation: number;
  userId: string;
}

/**
 * 服务端引擎对单次资源变动的安全上限（对齐 CultivatorStateRepository.RESOURCE_SAFETY）。
 * GM 发放超过单次上限时，服务端会自动拆成多次操作在同一事务内执行。
 */
export const GM_GRANT_CHUNK_SIZES = {
  spiritStones: 10_000_000,
  reputation: 9_999,
  cultivationExp: 10_000_000,
  lifespan: 100_000,
} as const;

export const GmGrantRequestSchema = z
  .object({
    cultivatorId: z.string().uuid(),
    spiritStones: z.number().int().min(0).max(1_000_000_000).optional(),
    reputation: z.number().int().min(0).max(1_000_000).optional(),
    cultivationExp: z.number().int().min(0).max(1_000_000_000).optional(),
    lifespan: z.number().int().min(0).max(10_000_000).optional(),
    comprehensionInsight: z.number().int().min(1).max(100).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.spiritStones ||
          value.reputation ||
          value.cultivationExp ||
          value.lifespan ||
          value.comprehensionInsight,
      ),
    { message: '至少填写一项发放数额' },
  );

export type GmGrantRequest = z.infer<typeof GmGrantRequestSchema>;

export interface GmGrantResponse {
  success: true;
  cultivatorId: string;
  name: string;
  granted: {
    spiritStones?: number;
    reputation?: number;
    cultivationExp?: number;
    lifespan?: number;
    comprehensionInsight?: number;
  };
  balances: {
    spiritStones: number;
    reputation: number;
    lifespan?: number;
  };
}

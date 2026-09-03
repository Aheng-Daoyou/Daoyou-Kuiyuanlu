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

/** 道具库 itemId 规则与 itemLibrary 保持一致（字母数字_-，便于直接粘贴） */
const GmGrantItemItemIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, '道具 ID 仅支持字母、数字、_ 和 -');

export const GmGrantItemSchema = z.object({
  itemId: GmGrantItemItemIdSchema,
  quantity: z.number().int().min(1).max(999),
});

export const GmGrantRequestSchema = z
  .object({
    cultivatorId: z.string().uuid(),
    spiritStones: z.number().int().min(0).max(1_000_000_000).optional(),
    reputation: z.number().int().min(0).max(1_000_000).optional(),
    cultivationExp: z.number().int().min(0).max(1_000_000_000).optional(),
    lifespan: z.number().int().min(0).max(10_000_000).optional(),
    // 引擎会把窥悟自动封顶在 0~100，这里放开录入上限，超出部分自动截断
    comprehensionInsight: z.number().int().min(1).max(100_000).optional(),
    // 灯油走 QiService.restoreQi（source=gm），自动封顶在溢出上限（QI_OVERFLOW_MAX）
    qi: z.number().int().min(1).max(10_000).optional(),
    // 宗门贡献带符号增量：正数=发放（当期与终身贡献同加），负数=扣减（仅当期，自动截断到 0）
    sectContribution: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    items: z.array(GmGrantItemSchema).max(5).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.spiritStones ||
          value.reputation ||
          value.cultivationExp ||
          value.lifespan ||
          value.comprehensionInsight ||
          value.qi ||
          value.sectContribution ||
          (value.items && value.items.length > 0),
      ),
    { message: '至少填写一项发放内容' },
  );

export type GmGrantRequest = z.infer<typeof GmGrantRequestSchema>;
export type GmGrantItem = z.infer<typeof GmGrantItemSchema>;

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
    qi?: {
      before: number;
      after: number;
      restored: number;
    };
    items?: Array<{ itemId: string; name: string; quantity: number }>;
    sectContribution?: {
      before: number;
      after: number;
      lifetimeContribution: number;
    };
  };
  balances: {
    spiritStones: number;
    reputation: number;
    lifespan?: number;
  };
}

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

export const GmGrantRequestSchema = z
  .object({
    cultivatorId: z.string().uuid(),
    spiritStones: z.number().int().min(0).max(100_000_000).optional(),
    reputation: z.number().int().min(0).max(1_000_000).optional(),
    cultivationExp: z.number().int().min(0).max(100_000_000).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.spiritStones || value.reputation || value.cultivationExp,
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
  };
  balances: {
    spiritStones: number;
    reputation: number;
  };
}

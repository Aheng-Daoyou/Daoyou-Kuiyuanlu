import { auth } from '@server/lib/auth/auth';
import {
  getValidatedJson,
  requireUser,
  validateJson,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  AccountSetPasswordRequestSchema,
  type AccountSetPasswordRequest,
  type AccountSetPasswordResponse,
} from '@shared/contracts/account';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.post(
  '/password',
  requireUser(),
  validateJson(AccountSetPasswordRequestSchema),
  async (c) => {
    const { newPassword } = getValidatedJson<AccountSetPasswordRequest>(c);
    try {
      const result = await auth.api.setPassword({
        body: { newPassword },
        headers: c.req.raw.headers,
      });

      const payload: AccountSetPasswordResponse = {
        success: true,
        data: {
          status: result.status,
        },
      };

      return c.json(payload);
    } catch (error) {
      // better-auth 校验失败抛 APIError（自带业务状态码），必须映射为 4xx，
      // 否则会落 app.onError 变成 500。
      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        typeof (error as { statusCode: unknown }).statusCode === 'number'
      ) {
        const apiError = error as { statusCode: number; message?: string };
        return c.json(
          { success: false, error: apiError.message || '密码设置失败' },
          Math.min(499, Math.max(400, apiError.statusCode)) as 400,
        );
      }
      throw error;
    }
  },
);

export default router;

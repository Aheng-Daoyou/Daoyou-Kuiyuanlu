import {
  getValidatedJson,
  getValidatedQuery,
  requireActiveCultivatorRef,
  validateJson,
  validateQuery,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { checkAndAcquireCooldown } from '@server/lib/redis/worldChatLimiter';
import * as creationProductRepository from '@server/lib/repositories/creationProductRepository';
import {
  createMessage,
  listLatestMessages,
  listMessages,
} from '@server/lib/repositories/worldChatRepository';
import {
  getCultivatorConsumableById,
  getCultivatorMaterialById,
} from '@server/lib/services/cultivator/CultivatorInventoryRepository';
import {
  WorldChatCreateMessageSchema,
  WorldChatListQuerySchema,
  type WorldChatCreateMessageRequest,
  type WorldChatListQuery,
} from '@shared/contracts/world-chat';
import type {
  ItemShowcaseSnapshotMap,
  WorldChatItemShowcasePayload,
} from '@shared/types/world-chat';
import { Hono } from 'hono';
import { readCultivatorPublicIdentity } from '@server/lib/services/cultivator/CultivatorFactsReader';

function countChars(input: string): number {
  return Array.from(input).length;
}

function normalizeText(
  payload: Extract<WorldChatCreateMessageRequest, { messageType: 'text' }>,
): string {
  return (payload.textContent ?? payload.payload?.text ?? '').trim();
}

async function buildItemShowcasePayload(params: {
  cultivatorId: string;
  itemType: 'artifact' | 'material' | 'consumable' | 'skill' | 'gongfa';
  itemId: string;
  text?: string;
}): Promise<WorldChatItemShowcasePayload | null> {
  const { cultivatorId, itemType, itemId, text } = params;
  const showcaseText = text?.trim() || undefined;

  if (
    itemType === 'artifact' ||
    itemType === 'skill' ||
    itemType === 'gongfa'
  ) {
    const item = await creationProductRepository.findById(itemId);
    if (
      !item ||
      item.cultivatorId !== cultivatorId ||
      item.productType !== itemType
    ) {
      return null;
    }

    if (itemType === 'artifact') {
      const snapshot: ItemShowcaseSnapshotMap['artifact'] = {
        id: item.id,
        name: item.name,
        slot: item.slot as ItemShowcaseSnapshotMap['artifact']['slot'],
        element: item.element as ItemShowcaseSnapshotMap['artifact']['element'],
        quality: item.quality as ItemShowcaseSnapshotMap['artifact']['quality'],
        description: item.description ?? undefined,
        productModel: item.productModel,
      };
      return { itemType, itemId, snapshot, text: showcaseText };
    }

    const snapshot: ItemShowcaseSnapshotMap[typeof itemType] = {
      id: item.id,
      name: item.name,
      productType: itemType,
      element:
        item.element as ItemShowcaseSnapshotMap[typeof itemType]['element'],
      quality:
        item.quality as ItemShowcaseSnapshotMap[typeof itemType]['quality'],
      description: item.description,
      score: item.score ?? 0,
      productModel: item.productModel,
    };
    return { itemType, itemId, snapshot, text: showcaseText };
  }

  if (itemType === 'material') {
    const item = await getCultivatorMaterialById(cultivatorId, itemId);
    if (!item) return null;
    const snapshot: ItemShowcaseSnapshotMap['material'] = {
      id: item.id || itemId,
      name: item.name,
      type: item.type,
      rank: item.rank,
      element: item.element,
      description: item.description,
      quantity: item.quantity,
    };
    return { itemType, itemId, snapshot, text: showcaseText };
  }

  const item = await getCultivatorConsumableById(cultivatorId, itemId);
  if (!item) return null;
  const snapshot: ItemShowcaseSnapshotMap['consumable'] = {
    id: item.id || itemId,
    name: item.name,
    type: item.type,
    quality: item.quality,
    quantity: item.quantity,
    description: item.description,
    spec: item.spec,
  };
  return { itemType, itemId, snapshot, text: showcaseText };
}

const router = new Hono<AppEnv>();

router.get('/messages', validateQuery(WorldChatListQuerySchema), async (c) => {
  const { channel, limit, page, pageSize } =
    getValidatedQuery<WorldChatListQuery>(c);

  if (limit) {
    const messages = await listLatestMessages(limit, channel);
    return c.json({
      success: true,
      data: messages,
    });
  }

  const currentPage = page || 1;
  const currentPageSize = pageSize || 20;
  const result = await listMessages({
    channel,
    page: currentPage,
    pageSize: currentPageSize,
  });

  return c.json({
    success: true,
    data: result.messages,
    pagination: {
      page: currentPage,
      pageSize: currentPageSize,
      hasMore: result.hasMore,
    },
  });
});

router.post(
  '/messages',
  requireActiveCultivatorRef(),
  validateJson(WorldChatCreateMessageSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const cultivator = c.get('activeCultivatorRef');
      if (!user || !cultivator) {
        return c.json({ success: false, error: '未授权访问' }, 401);
      }

      const parsed = getValidatedJson<WorldChatCreateMessageRequest>(c);
      const identity = await readCultivatorPublicIdentity(
        cultivator.cultivatorId,
      );
      const cooldown = await checkAndAcquireCooldown(
        cultivator.cultivatorId,
        identity.realm,
      );
      if (!cooldown.allowed) {
        return c.json(
          {
            success: false,
            error: `请 ${cooldown.remainingSeconds} 秒后再发言`,
            remainingSeconds: cooldown.remainingSeconds,
          },
          429,
        );
      }

      const senderBase = {
        senderUserId: user.id,
        senderCultivatorId: cultivator.cultivatorId,
        senderName: identity.name,
        senderRealm: identity.realm,
        senderRealmStage: identity.realmStage,
      };

      let message;
      if (parsed.messageType === 'text') {
        const text = normalizeText(parsed);
        const textLength = countChars(text);
        if (textLength < 1 || textLength > 100) {
          return c.json(
            { success: false, error: '消息长度需在 1-100 字之间' },
            400,
          );
        }

        message = await createMessage({
          ...senderBase,
          channel: 'world',
          messageType: 'text',
          textContent: text,
          payload: { text },
        });
      } else {
        const showcaseText = (
          parsed.textContent ??
          parsed.payload?.text ??
          ''
        ).trim();
        if (countChars(showcaseText) > 100) {
          return c.json(
            { success: false, error: '附言长度需在 100 字以内' },
            400,
          );
        }

        const payload = await buildItemShowcasePayload({
          cultivatorId: cultivator.cultivatorId,
          itemType: parsed.itemType,
          itemId: parsed.itemId,
          text: showcaseText,
        });

        if (!payload) {
          return c.json(
            { success: false, error: '道具不存在或不属于当前角色' },
            404,
          );
        }

        message = await createMessage({
          ...senderBase,
          channel: 'world',
          messageType: 'item_showcase',
          textContent: payload.text,
          payload,
        });
      }

      return c.json({
        success: true,
        data: message,
      });
    } catch (error) {
      console.error('Create world chat message error:', error);
      return c.json({ success: false, error: '发送失败，请稍后重试' }, 500);
    }
  },
);

export default router;

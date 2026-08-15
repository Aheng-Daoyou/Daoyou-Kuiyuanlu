import { renderPrompt } from '@server/lib/prompts';
import { redis } from '@server/lib/redis';
import { parseRedisJson } from '@server/lib/redis/json';
import { generateAiArray } from '@server/utils/aiClient';
import {
  buildFallbackBlackMarketDescriptionHints,
  type BlackMarketDescriptionHint,
} from '@shared/lib/blackMarketDescriptionHints';
import { stableCompactStringify, truncateText } from '@server/utils/llmPayload';
import { QUALITY_ORDER } from '@shared/types/constants';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Material } from '@shared/types/cultivator';

const CACHE_TTL_SECONDS = 24 * 60 * 60;
const LLM_MIN_QUALITY_ORDER = QUALITY_ORDER['天品'];

const hintSchema = z.object({
  safeText: z.string().trim().min(1).max(160),
  sensitivity: z.enum(['vague', 'moderate', 'strong']),
});

function toHints(
  hints: Array<{ safeText: string; sensitivity: 'vague' | 'moderate' | 'strong' }>,
): BlackMarketDescriptionHint[] {
  return hints.slice(0, 5).map((hint, index) => ({
    id: `description-hint-${index}`,
    safeText: truncateText(hint.safeText, 160),
    sensitivity: hint.sensitivity,
  }));
}

function cacheKey(item: Material, itemLibraryItemId?: string): string {
  const identity = itemLibraryItemId
    ? `item:${itemLibraryItemId}`
    : `content:${createHash('sha256')
        .update(`${item.name}\u0000${item.description ?? ''}`)
        .digest('hex')}`;
  return `black-market:description-hints:v1:${identity}`;
}

async function readCachedHints(
  key: string,
): Promise<BlackMarketDescriptionHint[] | null> {
  try {
    return parseRedisJson<BlackMarketDescriptionHint[]>(
      await redis.get(key),
      'black market description hints',
    );
  } catch (error) {
    console.warn('[black-market] description hints cache read failed', {
      error,
    });
    return null;
  }
}

async function writeCachedHints(
  key: string,
  hints: BlackMarketDescriptionHint[],
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(hints), 'EX', CACHE_TTL_SECONDS);
  } catch (error) {
    console.warn('[black-market] description hints cache write failed', {
      error,
    });
  }
}

export class BlackMarketDescriptionHintService {
  async build(input: {
    item: Material;
    itemLibraryItemId?: string;
    abortSignal?: AbortSignal;
  }): Promise<BlackMarketDescriptionHint[]> {
    const fallback = () =>
      buildFallbackBlackMarketDescriptionHints(input.item);

    // Low-tier materials do not need an LLM pass; their observable details are
    // generic enough that the deterministic fallback keeps the experience
    // intact while saving one LLM call for the majority of black-market items.
    if (QUALITY_ORDER[input.item.rank] < LLM_MIN_QUALITY_ORDER) {
      return fallback();
    }

    const key = cacheKey(input.item, input.itemLibraryItemId);
    const cached = await readCachedHints(key);
    if (cached && cached.length >= 3) {
      return cached;
    }

    const payload = stableCompactStringify({
      materialName: input.item.name,
      materialDescription: truncateText(input.item.description ?? '', 800),
    });

    const { system, user } = renderPrompt('black-market-description-hints', {
      payloadJson: payload,
    });

    try {
      const response = await generateAiArray({
        system,
        prompt: user,
        elementSchema: hintSchema,
        name: 'BlackMarketDescriptionHint',
        sceneId: 'black-market-description-hints',
        abortSignal: input.abortSignal,
        maxOutputTokens: 600,
      });
      if (response.output.length < 3) {
        throw new Error('too few black market description hints');
      }
      const hints = toHints(response.output);
      await writeCachedHints(key, hints);
      return hints;
    } catch (error) {
      if (input.abortSignal?.aborted) throw error;
      console.warn('[black-market] description hints LLM fallback', {
        error,
      });
      return fallback();
    }
  }
}

export const blackMarketDescriptionHintService =
  new BlackMarketDescriptionHintService();

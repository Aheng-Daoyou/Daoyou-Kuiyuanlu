import { renderPrompt } from '@server/lib/prompts';
import { generateAiArray } from '@server/utils/aiClient';
import {
  buildFallbackBlackMarketDescriptionHints,
  type BlackMarketDescriptionHint,
} from '@shared/lib/blackMarketDescriptionHints';
import { stableCompactStringify, truncateText } from '@server/utils/llmPayload';
import { z } from 'zod';
import type { Material } from '@shared/types/cultivator';

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

export class BlackMarketDescriptionHintService {
  async build(input: {
    item: Material;
    abortSignal?: AbortSignal;
  }): Promise<BlackMarketDescriptionHint[]> {
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
      return toHints(response.output);
    } catch (error) {
      if (input.abortSignal?.aborted) throw error;
      console.warn('[black-market] description hints LLM fallback', {
        error,
      });
      return buildFallbackBlackMarketDescriptionHints(input.item);
    }
  }
}

export const blackMarketDescriptionHintService =
  new BlackMarketDescriptionHintService();

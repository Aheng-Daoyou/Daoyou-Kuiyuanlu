import { renderPrompt } from '@server/lib/prompts';
import { generateAiObject, generateAiText } from '@server/utils/aiClient';
import {
  stableCompactStringify,
  truncateText,
} from '@server/utils/llmPayload';
import type { BlackMarketNegotiationOutcome } from '@shared/lib/blackMarketNegotiation';
import { z } from 'zod';
import type {
  BlackMarketTurnContext,
  BlackMarketTurnProposal,
} from './types';

const turnProposalSchema = z.object({
  intent: z.enum([
    'chat',
    'inspect',
    'question',
    'haggle',
    'buy',
    'leave',
  ]),
  reply: z.string().trim().min(1).max(220),
  revealClueIds: z.array(z.string().min(1).max(64)).max(3),
  revealDescriptionHintIds: z.array(z.string().min(1).max(64)).max(1),
  referencedClueIds: z.array(z.string().min(1).max(64)).max(3),
  negotiation: z
    .object({
      decision: z.enum(['accept', 'counter', 'reject']),
      concession: z.number().min(0).max(1),
      patienceDelta: z.union([z.literal(-2), z.literal(-1), z.literal(0)]),
    })
    .optional(),
  tone: z
    .enum(['normal', 'defensive', 'impatient', 'pleased', 'cagey'])
    .optional(),
});

function degradedProposal(
  context: BlackMarketTurnContext,
): BlackMarketTurnProposal {
  return {
    intent: context.offeredPrice != null ? 'haggle' : 'chat',
    reply:
      context.offeredPrice != null
        ? '摊主盯着你看了片刻，没有立刻接下这轮讨价还价。'
        : '摊主没有听清你的话，只是不置可否地看了你一眼。',
    revealClueIds: [],
    revealDescriptionHintIds: [],
    referencedClueIds: [],
    negotiation:
      context.offeredPrice != null
        ? { decision: 'counter', concession: 0.25, patienceDelta: -1 }
        : undefined,
  };
}

function fallbackReply(
  outcome: BlackMarketNegotiationOutcome['outcome'],
  price: number,
): string {
  switch (outcome) {
    case 'accepted':
      return `行，就按你说的，${price}灵石。`;
    case 'countered':
      return `最多让到${price}灵石。`;
    case 'locked':
      return `价就定在${price}灵石，再谈便不卖了。`;
    case 'rejected':
      return `这个价不成，仍是${price}灵石。`;
  }
}

export class BlackMarketConversationService {
  async proposeTurn(input: {
    context: BlackMarketTurnContext;
    abortSignal?: AbortSignal;
  }): Promise<{
    proposal: BlackMarketTurnProposal;
    degraded: boolean;
  }> {
    const payload = stableCompactStringify({
      scene: input.context.scene,
      npc: input.context.npc,
      listing: input.context.listing,
      currentPrice: input.context.currentPrice,
      offerAssessment: input.context.offerAssessment ?? null,
      canInspect: input.context.canInspect,
      canHaggle: input.context.canHaggle,
      dealReady: input.context.dealReady,
      knownClues: input.context.knownClues,
      availableClues: input.context.availableClues,
      availableDescriptionHints: input.context.availableDescriptionHints,
      revealedDescriptionHints: input.context.revealedDescriptionHints,
      conversation: input.context.conversation
        .slice(-12)
        .map((message) => ({
          role: message.role,
          body: truncateText(message.body, 220),
        })),
      playerMessage: truncateText(input.context.playerMessage, 240),
      offeredPrice: input.context.offeredPrice ?? null,
    });

    const { system, user } = renderPrompt('black-market-turn', {
      payloadJson: payload,
    });

    try {
      const response = await generateAiObject({
        system,
        prompt: user,
        schema: turnProposalSchema,
        name: 'BlackMarketTurnProposal',
        sceneId: 'black-market-turn',
        abortSignal: input.abortSignal,
        maxOutputTokens: 600,
      });
      return { proposal: response.output, degraded: false };
    } catch (error) {
      if (input.abortSignal?.aborted) throw error;
      console.warn('[black-market] turn proposal LLM fallback', {
        error,
      });
      return {
        proposal: degradedProposal(input.context),
        degraded: true,
      };
    }
  }

  async renderTurnReply(input: {
    context: BlackMarketTurnContext;
    proposal: BlackMarketTurnProposal;
    negotiationOutcome: BlackMarketNegotiationOutcome;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const payload = stableCompactStringify({
      npc: input.context.npc,
      listing: input.context.listing,
      currentPrice: input.context.currentPrice,
      knownClues: input.context.knownClues,
      conversation: input.context.conversation
        .slice(-12)
        .map((message) => ({
          role: message.role,
          body: truncateText(message.body, 220),
        })),
      playerMessage: truncateText(input.context.playerMessage, 240),
      proposal: input.proposal,
      negotiationResult: {
        outcome: input.negotiationOutcome.outcome,
        previousPrice: input.negotiationOutcome.previousPrice,
        nextPrice: input.negotiationOutcome.nextPrice,
        nextPatience: input.negotiationOutcome.nextPatience,
      },
    });

    const { system, user } = renderPrompt('black-market-reply', {
      payloadJson: payload,
    });

    try {
      const response = await generateAiText({
        system,
        prompt: user,
        sceneId: 'black-market-reply',
        abortSignal: input.abortSignal,
        maxOutputTokens: 220,
      });
      const reply = response.text?.trim();
      if (!reply) {
        throw new Error('empty black market turn reply');
      }
      return truncateText(reply, 220);
    } catch (error) {
      if (input.abortSignal?.aborted) throw error;
      console.warn('[black-market] turn reply LLM fallback', {
        error,
      });
      return fallbackReply(
        input.negotiationOutcome.outcome,
        input.negotiationOutcome.nextPrice,
      );
    }
  }
}

export const blackMarketConversationService =
  new BlackMarketConversationService();

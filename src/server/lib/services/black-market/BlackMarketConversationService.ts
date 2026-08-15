import { renderPrompt } from '@server/lib/prompts';
import { generateAiObject, generateAiText } from '@server/utils/aiClient';
import { truncateText } from '@server/utils/llmPayload';
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

function turnPayload(context: BlackMarketTurnContext): string {
  const knownClues = context.knownClues.map((clue) => ({
    id: clue.id,
    kind: clue.kind,
    text: truncateText(clue.text, 120),
  }));
  const availableClues = context.availableClues.map((clue) => ({
    id: clue.id,
    kind: clue.kind,
    safeFact: truncateText(clue.safeFact, 120),
  }));
  const availableDescriptionHints = context.availableDescriptionHints.map(
    (hint) => ({
      id: hint.id,
      safeText: truncateText(hint.safeText, 120),
      sensitivity: hint.sensitivity,
    }),
  );
  const revealedDescriptionHints = context.revealedDescriptionHints.map(
    (hint) => ({
      id: hint.id,
      safeText: truncateText(hint.safeText, 120),
      sensitivity: hint.sensitivity,
    }),
  );
  const conversation = context.conversation.slice(-6).map((message) => ({
    role: message.role,
    body: truncateText(message.body, 120),
  }));

  // Insertion order is intentional: stable fields first, turn-specific fields
  // last. JSON.stringify preserves this order, unlike stableCompactStringify
  // which sorts keys and breaks DeepSeek prefix caching.
  return JSON.stringify({
    scene: context.scene,
    listing: context.listing,
    npc: {
      voice: context.npc.voice,
      identity: context.npc.identity,
      flexibilityLevel: context.npc.flexibilityLevel,
      mood: context.npc.mood,
    },
    currentPrice: context.currentPrice,
    knownClues,
    availableClues,
    availableDescriptionHints,
    revealedDescriptionHints,
    dealReady: context.dealReady,
    canInspect: context.canInspect,
    canHaggle: context.canHaggle,
    offerAssessment: context.offerAssessment ?? null,
    offeredPrice: context.offeredPrice ?? null,
    playerMessage: truncateText(context.playerMessage, 240),
    conversation,
  });
}

function replyPayload(
  context: BlackMarketTurnContext,
  proposal: BlackMarketTurnProposal,
  negotiationOutcome: BlackMarketNegotiationOutcome,
): string {
  const lastPlayerMessage =
    [...context.conversation]
      .reverse()
      .find((message) => message.role === 'player')?.body ??
    context.playerMessage;

  return JSON.stringify({
    npc: {
      name: context.npc.name,
      voice: context.npc.voice,
      mood: context.npc.mood,
    },
    lastPlayerMessage: truncateText(lastPlayerMessage, 240),
    proposalTone: proposal.tone ?? null,
    negotiationResult: {
      outcome: negotiationOutcome.outcome,
      previousPrice: negotiationOutcome.previousPrice,
      nextPrice: negotiationOutcome.nextPrice,
      nextPatience: negotiationOutcome.nextPatience,
    },
  });
}

export class BlackMarketConversationService {
  async proposeTurn(input: {
    context: BlackMarketTurnContext;
    abortSignal?: AbortSignal;
  }): Promise<{
    proposal: BlackMarketTurnProposal;
    degraded: boolean;
  }> {
    const { system, user } = renderPrompt('black-market-turn', {
      payloadJson: turnPayload(input.context),
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
    const { system, user } = renderPrompt('black-market-reply', {
      payloadJson: replyPayload(
        input.context,
        input.proposal,
        input.negotiationOutcome,
      ),
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

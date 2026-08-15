import type { DbTransaction } from '@server/lib/drizzle/db';
import { cultivators, materials } from '@server/lib/drizzle/schema';
import { redisLockKeys, withRedisLock } from '@server/lib/redis/lock';
import { findPlayerMutationRequest } from '@server/lib/repositories/playerStateRepository';
import { playerCommandExecutor } from '@server/lib/services/CommandExecutors';
import {
  materialLibraryEntryToMaterial,
  sampleMaterialLibraryEntryByPreferences,
} from '@server/lib/services/MaterialLibraryService';
import { readCultivatorRealm } from '@server/lib/services/cultivator/CultivatorFactsReader';
import { mapMaterialRow } from '@server/lib/services/cultivator/CultivatorInventoryRepository';
import { addMaterialStackToInventory } from '@server/lib/services/materialInventory';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import {
  applyBlackMarketPriceDecision,
  assessOffer,
} from '@shared/lib/blackMarketNegotiation';
import {
  computeBlackMarketTrueValue,
  createBlackMarketPricing,
} from '@shared/lib/blackMarketPricing';
import {
  BLACK_MARKET_MAX_INSPECTIONS,
  BLACK_MARKET_REFRESH_MS,
  blackMarketUnit,
  classifyBlackMarketReveal,
} from '@shared/lib/blackMarketRules';
import {
  BLACK_MARKET_QUALITY_WEIGHTS,
  getMarketConfigByNodeId,
  getNodeRegionTags,
  getRegionProfile,
  isMarketNodeEnabled,
  validateLayerAccess,
} from '@shared/lib/game/marketConfig';
import {
  type BlackMarketInteractCommand,
  type BlackMarketInteractionResult,
  type BlackMarketNegotiationMood,
  type BlackMarketNpcId,
  type BlackMarketOverview,
  type BlackMarketReveal,
  type BlackMarketSessionView,
} from '@shared/types/blackMarket';
import {
  MATERIAL_TYPE_VALUES,
  QUALITY_ORDER,
  QUALITY_VALUES,
} from '@shared/types/constants';
import { and, eq, sql } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import {
  buildBlackMarketMask,
  buildBlackMarketSafeClues,
} from './BlackMarketClueService';
import { blackMarketConversationService } from './BlackMarketConversationService';
import { blackMarketDescriptionHintService } from './BlackMarketDescriptionHintService';
import { BLACK_MARKET_NPCS, getBlackMarketNpc } from './BlackMarketNpcConfig';
import { blackMarketSessionRepository } from './BlackMarketSessionRepository';
import type {
  BlackMarketInternalSession,
  BlackMarketTurnContext,
  BlackMarketTurnProposal,
} from './types';

const PURCHASE_SOURCE = 'black_market_purchase';
const SESSION_MESSAGE_LIMIT = 24;

type Actor = { userId: string; cultivatorId: string };

export class BlackMarketServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function currentCycle(now = Date.now()): number {
  return Math.floor(now / BLACK_MARKET_REFRESH_MS);
}

function cycleEnd(cycle: number): number {
  return (cycle + 1) * BLACK_MARKET_REFRESH_MS;
}

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET?.trim();
  if (!value)
    throw new Error('BETTER_AUTH_SECRET is required for black market');
  return value;
}

function derive(parts: readonly (string | number)[]): string {
  return createHmac('sha256', secret())
    .update(`black-market-v1:${parts.join(':')}`)
    .digest('hex');
}

function sessionIdentity(input: {
  cultivatorId: string;
  nodeId: string;
  npcId: BlackMarketNpcId;
  cycle: number;
}) {
  const seed = derive([
    input.cultivatorId,
    input.nodeId,
    input.npcId,
    input.cycle,
  ]);
  return {
    seed,
    sessionId: derive(['session', seed]).slice(0, 40),
    listingId: derive(['listing', seed]).slice(0, 40),
  };
}

function purchaseRequestId(input: {
  nodeId: string;
  npcId: BlackMarketNpcId;
  cycle: number;
}): string {
  return `${input.nodeId}:${input.cycle}:${input.npcId}`;
}

function weightedPick<T extends string>(
  entries: readonly { value: T; weight: number }[],
  unit: number,
): T {
  const total = entries.reduce(
    (sum, entry) => sum + Math.max(0, entry.weight),
    0,
  );
  if (total <= 0) return entries[0].value;
  let roll = unit * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

function rotatePreferred<T>(values: readonly T[], preferred: T): T[] {
  return [preferred, ...values.filter((value) => value !== preferred)];
}

function selectMaterialPreferences(seed: string, nodeId: string) {
  const profile = getRegionProfile(nodeId);
  const materialType = weightedPick(
    MATERIAL_TYPE_VALUES.map((value) => ({
      value,
      weight: profile.typeWeights[value] ?? 0.25,
    })),
    blackMarketUnit(seed, 'material-type'),
  );
  const qualities = QUALITY_VALUES.filter(
    (quality) => QUALITY_ORDER[quality] >= QUALITY_ORDER['真品'],
  );
  const quality = weightedPick(
    qualities.map((value) => ({
      value,
      weight: BLACK_MARKET_QUALITY_WEIGHTS[value] ?? 1,
    })),
    blackMarketUnit(seed, 'quality'),
  );
  const materialTypes = [...MATERIAL_TYPE_VALUES].sort(
    (left, right) =>
      (profile.typeWeights[right] ?? 0) - (profile.typeWeights[left] ?? 0),
  );
  return {
    materialTypes: rotatePreferred(materialTypes, materialType),
    qualities: rotatePreferred(
      [...qualities].sort(
        (left, right) =>
          Math.abs(QUALITY_ORDER[left] - QUALITY_ORDER[quality]) -
          Math.abs(QUALITY_ORDER[right] - QUALITY_ORDER[quality]),
      ),
      quality,
    ),
  };
}
function appendMessages(
  session: BlackMarketInternalSession,
  messages: BlackMarketInternalSession['messages'],
): void {
  session.messages = [...session.messages, ...messages].slice(
    -SESSION_MESSAGE_LIMIT,
  );
}

function negotiationMood(
  session: BlackMarketInternalSession,
): BlackMarketNegotiationMood {
  if (session.phase === 'deal_ready' || session.phase === 'completed') {
    return 'agreed';
  }
  if (session.pricing.patience <= 0) return 'closed';
  if (session.pricing.patience === 1) return 'impatient';
  if (session.pricing.patience === 2) return 'guarded';
  return 'calm';
}

function publicSession(
  session: BlackMarketInternalSession,
): BlackMarketSessionView {
  const revealed = new Set(session.revealedClueIds);
  return {
    id: session.id,
    nodeId: session.nodeId,
    npcId: session.npcId,
    cycle: session.cycle,
    phase: session.cycle === currentCycle() ? session.phase : 'expired',
    listing: {
      id: session.listingId,
      disguisedName: session.disguisedName,
      description: session.disguisedDescription,
    },
    initialPrice: session.pricing.initialPrice,
    currentPrice: session.pricing.currentPrice,
    canInspect:
      session.cycle === currentCycle() &&
      session.phase === 'talking' &&
      session.inspectTurnsUsed < BLACK_MARKET_MAX_INSPECTIONS,
    canHaggle:
      session.cycle === currentCycle() &&
      session.phase === 'talking' &&
      session.pricing.patience > 0,
    negotiationMood: negotiationMood(session),
    revealedClues: session.clues
      .filter((clue) => revealed.has(clue.id))
      .map(({ id, kind, text }) => ({ id, kind, text })),
    messages: session.messages,
    version: session.version,
    expiresAt: session.expiresAt,
    reveal: session.reveal,
  };
}

function assertCurrentSession(
  session: BlackMarketInternalSession,
  actor: Actor,
): void {
  if (
    session.userId !== actor.userId ||
    session.cultivatorId !== actor.cultivatorId
  ) {
    throw new BlackMarketServiceError(404, '没有找到这场黑市交易');
  }
  if (session.cycle !== currentCycle() || session.expiresAt <= Date.now()) {
    throw new BlackMarketServiceError(410, '这批黑市货物已经收摊');
  }
  if (session.phase === 'completed') {
    throw new BlackMarketServiceError(409, '这件货物已经成交');
  }
}

function assertConversationOpen(session: BlackMarketInternalSession): void {
  if (session.phase === 'deal_ready') {
    throw new BlackMarketServiceError(
      409,
      '摊主已经点头，这个价只等你成交或转身离开',
    );
  }
}

async function completedPurchase(
  cultivatorId: string,
  nodeId: string,
  npcId: BlackMarketNpcId,
  cycle: number,
) {
  return findPlayerMutationRequest(
    cultivatorId,
    PURCHASE_SOURCE,
    purchaseRequestId({ nodeId, npcId, cycle }),
  );
}

async function assertAccess(actor: Actor, nodeId: string) {
  if (!isMarketNodeEnabled(nodeId)) {
    throw new BlackMarketServiceError(404, '此地没有开放坊市');
  }
  const config = getMarketConfigByNodeId(nodeId);
  const { realm } = await readCultivatorRealm(actor.cultivatorId);
  const access = validateLayerAccess(realm, 'black', config);
  if (!access.allowed) {
    throw new BlackMarketServiceError(403, access.reason || '无法进入黑市');
  }
  return access;
}

async function generateSession(input: {
  actor: Actor;
  nodeId: string;
  npcId: BlackMarketNpcId;
  cycle: number;
}): Promise<BlackMarketInternalSession> {
  const identity = sessionIdentity({
    cultivatorId: input.actor.cultivatorId,
    nodeId: input.nodeId,
    npcId: input.npcId,
    cycle: input.cycle,
  });
  const preferences = selectMaterialPreferences(identity.seed, input.nodeId);
  const entry = await sampleMaterialLibraryEntryByPreferences({
    ...preferences,
    seed: `${identity.seed}:library`,
  });
  if (!entry) {
    throw new BlackMarketServiceError(503, '黑市今日无货，请稍后再来');
  }
  const hiddenItem = materialLibraryEntryToMaterial(entry);
  const trueValue = computeBlackMarketTrueValue({
    quality: hiddenItem.rank,
    materialType: hiddenItem.type,
  });
  const pricing = createBlackMarketPricing({
    seed: identity.seed,
    npcId: input.npcId,
    trueValue,
  });
  const mask = buildBlackMarketMask(hiddenItem, identity.seed);
  const npc = getBlackMarketNpc(input.npcId);
  const descriptionHints = await blackMarketDescriptionHintService.build({
    item: hiddenItem,
  });
  const now = Date.now();
  const session: BlackMarketInternalSession = {
    id: identity.sessionId,
    userId: input.actor.userId,
    cultivatorId: input.actor.cultivatorId,
    nodeId: input.nodeId,
    npcId: input.npcId,
    cycle: input.cycle,
    listingId: identity.listingId,
    phase: 'talking',
    seed: identity.seed,
    itemLibraryItemId: entry.itemId,
    hiddenItem,
    disguisedName: mask.disguisedName,
    disguisedDescription: mask.disguisedDescription,
    pricing,
    inspectTurnsUsed: 0,
    haggleTurnsUsed: 0,
    revealedClueIds: [],
    clues: buildBlackMarketSafeClues({
      item: hiddenItem,
      npcId: input.npcId,
      seed: identity.seed,
      regionTags: getNodeRegionTags(input.nodeId),
      trueValue,
    }),
    descriptionHints,
    revealedDescriptionHintIds: [],
    messages: [
      {
        id: `${identity.sessionId}:opening`,
        role: 'npc',
        body: npc.opening,
        createdAt: now,
      },
    ],
    version: 1,
    expiresAt: cycleEnd(input.cycle),
  };

  const existingPurchase = await completedPurchase(
    input.actor.cultivatorId,
    input.nodeId,
    input.npcId,
    input.cycle,
  );
  if (existingPurchase) {
    const result = existingPurchase.result as { reveal?: BlackMarketReveal };
    session.phase = 'completed';
    session.reveal = result.reveal;
    if (result.reveal) session.pricing.currentPrice = result.reveal.paidPrice;
  }
  return session;
}

async function getOrGenerateInternal(input: {
  actor: Actor;
  nodeId: string;
  npcId: BlackMarketNpcId;
}): Promise<BlackMarketInternalSession> {
  const cycle = currentCycle();
  const identity = sessionIdentity({
    cultivatorId: input.actor.cultivatorId,
    nodeId: input.nodeId,
    npcId: input.npcId,
    cycle,
  });
  return withRedisLock(
    {
      key: redisLockKeys.blackMarketSession(identity.sessionId),
      context: 'black-market-session-create',
      timeoutMs: 15_000,
      retries: 1,
    },
    async () => {
      const existing = await blackMarketSessionRepository.find(
        identity.sessionId,
      );
      if (existing) {
        const purchase = await completedPurchase(
          input.actor.cultivatorId,
          input.nodeId,
          input.npcId,
          cycle,
        );
        if (purchase) {
          const result = purchase.result as { reveal?: BlackMarketReveal };
          existing.phase = 'completed';
          existing.reveal = result.reveal;
          if (result.reveal) {
            existing.pricing.currentPrice = result.reveal.paidPrice;
          }
          await blackMarketSessionRepository.save(existing);
          return existing;
        }
        if (existing.phase === 'abandoned') {
          existing.phase = 'talking';
          existing.version += 1;
          await blackMarketSessionRepository.save(existing);
        }
        return existing;
      }
      const created = await generateSession({ ...input, cycle });
      await blackMarketSessionRepository.save(created);
      return created;
    },
  );
}

function buildTurnContext(
  session: BlackMarketInternalSession,
  npc: ReturnType<typeof getBlackMarketNpc>,
  command: BlackMarketInteractCommand,
): BlackMarketTurnContext {
  const revealed = new Set(session.revealedClueIds);
  const regionTags = getNodeRegionTags(session.nodeId);
  const knownClues = session.clues
    .filter((clue) => revealed.has(clue.id))
    .map((clue) => ({
      id: clue.id,
      kind: clue.kind,
      text: clue.text || clue.fact,
    }));
  const availableClues = session.clues
    .filter((clue) => !revealed.has(clue.id))
    .map((clue) => ({
      id: clue.id,
      kind: clue.kind,
      safeFact: clue.fact,
    }));
  const revealedDescriptionHints = new Set(
    session.revealedDescriptionHintIds,
  );
  const availableDescriptionHints = session.descriptionHints
    .filter((hint) => !revealedDescriptionHints.has(hint.id))
    .map((hint) => ({
      id: hint.id,
      safeText: hint.safeText,
      sensitivity: hint.sensitivity,
    }));

  return {
    scene: {
      title: '暗巷黑市',
      description: `${regionTags[1] ?? '坊市'}灯火照不到的窄巷里，三道身影各守着一件不肯明说来历的货。`,
    },
    npc: {
      name: npc.name,
      voice: npc.voice,
      identity: npc.identity,
      mood: negotiationMood(session),
      flexibilityLevel: session.pricing.flexibilityLevel,
    },
    listing: {
      disguisedName: session.disguisedName,
      disguisedDescription: session.disguisedDescription,
    },
    currentPrice: session.pricing.currentPrice,
    offerAssessment:
      command.offeredPrice != null
        ? assessOffer({
            currentPrice: session.pricing.currentPrice,
            floorPrice: session.pricing.floorPrice,
            offeredPrice: command.offeredPrice,
          })
        : undefined,
    canInspect:
      session.phase === 'talking' &&
      session.inspectTurnsUsed < BLACK_MARKET_MAX_INSPECTIONS,
    canHaggle:
      session.phase === 'talking' && session.pricing.patience > 0,
    dealReady: session.phase === 'deal_ready',
    knownClues,
    availableClues,
    availableDescriptionHints,
    revealedDescriptionHints: session.descriptionHints
      .filter((hint) => revealedDescriptionHints.has(hint.id))
      .map((hint) => ({
        id: hint.id,
        safeText: hint.safeText,
        sensitivity: hint.sensitivity,
      })),
    conversation: session.messages,
    playerMessage: command.message?.trim() ?? '',
    offeredPrice: command.offeredPrice,
  };
}

function validateProposal(
  session: BlackMarketInternalSession,
  proposal: BlackMarketTurnProposal,
  hasOffer: boolean,
): void {
  const revealed = new Set(session.revealedClueIds);

  if (proposal.revealClueIds.length > 0) {
    const remaining = BLACK_MARKET_MAX_INSPECTIONS - session.inspectTurnsUsed;
    if (remaining <= 0) {
      throw new BlackMarketServiceError(409, '三次查验机会已经用尽');
    }
    if (proposal.revealClueIds.length > remaining) {
      throw new BlackMarketServiceError(409, '这轮没有那么多查验机会');
    }
    for (const id of proposal.revealClueIds) {
      if (revealed.has(id) || !session.clues.some((clue) => clue.id === id)) {
        throw new BlackMarketServiceError(409, '这条线索暂时无法透露');
      }
    }
  }

  if (proposal.revealDescriptionHintIds.length > 1) {
    throw new BlackMarketServiceError(409, '这轮只能透露一条货物细节');
  }
  const revealedDescription = new Set(session.revealedDescriptionHintIds);
  for (const id of proposal.revealDescriptionHintIds) {
    const hint = session.descriptionHints.find(
      (candidate) => candidate.id === id,
    );
    if (!hint || revealedDescription.has(id)) {
      throw new BlackMarketServiceError(409, '这条货物细节暂时无法透露');
    }
    if (
      hint.sensitivity === 'strong' &&
      session.revealedClueIds.length < 2
    ) {
      throw new BlackMarketServiceError(
        409,
        '现在还没有足够依据让摊主说出这么具体的细节',
      );
    }
  }

  for (const id of proposal.referencedClueIds) {
    if (!revealed.has(id)) {
      throw new BlackMarketServiceError(409, '不能引用尚未掌握的线索');
    }
  }

  if (hasOffer && !proposal.negotiation) {
    // The LLM is allowed to miss negotiation structure under load. The server
    // applies a conservative default so the turn still behaves like haggling.
    return;
  }
}

function applyReveals(
  session: BlackMarketInternalSession,
  proposal: BlackMarketTurnProposal,
): void {
  for (const id of proposal.revealClueIds) {
    const clue = session.clues.find((candidate) => candidate.id === id);
    if (!clue) {
      throw new BlackMarketServiceError(409, '线索已经失效');
    }
    clue.text = proposal.reply || clue.fact;
    session.revealedClueIds.push(clue.id);
    session.inspectTurnsUsed += 1;
  }

  for (const id of proposal.revealDescriptionHintIds) {
    if (!session.revealedDescriptionHintIds.includes(id)) {
      session.revealedDescriptionHintIds.push(id);
    }
  }
}

function playerBody(command: BlackMarketInteractCommand): string {
  if (command.message?.trim()) return command.message.trim();
  if (command.offeredPrice != null) {
    return `我出${command.offeredPrice.toLocaleString()}灵石。`;
  }
  return '（沉默）';
}

export async function getBlackMarketOverview(input: {
  actor: Actor;
  nodeId: string;
}): Promise<BlackMarketOverview> {
  const access = await assertAccess(input.actor, input.nodeId);
  const cycle = currentCycle();
  const statuses = await Promise.all(
    BLACK_MARKET_NPCS.map(async (npc) => {
      const identity = sessionIdentity({
        cultivatorId: input.actor.cultivatorId,
        nodeId: input.nodeId,
        npcId: npc.id,
        cycle,
      });
      const [purchase, session] = await Promise.all([
        completedPurchase(
          input.actor.cultivatorId,
          input.nodeId,
          npc.id,
          cycle,
        ),
        blackMarketSessionRepository.find(identity.sessionId),
      ]);
      return purchase ? 'completed' : session ? 'in_progress' : 'available';
    }),
  );
  const nodeTags = getNodeRegionTags(input.nodeId);
  return {
    nodeId: input.nodeId,
    cycle,
    nextRefresh: cycleEnd(cycle),
    access,
    scene: {
      title: '暗巷黑市',
      description: `${nodeTags[1] ?? '坊市'}灯火照不到的窄巷里，三道身影各守着一件不肯明说来历的货。`,
    },
    npcs: BLACK_MARKET_NPCS.map((npc, index) => ({
      id: npc.id,
      sigil: npc.sigil,
      name: npc.name,
      identity: npc.identity,
      responsibility: npc.responsibility,
      status: statuses[index] ?? 'available',
    })),
  };
}

export async function openBlackMarketSession(input: {
  actor: Actor;
  nodeId: string;
  npcId: BlackMarketNpcId;
}): Promise<BlackMarketSessionView> {
  await assertAccess(input.actor, input.nodeId);
  return publicSession(await getOrGenerateInternal(input));
}

export async function interactWithBlackMarket(input: {
  actor: Actor;
  nodeId: string;
  sessionId: string;
  command: BlackMarketInteractCommand;
  abortSignal?: AbortSignal;
}): Promise<BlackMarketInteractionResult> {
  await assertAccess(input.actor, input.nodeId);
  const snapshot = await blackMarketSessionRepository.find(input.sessionId);
  if (!snapshot || snapshot.nodeId !== input.nodeId) {
    throw new BlackMarketServiceError(404, '没有找到这场黑市交易');
  }
  assertCurrentSession(snapshot, input.actor);
  assertConversationOpen(snapshot);
  if (snapshot.version !== input.command.version) {
    throw new BlackMarketServiceError(409, '摊前情形已经变化，请刷新后再试');
  }
  if (input.command.offeredPrice != null && snapshot.pricing.patience <= 0) {
    throw new BlackMarketServiceError(409, '摊主已经不愿继续议价');
  }

  const snapshotNpc = getBlackMarketNpc(snapshot.npcId);
  const snapshotContext = buildTurnContext(
    snapshot,
    snapshotNpc,
    input.command,
  );
  const judged = await blackMarketConversationService.proposeTurn({
    context: snapshotContext,
    abortSignal: input.abortSignal,
  });
  const proposal = judged.proposal;

  return withRedisLock(
    {
      key: redisLockKeys.blackMarketSession(input.sessionId),
      context: 'black-market-interact',
      timeoutMs: 15_000,
      retries: 0,
    },
    async () => {
      const session = await blackMarketSessionRepository.find(input.sessionId);
      if (!session) throw new BlackMarketServiceError(404, '黑市会话已经失效');
      assertCurrentSession(session, input.actor);
      assertConversationOpen(session);
      if (session.version !== input.command.version) {
        throw new BlackMarketServiceError(
          409,
          '摊前情形已经变化，请刷新后再试',
        );
      }

      const npc = getBlackMarketNpc(session.npcId);
      const turnContext = buildTurnContext(session, npc, input.command);
      validateProposal(session, proposal, input.command.offeredPrice != null);

      const now = Date.now();
      const body = playerBody(input.command);
      let outcome: BlackMarketInteractionResult['outcome'];
      let npcReply = proposal.reply;

      if (
        proposal.revealClueIds.length > 0 ||
        proposal.revealDescriptionHintIds.length > 0
      ) {
        applyReveals(session, proposal);
      }

      if (input.command.offeredPrice != null) {
        const offeredPrice = input.command.offeredPrice;
        if (
          !Number.isSafeInteger(offeredPrice) ||
          offeredPrice < 1
        ) {
          throw new BlackMarketServiceError(400, '请给出有效的灵石报价');
        }

        const negotiation = proposal.negotiation ?? {
          decision: 'counter' as const,
          concession: 0.25,
          patienceDelta: -1 as const,
        };
        const decision = applyBlackMarketPriceDecision({
          currentPrice: session.pricing.currentPrice,
          floorPrice: session.pricing.floorPrice,
          offeredPrice,
          patience: session.pricing.patience,
          decision: negotiation.decision,
          concession: negotiation.concession,
          patienceDelta: negotiation.patienceDelta,
        });

        session.haggleTurnsUsed += 1;
        session.pricing.currentPrice = decision.nextPrice;
        session.pricing.patience = decision.nextPatience;
        session.phase =
          decision.outcome === 'accepted' ? 'deal_ready' : 'talking';
        outcome = decision.outcome;

        npcReply = await blackMarketConversationService.renderTurnReply({
          context: turnContext,
          proposal,
          negotiationOutcome: decision,
          abortSignal: input.abortSignal,
        });
      }

      appendMessages(session, [
        {
          id: `${session.id}:${session.version}:player`,
          role: 'player',
          body,
          createdAt: now,
        },
        {
          id: `${session.id}:${session.version}:npc`,
          role: 'npc',
          body: npcReply,
          createdAt: now + 1,
        },
      ]);
      session.version += 1;
      await blackMarketSessionRepository.save(session);
      return {
        session: publicSession(session),
        outcome,
        degraded: judged.degraded,
      };
    },
  );
}

async function preparePurchase(
  session: BlackMarketInternalSession,
  tx: DbTransaction,
): Promise<{
  reveal: BlackMarketReveal;
  inventoryItem: ReturnType<typeof mapMaterialRow>;
  remainingSpiritStones: number;
}> {
  const price = session.pricing.currentPrice;
  const [updatedCultivator] = await tx
    .update(cultivators)
    .set({ spirit_stones: sql`${cultivators.spirit_stones} - ${price}` })
    .where(
      and(
        eq(cultivators.id, session.cultivatorId),
        sql`${cultivators.spirit_stones} >= ${price}`,
      ),
    )
    .returning({ spiritStones: cultivators.spirit_stones });
  if (!updatedCultivator) {
    throw new BlackMarketServiceError(400, '囊中羞涩，灵石不足');
  }
  const stored = await addMaterialStackToInventory(
    session.cultivatorId,
    { ...session.hiddenItem, quantity: 1, details: {} },
    tx,
  );
  const [row] = await tx
    .select()
    .from(materials)
    .where(
      and(
        eq(materials.id, stored.id),
        eq(materials.cultivatorId, session.cultivatorId),
      ),
    )
    .limit(1);
  if (!row) throw new BlackMarketServiceError(500, '黑市货物入袋失败');
  const inventoryItem = mapMaterialRow(row);
  const assessment = classifyBlackMarketReveal(
    price,
    session.pricing.trueValue,
  );
  const npc = getBlackMarketNpc(session.npcId);
  const reveal: BlackMarketReveal = {
    material: {
      id: stored.id,
      name: session.hiddenItem.name,
      type: session.hiddenItem.type,
      rank: session.hiddenItem.rank,
      element: session.hiddenItem.element,
      description: session.hiddenItem.description,
      quantity: 1,
    },
    ownerAskPrice: session.pricing.initialPrice,
    paidPrice: price,
    trueValue: session.pricing.trueValue,
    valueRatio: assessment.valueRatio,
    rating: assessment.rating,
    epilogue: npc.epilogue,
  };
  return {
    reveal,
    inventoryItem,
    remainingSpiritStones: updatedCultivator.spiritStones,
  };
}

export async function commitBlackMarketPurchase(input: {
  actor: Actor;
  nodeId: string;
  sessionId: string;
  version: number;
  expectedPrice: number;
}) {
  await assertAccess(input.actor, input.nodeId);
  const snapshot = await blackMarketSessionRepository.find(input.sessionId);
  if (!snapshot || snapshot.nodeId !== input.nodeId) {
    throw new BlackMarketServiceError(404, '没有找到这场黑市交易');
  }
  if (snapshot.cycle !== currentCycle()) {
    throw new BlackMarketServiceError(410, '这批黑市货物已经收摊');
  }
  const requestId = purchaseRequestId(snapshot);
  const fingerprint = `${snapshot.nodeId}:${snapshot.cycle}:${snapshot.npcId}:${snapshot.listingId}`;

  return withRedisLock(
    {
      keys: [
        redisLockKeys.blackMarketSession(snapshot.id),
        redisLockKeys.cultivatorMutation(input.actor.cultivatorId),
      ],
      context: 'black-market-purchase',
      timeoutMs: 20_000,
      retries: 0,
    },
    async (lease) => {
      const session =
        (await blackMarketSessionRepository.find(input.sessionId)) ?? snapshot;
      if (
        session.userId !== input.actor.userId ||
        session.cultivatorId !== input.actor.cultivatorId
      ) {
        throw new BlackMarketServiceError(404, '没有找到这场黑市交易');
      }
      if (session.cycle !== currentCycle()) {
        throw new BlackMarketServiceError(410, '这批黑市货物已经收摊');
      }
      if (
        session.phase !== 'completed' &&
        (session.version !== input.version ||
          session.pricing.currentPrice !== input.expectedPrice)
      ) {
        throw new BlackMarketServiceError(
          409,
          '摊主的报价已经变化，请按最新价格重新确认',
        );
      }
      const committed = await playerCommandExecutor.execute({
        coordination: { mode: 'redis', lease },
        userId: input.actor.userId,
        cultivatorId: input.actor.cultivatorId,
        source: PURCHASE_SOURCE,
        idempotency: { key: requestId, fingerprint },
        command: async (tx) => {
          const purchased = await preparePurchase(session, tx);
          const resourceChanges: ResourceChangeDescriptor[] = [
            {
              resourceTopic: 'player.currency',
              eventType: 'currency.black-market.spent',
              operation: 'merge',
              payload: { spiritStones: purchased.remainingSpiritStones },
            },
            {
              resourceTopic: 'inventory.materials',
              eventType: 'inventory.black-market.purchased',
              operation: 'upsert-items',
              payload: { idKey: 'id', items: [purchased.inventoryItem] },
            },
          ];
          return {
            result: { reveal: purchased.reveal },
            resourceChanges,
          };
        },
      });
      const result = committed.result as { reveal: BlackMarketReveal };
      session.phase = 'completed';
      session.reveal = result.reveal;
      session.pricing.currentPrice = result.reveal.paidPrice;
      session.version += 1;
      appendMessages(session, [
        {
          id: `${session.id}:completed`,
          role: 'system',
          body: `交易落定，伪装褪去：${result.reveal.material.name}。`,
          createdAt: Date.now(),
        },
      ]);
      try {
        await blackMarketSessionRepository.save(session);
      } catch (error) {
        console.error(
          '[black-market] purchase committed but session sync failed',
          {
            sessionId: session.id,
            error,
          },
        );
      }
      return committed;
    },
  );
}

export async function leaveBlackMarketSession(input: {
  actor: Actor;
  nodeId: string;
  sessionId: string;
  version: number;
}): Promise<BlackMarketSessionView> {
  return withRedisLock(
    {
      key: redisLockKeys.blackMarketSession(input.sessionId),
      context: 'black-market-leave',
      timeoutMs: 10_000,
      retries: 0,
    },
    async () => {
      const session = await blackMarketSessionRepository.find(input.sessionId);
      if (!session || session.nodeId !== input.nodeId) {
        throw new BlackMarketServiceError(404, '没有找到这场黑市交易');
      }
      assertCurrentSession(session, input.actor);
      if (session.version !== input.version) {
        throw new BlackMarketServiceError(
          409,
          '摊前情形已经变化，请刷新后再试',
        );
      }
      // Leaving only closes the local conversation view. The same stall keeps
      // its clues, price and agreed-deal state until this market cycle ends.
      session.version += 1;
      await blackMarketSessionRepository.save(session);
      return publicSession(session);
    },
  );
}

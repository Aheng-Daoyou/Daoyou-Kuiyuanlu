import type {
  BlackMarketDescriptionHint,
} from '@shared/lib/blackMarketDescriptionHints';
import type { BlackMarketPricingState } from '@shared/lib/blackMarketPricing';
import type {
  BlackMarketClue,
  BlackMarketInspectionKind,
  BlackMarketMessage,
  BlackMarketNpcId,
  BlackMarketReveal,
  BlackMarketSessionPhase,
} from '@shared/types/blackMarket';
import type { Material } from '@shared/types/cultivator';

export interface BlackMarketValueHintBand {
  lowMultiplier: number;
  highMultiplier: number;
}

export interface BlackMarketSafeClue extends BlackMarketClue {
  fact: string;
  fallbackText: string;
  valueHintBand?: BlackMarketValueHintBand;
  confidence: number;
  reliability: 'solid' | 'speculative';
}

export interface BlackMarketInternalSession {
  id: string;
  userId: string;
  cultivatorId: string;
  nodeId: string;
  npcId: BlackMarketNpcId;
  cycle: number;
  listingId: string;
  phase: BlackMarketSessionPhase;
  seed: string;
  itemLibraryItemId: string;
  hiddenItem: Material;
  disguisedName: string;
  disguisedDescription: string;
  pricing: BlackMarketPricingState;
  inspectTurnsUsed: number;
  haggleTurnsUsed: number;
  revealedClueIds: string[];
  clues: BlackMarketSafeClue[];
  descriptionHints: BlackMarketDescriptionHint[];
  revealedDescriptionHintIds: string[];
  messages: BlackMarketMessage[];
  version: number;
  expiresAt: number;
  reveal?: BlackMarketReveal;
}

export interface BlackMarketTurnNegotiation {
  decision: 'accept' | 'counter' | 'reject';
  concession: number;
  patienceDelta: -2 | -1 | 0;
}

export interface BlackMarketTurnProposal {
  intent: 'chat' | 'inspect' | 'question' | 'haggle' | 'buy' | 'leave';
  reply: string;
  revealClueIds: string[];
  revealDescriptionHintIds: string[];
  referencedClueIds: string[];
  negotiation?: BlackMarketTurnNegotiation;
  tone?: 'normal' | 'defensive' | 'impatient' | 'pleased' | 'cagey';
}

export interface BlackMarketTurnContext {
  scene: {
    title: string;
    description: string;
  };
  npc: {
    name: string;
    voice: string;
    mood: string;
    flexibilityLevel: string;
    identity: string;
  };
  listing: {
    disguisedName: string;
    disguisedDescription: string;
  };
  currentPrice: number;
  offerAssessment?: 'insulting' | 'low' | 'reasonable' | 'strong';
  canInspect: boolean;
  canHaggle: boolean;
  dealReady: boolean;
  knownClues: Array<{ id: string; kind: BlackMarketInspectionKind; text: string }>;
  availableClues: Array<{
    id: string;
    kind: BlackMarketInspectionKind;
    safeFact: string;
  }>;
  availableDescriptionHints: Array<{
    id: string;
    safeText: string;
    sensitivity: 'vague' | 'moderate' | 'strong';
  }>;
  revealedDescriptionHints: Array<{
    id: string;
    safeText: string;
    sensitivity: 'vague' | 'moderate' | 'strong';
  }>;
  conversation: BlackMarketMessage[];
  playerMessage: string;
  offeredPrice?: number;
}

export interface BlackMarketTurnResult {
  proposal: BlackMarketTurnProposal;
  degraded: boolean;
}

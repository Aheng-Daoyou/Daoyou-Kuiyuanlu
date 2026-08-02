import type {
  BattleInitConfigV5,
  BattleUnitInitSpec,
  PersistentCombatStatusV5,
  ResourcePointState,
} from '@shared/engine/battle-v5/setup/types';
import type { BattleRecordV3 } from '@shared/engine/battle-v5/v3';
import type { Cultivator } from '@shared/types/cultivator';

export type {
  BattleInitConfigV5,
  BattleUnitInitSpec,
  PersistentCombatStatusV5,
  ResourcePointState,
};

export type { BattleRecordV3 };

export type BattleRecordType = 'challenge' | 'challenged' | 'normal';

export type BattleRecordUnitSummary = Pick<Cultivator, 'id' | 'name'>;

export interface BattleRecordV3Summary {
  id: string;
  createdAt: Date | null;
  battleType: BattleRecordType;
  opponentCultivatorId: string | null;
  winner: BattleRecordUnitSummary;
  loser: BattleRecordUnitSummary;
  turns: number;
}

export interface BattleRecordV3Detail {
  id: string;
  createdAt: Date | null;
  battleResult: BattleRecordV3;
}

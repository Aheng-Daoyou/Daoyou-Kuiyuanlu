import type { UnitStateSnapshot } from '@shared/engine/battle-v5/systems/state/types';
import type { BattleRecordV3 } from '@shared/types/battle';
import { useEffect, useMemo, useState } from 'react';
import { useCombatPlayer } from './useCombatPlayer';

export { resolvePlaybackStateForRecord } from './useCombatPlayer';

export interface BattlePlaybackStateV3 {
  currentIndex: number;
  totalActions: number;
  progress: number;
  isPlaying: boolean;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  currentPlayerFrame: UnitStateSnapshot | undefined;
  currentOpponentFrame: UnitStateSnapshot | undefined;
  playerName: string;
  opponentName: string;
  isPlaybackFinished: boolean;
  selectedUnit: UnitStateSnapshot | null;
  openUnitDetails: (unit: UnitStateSnapshot | null) => void;
  closeUnitDetails: () => void;
}

export function resolveSelectedBattleUnit(
  selectedUnitId: string | null,
  unitSnapshots: Record<string, UnitStateSnapshot>,
) {
  return selectedUnitId ? (unitSnapshots[selectedUnitId] ?? null) : null;
}

export function resolveBattleUnitName(
  record: BattleRecordV3 | undefined,
  unitId: string | undefined,
  fallbackName: string,
) {
  if (!record || !unitId) {
    return fallbackName;
  }

  if (record.outcome.winner.id === unitId) {
    return record.outcome.winner.name;
  }

  if (record.outcome.loser.id === unitId) {
    return record.outcome.loser.name;
  }

  return fallbackName;
}

export function resolveBattlePlaybackNames(record: BattleRecordV3 | undefined) {
  return {
    playerName: resolveBattleUnitName(
      record,
      record?.participants.player.id,
      '加载中',
    ),
    opponentName: resolveBattleUnitName(
      record,
      record?.participants.opponent.id,
      '神秘对手',
    ),
  };
}

export function useBattlePlaybackState(
  record: BattleRecordV3 | undefined,
): BattlePlaybackStateV3 {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const {
    currentIndex,
    isPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    play,
    pause,
    reset,
    totalActions,
    progress,
    unitSnapshots,
  } = useCombatPlayer(record);

  const { playerName, opponentName } = useMemo(
    () => resolveBattlePlaybackNames(record),
    [record],
  );

  useEffect(() => {
    if (record && totalActions > 0 && currentIndex === -1 && !isPlaying) {
      play();
    }
  }, [currentIndex, isPlaying, play, record, totalActions]);

  const currentPlayerFrame = record?.participants.player.id
    ? unitSnapshots[record.participants.player.id]
    : undefined;
  const currentOpponentFrame = record?.participants.opponent.id
    ? unitSnapshots[record.participants.opponent.id]
    : undefined;
  const selectedUnit = useMemo(
    () => resolveSelectedBattleUnit(selectedUnitId, unitSnapshots),
    [selectedUnitId, unitSnapshots],
  );

  return {
    currentIndex,
    totalActions,
    progress,
    isPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    play,
    pause,
    reset,
    currentPlayerFrame,
    currentOpponentFrame,
    playerName,
    opponentName,
    isPlaybackFinished: totalActions > 0 && currentIndex >= totalActions - 1,
    selectedUnit,
    openUnitDetails: (unit) => setSelectedUnitId(unit?.id ?? null),
    closeUnitDetails: () => setSelectedUnitId(null),
  };
}

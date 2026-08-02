import type { BattleRecordV3 } from '@shared/types/battle';
import { CombatAttributeModal } from '../v5/CombatAttributeModal';
import { CombatControlBar } from '../v5/CombatControlBar';
import { CombatStatusHeader } from '../v5/CombatStatusHeader';
import { CombatActionLogV3 } from './CombatActionLog';
import type { BattlePlaybackStateV3 } from './useBattlePlaybackState';

export interface BattleStatusAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface BattlePlaybackPanelProps {
  battleResult: BattleRecordV3 | undefined;
  playback: BattlePlaybackStateV3;
  statusAction?: BattleStatusAction;
}

export function BattlePlaybackPanel({
  battleResult,
  playback,
  statusAction,
}: BattlePlaybackPanelProps) {
  if (!battleResult) {
    return null;
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-3 md:gap-4">
        {playback.currentPlayerFrame && playback.currentOpponentFrame && (
          <CombatStatusHeader
            player={playback.currentPlayerFrame}
            opponent={playback.currentOpponentFrame}
            onShowPlayerDetails={() =>
              playback.openUnitDetails(playback.currentPlayerFrame ?? null)
            }
            onShowOpponentDetails={() =>
              playback.openUnitDetails(playback.currentOpponentFrame ?? null)
            }
            controls={
              <CombatControlBar
                isPlaying={playback.isPlaying}
                playbackSpeed={playback.playbackSpeed}
                progress={playback.progress}
                onToggle={() =>
                  playback.isPlaying ? playback.pause() : playback.play()
                }
                onSpeedChange={playback.setPlaybackSpeed}
                onReset={playback.reset}
              />
            }
            statusAction={statusAction}
          />
        )}

        <CombatActionLogV3
          sequences={battleResult.sequences}
          currentIndex={playback.currentIndex}
        />
      </div>

      <CombatAttributeModal
        unit={playback.selectedUnit}
        isOpen={!!playback.selectedUnit}
        onClose={playback.closeUnitDetails}
      />
    </>
  );
}

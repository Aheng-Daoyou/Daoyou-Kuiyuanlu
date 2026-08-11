import { getJetStreamClient } from '@server/lib/nats';
import {
  BATTLE_REPLAY_STREAM,
  BATTLE_REPLAY_SUBJECT,
  type BattleReplayArchiveJobV2,
} from '@shared/contracts/battleReplay';
import { JSONCodec } from 'nats';
import { releaseArenaRoomForBattle } from './BattleArenaRoomFinalizer';
import {
  clearBattleReplayArchiveTracking,
  getBattleReplayArchivePayload,
} from './BattleReplayRedisStore';
import type { RedisBattleBoardgameStorage } from './BattleBoardgameStorage';

const codec = JSONCodec<BattleReplayArchiveJobV2>();

export async function publishPendingBattleReplays(
  storage: RedisBattleBoardgameStorage,
): Promise<number> {
  const [pendingMatchIds, unconfirmedMatchIds] = await Promise.all([
    storage.listPendingArchiveMatchIds(),
    storage.listUnconfirmedArchiveMatchIds(),
  ]);
  const matchIds = [...new Set([...pendingMatchIds, ...unconfirmedMatchIds])];
  if (matchIds.length === 0) return 0;
  const pendingJobs: BattleReplayArchiveJobV2[] = [];
  for (const matchId of matchIds) {
    const payload = await getBattleReplayArchivePayload(matchId);
    if (!payload) {
      await clearBattleReplayArchiveTracking(matchId);
      continue;
    }
    if (payload.archiveStatus !== 'pending' && payload.archiveStatus !== 'published') {
      await clearBattleReplayArchiveTracking(matchId);
      continue;
    }
    // Room cleanup must not depend on NATS or PostgreSQL availability.
    await releaseArenaRoomForBattle(matchId);
    pendingJobs.push({
      version: 'battle_replay_archive_job_v2',
      subject: BATTLE_REPLAY_SUBJECT,
      matchId,
      attempt: payload.publishAttempt + 1,
      byteLength: payload.byteLength,
      checksum: payload.checksum,
    });
  }
  if (pendingJobs.length === 0) return 0;
  const jetStream = await getJetStreamClient();
  let published = 0;
  for (const job of pendingJobs) {
    await jetStream.publish(BATTLE_REPLAY_SUBJECT, codec.encode(job), {
      msgID: `${job.matchId}:archive:${job.attempt}`,
      expect: { streamName: BATTLE_REPLAY_STREAM },
      timeout: 5_000,
    });
    await storage.markArchivePublished(job.matchId, job.attempt);
    published += 1;
  }
  return published;
}

import { and, eq } from 'drizzle-orm';
import { db } from '@server/lib/drizzle/db';
import { battleMatchParticipants } from '@server/lib/drizzle/schema';

export type BattleMatchParticipantStatus = 'invited' | 'accepted';

export interface BattleMatchParticipantInput {
  readonly matchId: string;
  readonly userId: string;
  readonly teamId: string;
  readonly boardgamePlayerId: string;
  readonly cultivatorIds: readonly string[];
  readonly status?: BattleMatchParticipantStatus;
}

export async function createBattleMatchParticipants(
  participants: readonly BattleMatchParticipantInput[],
): Promise<void> {
  if (participants.length === 0) throw new Error('Battle match needs participants');
  await db.insert(battleMatchParticipants).values(
    participants.map((participant) => ({
      ...participant,
      cultivatorIds: [...participant.cultivatorIds],
      status: participant.status ?? 'invited',
    })),
  );
}

export async function getBattleMatchParticipant(matchId: string, userId: string) {
  const [row] = await db
    .select()
    .from(battleMatchParticipants)
    .where(and(eq(battleMatchParticipants.matchId, matchId), eq(battleMatchParticipants.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listBattleMatchInvitations(userId: string) {
  return db
    .select({
      matchId: battleMatchParticipants.matchId,
      teamId: battleMatchParticipants.teamId,
      boardgamePlayerId: battleMatchParticipants.boardgamePlayerId,
      cultivatorIds: battleMatchParticipants.cultivatorIds,
      createdAt: battleMatchParticipants.createdAt,
    })
    .from(battleMatchParticipants)
    .where(and(
      eq(battleMatchParticipants.userId, userId),
      eq(battleMatchParticipants.status, 'invited'),
    ));
}

export async function acceptBattleMatchParticipant(matchId: string, userId: string) {
  const [row] = await db
    .update(battleMatchParticipants)
    .set({ status: 'accepted', acceptedAt: new Date() })
    .where(and(
      eq(battleMatchParticipants.matchId, matchId),
      eq(battleMatchParticipants.userId, userId),
      eq(battleMatchParticipants.status, 'invited'),
    ))
    .returning();
  return row ?? (await getBattleMatchParticipant(matchId, userId));
}

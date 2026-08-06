import { createBattleMatchPlayerView } from '@shared/engine/battle-v5/match/BattleMatchStateMachine';
import { createPostgresBattleMatchCoordinator, PostgresBattleMatchRepository } from '@server/lib/services/BattleMatchPersistence';
import { PostgresBattleBoardgameStorage } from '@server/lib/services/BattleBoardgameStorage';
import { BattleBoardgameSessionClient } from '@server/lib/services/BattleBoardgameSessionClient';
import { BattleMatchmakerService } from '@server/lib/services/BattleMatchmakerService';
import { buildOnlineBattleMatchState } from '@server/lib/services/BattleOnlineMatchFactory';
import {
  acceptBattleMatchParticipant,
  createBattleMatchParticipants,
  getBattleMatchParticipant,
  listBattleMatchInvitations,
} from '@server/lib/services/BattleMatchParticipantRepository';
import { requireUser } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

const MatchIdSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
const RevisionSchema = z.number().int().nonnegative();
const IntentSchema = z.object({
  kind: z.enum(['ability', 'pass']),
  abilityId: z.string().min(1).max(120).optional(),
  targetUnitId: z.string().min(1).max(120).optional(),
}).strict();
const SubmitSchema = z.object({
  requestId: z.string().min(1).max(120),
  expectedMatchRevision: RevisionSchema,
  expectedCheckpointRevision: RevisionSchema,
  unitId: z.string().min(1).max(120),
  intent: IntentSchema,
}).strict();
const LockSchema = z.object({
  requestId: z.string().min(1).max(120),
  expectedMatchRevision: RevisionSchema,
  expectedCheckpointRevision: RevisionSchema,
}).strict();
const CreateOnlineMatchSchema = z.object({
  team: z.object({ cultivatorIds: z.array(z.string().uuid()).min(1).max(4) }),
  opponentTeam: z.object({ cultivatorIds: z.array(z.string().uuid()).min(1).max(4) }),
}).strict();

const router = new Hono<AppEnv>();
const repository = new PostgresBattleMatchRepository();
const boardgameStorage = new PostgresBattleBoardgameStorage();
const sessionClient = new BattleBoardgameSessionClient();
const matchmaker = new BattleMatchmakerService();

router.get('/invitations', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);
  return c.json({ invitations: await listBattleMatchInvitations(user.id) });
});

router.post('/', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);
  const body = CreateOnlineMatchSchema.parse(await c.req.json());
  const state = await buildOnlineBattleMatchState({
    matchId: `online-${crypto.randomUUID()}`,
    teams: [body.team, body.opponentTeam],
  });
  const ownControllers = state.controllers.filter((controller) => controller.teamId === 'alpha');
  if (!ownControllers.some((controller) => controller.playerId === user.id)) {
    return c.json({ error: '创建者必须控制己方队伍中的至少一个角色' }, 403);
  }
  const created = await matchmaker.createAndPrejoin({
    state,
    prejoinControllerIndexes: state.controllers
      .map((controller, index) => controller.playerId === user.id ? index : -1)
      .filter((index) => index >= 0),
    acceptedControllerIndexes: state.controllers
      .map((controller, index) => controller.playerId === user.id ? index : -1)
      .filter((index) => index >= 0),
  });
  await createBattleMatchParticipants(state.controllers.map((controller, index) => ({
    matchId: created.matchID,
    userId: controller.playerId,
    teamId: controller.teamId,
    boardgamePlayerId: String(index),
    cultivatorIds: controller.unitIds,
    status: controller.playerId === user.id ? 'accepted' : 'invited',
  })));
  const session = created.sessions.find((value) => value.playerID === String(
    state.controllers.findIndex((controller) => controller.playerId === user.id),
  ));
  return c.json({ matchID: created.matchID, session: session ?? null });
});

async function rejectBoardgameManagedMatch(c: Context<AppEnv>, matchId: string): Promise<Response | null> {
  if (await boardgameStorage.hasMatch(matchId)) {
    return c.json({ error: '该对局由 battle-server 管理' }, 409);
  }
  return null;
}

function playerViewOrForbidden(
  state: Parameters<typeof createBattleMatchPlayerView>[0],
  playerId: string,
) {
  try {
    return createBattleMatchPlayerView(state, playerId, Date.now());
  } catch (error) {
    if (error instanceof Error && error.message.includes('not a battle controller')) {
      return null;
    }
    throw error;
  }
}

router.get('/:matchId', requireUser(), async (c) => {
  const matchId = MatchIdSchema.parse(c.req.param('matchId'));
  const managed = await rejectBoardgameManagedMatch(c, matchId);
  if (managed) return managed;
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);
  const playerId = user.id;
  const state = await repository.load(matchId);
  if (!state) return c.json({ error: '对局不存在' }, 404);
  const view = playerViewOrForbidden(state, playerId);
  if (!view) return c.json({ error: '无权访问该对局' }, 403);
  return c.json({ view });
});

router.get('/:matchId/session', requireUser(), async (c) => {
  const matchId = MatchIdSchema.parse(c.req.param('matchId'));
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);
  const participant = await getBattleMatchParticipant(matchId, user.id);
  if (!participant) return c.json({ error: '无权访问该对局' }, 403);
  if (participant.status !== 'accepted') return c.json({ error: '请先接受对局邀请' }, 409);
  try {
    const session = await sessionClient.getPlayerSession(matchId, user.id);
    if (!session) return c.json({ error: '对局不存在或尚未分配玩家席位' }, 404);
    return c.json({ session });
  } catch (error) {
    console.error('[battle-match-session] gateway failed', error);
    return c.json({ error: '战斗服务暂不可用' }, 503);
  }
});

router.post('/:matchId/accept', requireUser(), async (c) => {
  const matchId = MatchIdSchema.parse(c.req.param('matchId'));
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);
  const participant = await getBattleMatchParticipant(matchId, user.id);
  if (!participant) return c.json({ error: '无权访问该对局' }, 403);
  const session = await matchmaker.joinPlayer(
    matchId,
    participant.boardgamePlayerId,
    user.id,
  ).catch((error) => {
    if (error instanceof Error && /already joined|already has/i.test(error.message)) return null;
    throw error;
  });
  await matchmaker.acceptPlayer(matchId, participant.boardgamePlayerId);
  await acceptBattleMatchParticipant(matchId, user.id);
  return c.json({ accepted: true, session });
});

router.post('/:matchId/intent', requireUser(), async (c) => {
  const matchId = MatchIdSchema.parse(c.req.param('matchId'));
  const managed = await rejectBoardgameManagedMatch(c, matchId);
  if (managed) return managed;
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);
  const playerId = user.id;
  const body = SubmitSchema.parse(await c.req.json());
  const coordinator = createPostgresBattleMatchCoordinator();
  try {
    const state = await coordinator.dispatch({
      type: 'submit_unit_intent',
      matchId,
      playerId,
      ...body,
    });
    const view = playerViewOrForbidden(state, playerId);
    if (!view) return c.json({ error: '无权访问该对局' }, 403);
    return c.json({ view });
  } catch (error) {
    return matchCommandError(c, error);
  }
});

router.post('/:matchId/lock', requireUser(), async (c) => {
  const matchId = MatchIdSchema.parse(c.req.param('matchId'));
  const managed = await rejectBoardgameManagedMatch(c, matchId);
  if (managed) return managed;
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);
  const playerId = user.id;
  const body = LockSchema.parse(await c.req.json());
  const coordinator = createPostgresBattleMatchCoordinator();
  try {
    const state = await coordinator.dispatch({
      type: 'lock_player',
      matchId,
      playerId,
      ...body,
    });
    const view = playerViewOrForbidden(state, playerId);
    if (!view) return c.json({ error: '无权访问该对局' }, 403);
    return c.json({ view });
  } catch (error) {
    return matchCommandError(c, error);
  }
});

function matchCommandError(c: Context<AppEnv>, error: unknown) {
  const message = error instanceof Error ? error.message : '对局操作失败';
  if (message.includes('Unknown battle match')) return c.json({ error: '对局不存在' }, 404);
  if (message.includes('not a battle controller') || message.includes('does not control')) {
    return c.json({ error: '无权执行该操作' }, 403);
  }
  if (
    message.includes('stale') ||
    message.includes('Locked') ||
    message.includes('deadline') ||
    message.includes('not planning') ||
    message.includes('invalid')
  ) {
    return c.json({ error: message }, 409);
  }
  throw error;
}

export default router;

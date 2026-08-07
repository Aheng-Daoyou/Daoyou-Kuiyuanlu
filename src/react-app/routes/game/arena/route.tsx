import {
  NpcConversation,
  RoomView,
  type RoomActorView,
} from '@app/components/feature/room';
import { GameSceneFrame } from '@app/components/game-shell';
import { realtimeClient } from '@app/lib/realtime/realtimeClient';
import { usePlayerSession } from '@app/lib/resources/player';
import type {
  ArenaRoomResponseV1,
  ArenaRoomSeatV1,
  ArenaStartResponseV1,
  ArenaRoomV1,
  ArenaTeamIdV1,
} from '@shared/contracts/arena';
import {
  allArenaSeatsReady,
  hasBothArenaTeams,
  isArenaRoomActive,
} from '@shared/contracts/arena';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

const ARENA_ROOM_TOUCH_INTERVAL_MS = 5 * 60_000;

const ACTORS: readonly RoomActorView[] = [
  {
    id: 'wang-hu',
    sigil: '虎',
    name: '王虎',
    identity: '擂台切磋主持人',
    responsibility: '介绍擂台切磋的规矩与入场方式。',
    appearance: 'person',
  },
  {
    id: 'ring',
    sigil: '擂',
    name: '擂台',
    identity: '切磋设施',
    responsibility: '创建房间，或凭六位数字邀请码加入切磋。',
    appearance: 'facility',
  },
];

export default function ArenaPage() {
  const navigate = useNavigate();
  const session = usePlayerSession();
  const [selectedId, setSelectedId] = useState<string>();
  const [room, setRoom] = useState<ArenaRoomV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const currentCultivatorId = session.data?.activeCultivator?.id;

  const applyRoom = useCallback((next: ArenaRoomV1 | null) => {
    setRoom((current) => {
      if (!next) return null;
      if (
        current?.roomId === next.roomId &&
        current.revision > next.revision
      ) {
        return current;
      }
      return next;
    });
  }, []);

  const refreshRoom = useCallback(async () => {
    const response = await requestArena<{ room: ArenaRoomV1 | null }>(
      '/api/arena/room',
    );
    applyRoom(response.room);
  }, [applyRoom]);

  useEffect(() => {
    let cancelled = false;
    void requestArena<{ room: ArenaRoomV1 | null }>('/api/arena/room')
      .then((response) => {
        if (!cancelled) setRoom(response.room);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    realtimeClient.enableChannel('arena-room');
    const unsubscribe = realtimeClient.subscribe(
      'arena-room.changed',
      ({ payload }) => {
        if (payload.room) {
          applyRoom(payload.room);
          return;
        }
        void refreshRoom().catch(() => undefined);
      },
    );
    const unsubscribeStatus = realtimeClient.subscribeStatus((status) => {
      if (status.channels['arena-room'].state === 'online') {
        void refreshRoom().catch(() => undefined);
      }
    });
    return () => {
      unsubscribe();
      unsubscribeStatus();
      realtimeClient.disableChannel('arena-room');
    };
  }, [applyRoom, refreshRoom]);

  useEffect(() => {
    if (!room || !isArenaRoomActive(room.status)) return;
    const timer = window.setInterval(() => {
      void requestArena<ArenaRoomResponseV1>(
        `/api/arena/rooms/${room.roomId}/touch`,
        jsonRequest({}),
      )
        .then((response) => applyRoom(response.room))
        .catch(() => void refreshRoom().catch(() => undefined));
    }, ARENA_ROOM_TOUCH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [applyRoom, refreshRoom, room]);

  useEffect(() => {
    if (!room?.battleMatchId || (room.status !== 'starting' && room.status !== 'in_battle')) return;
    navigate(`/game/battle/live/${encodeURIComponent(room.battleMatchId)}`);
  }, [navigate, room?.battleMatchId, room?.status]);

  useEffect(() => {
    if (room?.status !== 'starting' || room.battleMatchId) return;
    const timer = window.setInterval(
      () => void refreshRoom().catch(() => undefined),
      2_000,
    );
    return () => window.clearInterval(timer);
  }, [refreshRoom, room?.battleMatchId, room?.status]);

  return (
    <GameSceneFrame
      variant="workflow"
      description="王虎主持的公共擂台切磋。凭六位数字邀请码自由组队，双方准备完毕后即可开始无消耗的实时对局。"
    >
      <RoomView
        eyebrow="擂台场"
        description="青石擂台立在场中，来客可在此自行结队，不论人数多寡，只以切磋招法为意。"
        actors={ACTORS.map((actor) =>
          actor.id === 'ring' && room
            ? { ...actor, status: { label: '已有候场房间', tone: 'active' } }
            : actor,
        )}
        selectedId={selectedId}
        onSelect={setSelectedId}
        prompt="找王虎了解规矩，或直接点击擂台入场"
        promptDetail="切磋不收取费用，也不会消耗战斗外资源。"
        detail={
          selectedId === 'wang-hu' ? (
            <WangHuConversation onExit={() => setSelectedId(undefined)} />
          ) : selectedId === 'ring' ? (
            <ArenaFacility
              room={room}
              loading={loading}
              currentCultivatorId={currentCultivatorId}
              onRoom={applyRoom}
              onExit={() => setSelectedId(undefined)}
            />
          ) : undefined
        }
      />
    </GameSceneFrame>
  );
}

function WangHuConversation({ onExit }: { onExit(): void }) {
  return (
    <NpcConversation
      actor={ACTORS[0]!}
      messages={[
        {
          id: 'greeting',
          speaker: '王虎',
          body: '这里不论门第，也不押注输赢。你若想试招，开一间房，邀人分到擂台两边便是。',
        },
        {
          id: 'rules',
          speaker: '王虎',
          body: '双方人数不必相同。人都到齐并各自准备后，由房主开擂；入场后每回合有三十息同时定招。',
        },
        {
          id: 'cost',
          speaker: '王虎',
          body: '此处只作切磋，不收费用，不动你在擂台之外的气血、物资与修行状态。',
        },
      ]}
      options={[{ id: 'leave', label: '我明白了', tone: 'muted' }]}
      onSelectOption={onExit}
    />
  );
}

function ArenaFacility({
  room,
  loading,
  currentCultivatorId,
  onRoom,
  onExit,
}: {
  room: ArenaRoomV1 | null;
  loading: boolean;
  currentCultivatorId?: string;
  onRoom(room: ArenaRoomV1 | null): void;
  onExit(): void;
}) {
  const [inviteCode, setInviteCode] = useState('');
  const [teamId, setTeamId] = useState<ArenaTeamIdV1>('beta');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [startRequestId] = useState(() => crypto.randomUUID());

  const perform = async (action: 'create' | 'join') => {
    setBusy(true);
    setError(undefined);
    try {
      const response = await requestArena<ArenaRoomResponseV1>(
        action === 'create' ? '/api/arena/rooms' : '/api/arena/rooms/join',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            action === 'create' ? {} : { inviteCode, teamId },
          ),
        },
      );
      onRoom(response.room);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '擂台暂时无法入场');
    } finally {
      setBusy(false);
    }
  };

  return (
    <NpcConversation
      actor={ACTORS[1]!}
      messages={[
        {
          id: 'facility',
          body: room
            ? `你的候场房间邀请码为 ${room.inviteCode}。`
            : '擂台阵纹尚空。你可以开一间新房，或输入六位数字邀请码加入他人的房间。',
        },
      ]}
      busy={busy || loading}
      error={error}
      options={room ? [] : [{ id: 'leave', label: '返回场中', tone: 'muted' }]}
      onSelectOption={onExit}
    >
      {room ? (
        <ArenaRoomWorkspace
          room={room}
          currentCultivatorId={currentCultivatorId}
          busy={busy}
          onBusy={setBusy}
          onError={setError}
          onRoom={onRoom}
          startRequestId={startRequestId}
        />
      ) : (
        <div className="border-ink/15 mt-2 space-y-5 border-t pt-5">
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void perform('create')}
            className="border-crimson/45 text-crimson hover:bg-crimson/6 focus-visible:outline-crimson w-full border-l-2 px-5 py-3 text-left disabled:opacity-50"
          >
            创建一间切磋房
          </button>

          <div className="border-ink/10 border-t pt-5">
            <label className="text-ink-secondary block text-sm" htmlFor="arena-invite-code">
              六位数字邀请码
            </label>
            <input
              id="arena-invite-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={inviteCode}
              onChange={(event) =>
                setInviteCode(event.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="000000"
              className="border-ink/20 focus:border-crimson mt-2 w-full border bg-transparent px-4 py-3 font-mono text-xl tracking-[0.45em] outline-none"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['alpha', 'beta'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={teamId === candidate}
                  onClick={() => setTeamId(candidate)}
                  className={`border px-3 py-2 text-sm ${
                    teamId === candidate
                      ? 'border-crimson/45 text-crimson bg-crimson/6'
                      : 'border-ink/15 text-ink-secondary'
                  }`}
                >
                  加入{candidate === 'alpha' ? '青方' : '赤方'}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || inviteCode.length !== 6}
              onClick={() => void perform('join')}
              className="border-crimson/45 text-crimson hover:bg-crimson/6 mt-3 w-full border-l-2 px-5 py-3 text-left disabled:opacity-50"
            >
              凭邀请码入房
            </button>
          </div>
        </div>
      )}
    </NpcConversation>
  );
}

function ArenaRoomWorkspace({
  room,
  currentCultivatorId,
  busy,
  onBusy,
  onError,
  onRoom,
  startRequestId,
}: {
  room: ArenaRoomV1;
  currentCultivatorId?: string;
  busy: boolean;
  onBusy(value: boolean): void;
  onError(value: string | undefined): void;
  onRoom(room: ArenaRoomV1 | null): void;
  startRequestId: string;
}) {
  const [copied, setCopied] = useState(false);
  const current = useMemo(
    () => findCurrentSeat(room, currentCultivatorId),
    [currentCultivatorId, room],
  );
  const isHost = current?.seat.userId === room.hostUserId;
  const canStart =
    isHost &&
    isArenaRoomActive(room.status) &&
    hasBothArenaTeams(room) &&
    allArenaSeatsReady(room);

  const mutate = async (
    action: 'team' | 'ready' | 'leave',
    body: Record<string, unknown>,
  ) => {
    onBusy(true);
    onError(undefined);
    try {
      const response = await requestArena<{ room: ArenaRoomV1 | null }>(
        `/api/arena/rooms/${room.roomId}/${action}`,
        jsonRequest(body),
      );
      onRoom(response.room);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '擂台房间操作失败');
    } finally {
      onBusy(false);
    }
  };

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(room.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onError('无法复制邀请码，请手动记下这六位数字');
    }
  };

  const startBattle = async () => {
    onBusy(true);
    onError(undefined);
    try {
      const response = await requestArena<ArenaStartResponseV1>(
        `/api/arena/rooms/${room.roomId}/start`,
        jsonRequest({ requestId: room.startRequestId ?? startRequestId }),
      );
      onRoom(response.room);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '开擂失败');
    } finally {
      onBusy(false);
    }
  };

  return (
    <div className="border-ink/15 space-y-4 border-t pt-5">
      <div className="border-ink/15 flex flex-wrap items-center justify-between gap-3 border px-4 py-3">
        <div>
          <p className="text-ink-secondary text-xs tracking-[0.18em]">六位邀请码</p>
          <p className="mt-1 font-mono text-2xl tracking-[0.35em]">
            {room.inviteCode}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void copyInviteCode()}
          className="border-ink/20 text-ink-secondary hover:border-crimson/40 hover:text-crimson border px-4 py-2 text-sm disabled:opacity-50"
        >
          {copied ? '已复制' : '复制邀请码'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(['alpha', 'beta'] as const).map((teamId) => (
          <ArenaTeamPanel
            key={teamId}
            teamId={teamId}
            seats={room.teams[teamId]}
            hostUserId={room.hostUserId}
            currentCultivatorId={currentCultivatorId}
          />
        ))}
      </div>

      {current ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={
              busy ||
              !isArenaRoomActive(room.status) ||
              room.teams[current.teamId === 'alpha' ? 'beta' : 'alpha']
                .length >= 4
            }
            onClick={() =>
              void mutate('team', {
                teamId: current.teamId === 'alpha' ? 'beta' : 'alpha',
              })
            }
            className="border-ink/20 hover:border-crimson/40 hover:text-crimson border px-4 py-3 text-sm disabled:opacity-45"
          >
            换到{current.teamId === 'alpha' ? '赤方' : '青方'}
          </button>
          <button
            type="button"
            disabled={busy || !isArenaRoomActive(room.status)}
            onClick={() => void mutate('ready', { ready: !current.seat.ready })}
            className="border-crimson/45 text-crimson bg-crimson/6 border px-4 py-3 text-sm disabled:opacity-45"
          >
            {current.seat.ready ? '取消准备' : '准备完毕'}
          </button>
          <button
            type="button"
            disabled={busy || !isArenaRoomActive(room.status)}
            onClick={() => void mutate('leave', {})}
            className="border-ink/20 text-ink-secondary hover:border-crimson/40 hover:text-crimson border px-4 py-3 text-sm disabled:opacity-45"
          >
            离开房间
          </button>
        </div>
      ) : (
        <p className="text-crimson text-sm">当前修士不在此房间中，请刷新页面。</p>
      )}

      {isHost ? (
        <button
          type="button"
          disabled={busy || (!canStart && room.status !== 'starting')}
          onClick={() => void startBattle()}
          className="border-crimson/50 bg-crimson/6 text-crimson w-full border border-l-2 px-5 py-3 text-left disabled:cursor-not-allowed disabled:opacity-45"
        >
          {room.status === 'starting'
            ? '开擂中，点击重试连接战斗服务'
            : '开始擂台切磋'}
        </button>
      ) : null}

      <p className="text-ink-secondary text-xs leading-6">
        {room.status === 'starting'
          ? '阵容已冻结，正在创建实时战斗对局。'
          : '双方至少各有一人且全员准备后，房主才能开擂。双方人数不必相同，每方最多四人。'}
      </p>
    </div>
  );
}

function ArenaTeamPanel({
  teamId,
  seats,
  hostUserId,
  currentCultivatorId,
}: {
  teamId: ArenaTeamIdV1;
  seats: readonly ArenaRoomSeatV1[];
  hostUserId: string;
  currentCultivatorId?: string;
}) {
  return (
    <section className="border-ink/15 min-h-40 border p-4">
      <div className="flex items-center justify-between">
        <p className="text-ink-secondary text-xs tracking-[0.2em]">
          {teamId === 'alpha' ? '青方' : '赤方'}
        </p>
        <span className="text-ink-secondary text-xs">{seats.length} / 4</span>
      </div>
      <div className="mt-3 space-y-2">
        {seats.length ? (
          seats.map((seat) => (
            <div
              key={seat.userId}
              className="border-ink/10 flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate">
                {seat.displayName}
                {seat.userId === hostUserId ? (
                  <span className="text-ink-secondary ml-2 text-xs">房主</span>
                ) : null}
                {seat.cultivatorId === currentCultivatorId ? (
                  <span className="text-crimson ml-2 text-xs">你</span>
                ) : null}
              </span>
              <span
                className={seat.ready ? 'text-teal' : 'text-ink-secondary'}
              >
                {seat.ready ? '已准备' : '未准备'}
              </span>
            </div>
          ))
        ) : (
          <p className="text-ink-secondary py-6 text-center text-sm">
            暂无参战者
          </p>
        )}
      </div>
    </section>
  );
}

function findCurrentSeat(room: ArenaRoomV1, cultivatorId?: string) {
  if (!cultivatorId) return null;
  for (const teamId of ['alpha', 'beta'] as const) {
    const seat = room.teams[teamId].find(
      (candidate) => candidate.cultivatorId === cultivatorId,
    );
    if (seat) return { teamId, seat };
  }
  return null;
}

function jsonRequest(body: Record<string, unknown>): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function requestArena<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? '擂台请求失败');
  return body;
}

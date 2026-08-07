import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useBattleMatchClient } from '@app/lib/battle/useBattleMatchClient';
import {
  attachRealtimeBattlePhaser,
  type RealtimeBattlePhaserController,
} from '@app/components/feature/battle/realtime/RealtimeBattlePhaserRuntime';
import {
  BATTLE_QUICKBAR_MAX_SLOTS,
  loadBattleQuickbar,
  toggleBattleQuickbarAbility,
} from '@app/lib/battle/battleQuickbarStorage';
import type {
  BattleMatchPlayerViewV1,
  ClientBattleIntentV1,
} from '@shared/engine/battle-v5/match/types';
import {
  createBattlePresentationRound,
  createBattlePresentationSnapshot,
  type BattlePresentationRoundV1,
} from '@shared/online-battle/BattlePresentation';
import type {
  PlanningAbilityViewV1,
} from '@shared/engine/battle-v5/round/types';

function formatRemaining(deadlineAt: number | undefined, now: number) {
  if (!deadlineAt) return '—';
  return `${Math.max(0, Math.ceil((deadlineAt - now) / 1000))}s`;
}

function abilityTargetLabel(ability: PlanningAbilityViewV1) {
  if (ability.targetTeam === 'self') return '自身';
  if (ability.targetScope === 'aoe') return '范围';
  if (ability.targetScope === 'random') return '随机';
  return ability.targetTeam === 'ally' ? '友方' : '敌方';
}

function unavailableLabel(ability: PlanningAbilityViewV1) {
  switch (ability.unavailableReason) {
    case 'cooldown':
      return '冷却中';
    case 'resource':
      return '资源不足';
    case 'no_target':
      return '没有合法目标';
    case 'condition':
      return '当前条件不满足';
    default:
      return '暂不可用';
  }
}

function unitName(view: BattleMatchPlayerViewV1, unitId: string) {
  return view.publicSnapshot.units.find((unit) => unit.unitId === unitId)?.name ?? unitId;
}

function intentMatches(
  submitted: BattleMatchPlayerViewV1['ownSubmissions'][string] | undefined,
  expected: ClientBattleIntentV1,
) {
  if (!submitted || submitted.kind !== expected.kind) return false;
  if (expected.kind === 'pass') return true;
  if (submitted.kind !== 'ability') return false;
  return submitted.abilityId === expected.abilityId
    && submitted.targetUnitId === expected.targetUnitId;
}

interface PendingSubmission {
  readonly unitId: string;
  readonly intent: ClientBattleIntentV1;
  readonly checkpointRevision: number;
}

export default function LiveBattleMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { view, viewReceivedAt, connectionStatus, error, actions } = useBattleMatchClient(matchId ?? null);
  const [now, setNow] = useState(() => Date.now());
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [targetAbility, setTargetAbility] = useState<PlanningAbilityViewV1 | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);
  const [lockPending, setLockPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [quickbarOverrides, setQuickbarOverrides] = useState<Record<string, string[]>>({});
  const [revealedResultMatchId, setRevealedResultMatchId] = useState<string | null>(null);
  const phaserRootRef = useRef<HTMLDivElement>(null);
  const phaserControllerRef = useRef<RealtimeBattlePhaserController | null>(null);
  const presentedCommandSetIdRef = useRef<string | null>(null);
  const pendingPresentationRoundRef = useRef<BattlePresentationRoundV1 | null>(null);
  const lastPresentationCheckpointRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const ownUnits = useMemo(
    () => view?.planningView?.units ?? [],
    [view?.planningView?.units],
  );
  const fallbackUnitId = ownUnits.find((unit) => unit.alive)?.unitId ?? ownUnits[0]?.unitId ?? null;
  const resolvedActiveUnitId = activeUnitId && ownUnits.some((unit) => unit.unitId === activeUnitId)
    ? activeUnitId
    : fallbackUnitId;
  const activeUnit = ownUnits.find((unit) => unit.unitId === resolvedActiveUnitId) ?? null;
  const activeAbilities = activeUnit?.abilities ?? [];
  const ownSubmissions = view?.ownSubmissions ?? {};
  const allPlayersReady = view?.orchestration.allPlayersReady ?? false;
  const isPlanning = Boolean(view && connectionStatus === 'connected' && allPlayersReady && view.status === 'planning');
  const isLocked = Boolean(view?.lockedPlayerIds.includes(view.playerId ?? ''));
  const inspectedUnit = view?.publicSnapshot.units.find(
    (unit) => unit.unitId === (inspectedUnitId ?? resolvedActiveUnitId),
  );
  const quickbarScope = `${view?.playerId ?? ''}:${resolvedActiveUnitId ?? ''}`;
  const quickbar = quickbarOverrides[quickbarScope] ?? (
    view && resolvedActiveUnitId ? loadBattleQuickbar(view.playerId, resolvedActiveUnitId) : []
  );
  const serverNow = view?.serverNow !== undefined && viewReceivedAt !== null
    ? view.serverNow + (now - viewReceivedAt)
    : now;
  const pendingConfirmed = Boolean(
    pendingSubmission
      && intentMatches(
        view?.ownSubmissions[pendingSubmission.unitId],
        pendingSubmission.intent,
      ),
  );
  const presentationSnapshot = useMemo(
    () => view ? createBattlePresentationSnapshot(view, inspectedUnitId ?? undefined) : null,
    [view, inspectedUnitId],
  );
  const initialPresentationSnapshotRef = useRef<{
    matchId: string | undefined;
    snapshot: NonNullable<typeof presentationSnapshot>;
  } | null>(null);
  const hasPresentationSnapshot = presentationSnapshot !== null;
  const quickbarAbilities = quickbar
    .map((abilityId) => activeAbilities.find((ability) => ability.abilityId === abilityId))
    .filter((ability): ability is PlanningAbilityViewV1 => Boolean(ability));

  const submit = useCallback((unitId: string, intent: ClientBattleIntentV1) => {
    if (!actions || !isPlanning || isLocked || !view) return;
    setActionError(null);
    setPendingSubmission({
      unitId,
      intent,
      checkpointRevision: view.checkpointRevision,
    });
    try {
      actions.submitIntent(unitId, intent);
      setTargetAbility(null);
      setDrawerOpen(false);
    } catch {
      setPendingSubmission(null);
      setActionError('指令未能发出，请重新提交。');
    }
  }, [actions, isPlanning, isLocked, view]);

  const lock = useCallback(() => {
    if (!actions || !isPlanning || isLocked || lockPending) return;
    setActionError(null);
    setLockPending(true);
    try {
      actions.lock();
    } catch {
      setLockPending(false);
      setActionError('锁定请求未能发出，请重试。');
    }
  }, [actions, isPlanning, isLocked, lockPending]);

  useEffect(() => {
    if (!pendingSubmission) return;
    if (
      pendingConfirmed
      || connectionStatus !== 'connected'
      || view?.status !== 'planning'
      || view.checkpointRevision !== pendingSubmission.checkpointRevision
    ) {
      const clearTimer = window.setTimeout(() => setPendingSubmission(null), 0);
      return () => window.clearTimeout(clearTimer);
    }
    const timer = window.setTimeout(() => {
      setPendingSubmission(null);
      setActionError('指令未获服务端确认，请根据最新战况重新提交。');
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [connectionStatus, pendingConfirmed, pendingSubmission, view?.checkpointRevision, view?.status]);

  useEffect(() => {
    if (!lockPending) return;
    if (isLocked || connectionStatus !== 'connected' || view?.status !== 'planning') {
      const clearTimer = window.setTimeout(() => setLockPending(false), 0);
      return () => window.clearTimeout(clearTimer);
    }
    const timer = window.setTimeout(() => {
      setLockPending(false);
      setActionError('锁定未获服务端确认，请重试。');
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [connectionStatus, isLocked, lockPending, view?.status]);

  const chooseAbility = (ability: PlanningAbilityViewV1) => {
    if (!ability.ready || !isPlanning || !activeUnit) return;
    if (ability.targetTeam === 'self') {
      submit(activeUnit.unitId, {
        kind: 'ability',
        abilityId: ability.abilityId,
        targetUnitId: activeUnit.unitId,
      });
      return;
    }
    if (ability.targetScope === 'random' || ability.legalTargetIds.length === 0) {
      submit(activeUnit.unitId, { kind: 'ability', abilityId: ability.abilityId });
      return;
    }
    setTargetAbility(ability);
    setDrawerOpen(false);
  };

  useEffect(() => {
    presentedCommandSetIdRef.current = null;
    pendingPresentationRoundRef.current = null;
    lastPresentationCheckpointRef.current = null;
    const clearTimer = window.setTimeout(() => {
      setPendingSubmission(null);
      setLockPending(false);
      setActionError(null);
    }, 0);
    return () => window.clearTimeout(clearTimer);
  }, [matchId]);

  const entityClickRef = useRef<(entityId: string) => void>(() => undefined);
  useEffect(() => {
    entityClickRef.current = (entityId) => {
      const target = targetAbility?.legalTargetIds.includes(entityId);
      if (target && resolvedActiveUnitId && targetAbility) {
        submit(resolvedActiveUnitId, {
          kind: 'ability',
          abilityId: targetAbility.abilityId,
          targetUnitId: entityId,
        });
        return;
      }
      setInspectedUnitId(entityId);
      const currentView = view;
      if (currentView && currentView.teamId === currentView.publicSnapshot.units.find((unit) => unit.unitId === entityId)?.teamId) {
        setActiveUnitId(entityId);
      }
    };
  }, [targetAbility, resolvedActiveUnitId, view, submit]);

  useEffect(() => {
    if (
      presentationSnapshot &&
      initialPresentationSnapshotRef.current?.matchId !== matchId
    ) {
      initialPresentationSnapshotRef.current = { matchId, snapshot: presentationSnapshot };
    }
  }, [matchId, presentationSnapshot]);

  useEffect(() => {
    const root = phaserRootRef.current;
    const initialSnapshot = initialPresentationSnapshotRef.current?.snapshot;
    if (!root || !initialSnapshot) return;
    let cancelled = false;
    let controller: RealtimeBattlePhaserController | undefined;
    const mount = async () => {
      await document.fonts.ready;
      if (cancelled) return;
      controller = attachRealtimeBattlePhaser({
        root,
        initialSnapshot,
        onState: () => undefined,
        onFocus: (entityId) => entityClickRef.current(entityId),
      });
      phaserControllerRef.current = controller;
      const pendingRound = pendingPresentationRoundRef.current;
      if (pendingRound) {
        for (const timeline of pendingRound.timelines) controller.playTimeline(timeline);
        pendingPresentationRoundRef.current = null;
      }
    };
    void mount();
    return () => {
      cancelled = true;
      controller?.destroy();
      if (phaserControllerRef.current === controller) phaserControllerRef.current = null;
    };
  }, [matchId, hasPresentationSnapshot]);

  useEffect(() => {
    phaserControllerRef.current?.syncSnapshot(presentationSnapshot ?? {
      version: 'battle_presentation_snapshot_v1',
      elapsedMs: 0,
      cycle: 0,
      phase: '连接中',
      focusedEntityId: '',
      entities: [],
    });
  }, [presentationSnapshot]);

  useEffect(() => {
    phaserControllerRef.current?.setLegalTargets(targetAbility?.legalTargetIds ?? []);
  }, [targetAbility]);

  useEffect(() => {
    const round = view ? createBattlePresentationRound(view) : null;
    if (!round || round.commandSetId === presentedCommandSetIdRef.current) return;
    const previousCheckpoint = lastPresentationCheckpointRef.current;
    lastPresentationCheckpointRef.current = view?.checkpointRevision ?? null;
    presentedCommandSetIdRef.current = round.commandSetId;
    if (
      previousCheckpoint !== null &&
      view &&
      view.checkpointRevision > previousCheckpoint + 1
    ) {
      // The latest authoritative snapshot is rendered, but missed rounds are
      // not fabricated on the client after a reconnect.
      pendingPresentationRoundRef.current = null;
      return;
    }
    const controller = phaserControllerRef.current;
    if (!controller) {
      pendingPresentationRoundRef.current = round;
      return;
    }
    for (const timeline of round.timelines) controller.playTimeline(timeline);
  }, [view?.latestResolution?.commandSetId, view]);

  useEffect(() => {
    if (view?.status !== 'finished' || !matchId) return;
    const round = createBattlePresentationRound(view);
    const presentationMs = Math.min(
      6_000,
      Math.max(
        0,
        ...(round?.timelines.flatMap((timeline) =>
          timeline.commands.map((command) => command.at + ('duration' in command ? command.duration : 0)),
        ) ?? []),
      ) + 250,
    );
    const timer = window.setTimeout(
      () => setRevealedResultMatchId(matchId),
      presentationMs,
    );
    return () => window.clearTimeout(timer);
  }, [matchId, view?.status, view?.latestResolution?.commandSetId, view]);

  return (
    <main className="flex min-h-dvh flex-col overflow-hidden bg-[#eee7d6] text-[#2c1810]">
      <header className="relative z-20 flex min-h-16 items-center justify-between gap-3 border-b border-[#2c1810]/20 bg-[#eee7d6]/95 px-4 py-2 backdrop-blur md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/game/battle/history"
            className="border-b border-dashed border-[#2c1810]/35 px-1 py-1 text-xs text-[#2c1810]/65"
          >
            [离阵]
          </Link>
          <div className="min-w-0">
            <p className="truncate text-[0.65rem] tracking-[0.22em] text-[#2c1810]/55">实时同步战局</p>
            <h1 className="truncate text-base font-semibold tracking-[0.12em]">{matchId ?? '对局'}</h1>
          </div>
        </div>
        <div className="text-center text-xs text-[#2c1810]/70">
          <strong className="block tracking-[0.12em]">第 {view?.round ?? '—'} 回合 · {view?.status ?? '连接中'}</strong>
          <span className="mt-1 block">{allPlayersReady ? `剩余 ${formatRemaining(view?.deadlineAt, serverNow)}` : '等待玩家接受邀请'}</span>
        </div>
        <div className="flex items-center gap-2 text-[0.65rem] text-[#3f6b56]">
          <span className={`h-2 w-2 rounded-full ${connectionStatus === 'connected' ? 'bg-current' : connectionStatus === 'disconnected' ? 'bg-[#8f2433]' : 'bg-[#946718]'}`} aria-hidden="true" />
          <span className="hidden sm:inline">{connectionStatus === 'connected' ? '已连接' : connectionStatus === 'disconnected' ? '正在重连' : '连接中'}</span>
        </div>
      </header>

      {error && <section className="relative z-20 mx-auto w-full max-w-6xl border-b border-[#8f2433]/30 bg-[#8f2433]/5 px-4 py-3 text-sm text-[#8f2433]">{error}</section>}
      {actionError && <section className="relative z-20 mx-auto w-full max-w-6xl border-b border-[#8f2433]/30 bg-[#8f2433]/5 px-4 py-2 text-center text-xs text-[#8f2433]">{actionError}</section>}

      {connectionStatus === 'disconnected' && (
        <section className="relative z-20 border-b border-[#946718]/30 bg-[#946718]/5 px-4 py-2 text-center text-xs text-[#694d1d]">
          连接已中断，正在恢复战局；恢复前不能提交新指令。
        </section>
      )}

      <section className="relative min-h-0 flex-1 overflow-hidden px-3 py-3 md:px-8 md:py-5">
        <div className="relative mx-auto flex h-full min-h-[24rem] max-w-7xl items-center justify-center border border-[#2c1810]/15 bg-[#e8dfca]/55 p-3 shadow-inner md:p-8">
          <div className="pointer-events-none absolute inset-x-8 top-1/2 border-t border-dashed border-[#2c1810]/15" />
          <div className="pointer-events-none absolute inset-y-8 left-1/2 border-l border-dashed border-[#8f2433]/15" />
          <div ref={phaserRootRef} className="absolute inset-0 overflow-hidden" aria-label="多人实时战斗场景" />
          {!view && <p className="relative z-10 py-20 text-center text-sm text-[#2c1810]/50">正在建立战斗服务连接…</p>}

          {inspectedUnit && (
            <aside className="absolute bottom-3 right-3 max-w-[15rem] border-r-2 border-[#8f2433] bg-[#eee7d6]/90 px-3 py-2 text-right shadow-sm backdrop-blur md:bottom-5 md:right-5">
              <strong className="block text-sm">{inspectedUnit.name}</strong>
              <span className="mt-1 block text-[0.68rem] text-[#2c1810]/60">{inspectedUnit.alive ? '在阵' : '已离阵'} · 护盾 {inspectedUnit.shield}</span>
            </aside>
          )}
        </div>
      </section>

      {targetAbility && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 border border-[#8f2433]/40 bg-[#eee7d6]/95 px-4 py-2 text-xs shadow-lg backdrop-blur">
            <span>为「{targetAbility.name}」选择{abilityTargetLabel(targetAbility)}目标</span>
            <button type="button" className="border-b border-dashed border-[#2c1810]/40 px-1 text-[#2c1810]/65" onClick={() => setTargetAbility(null)}>取消</button>
          </div>
        </div>
      )}

      <footer className="relative z-20 border-t border-[#2c1810]/20 bg-[#eee7d6]/97 px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-2 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {quickbarAbilities.map((ability) => (
              <button
                key={ability.abilityId}
                type="button"
                disabled={!isPlanning || !ability.ready || isLocked}
                onClick={() => chooseAbility(ability)}
                className="min-w-24 border border-[#3f6b56]/40 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40"
              >
                <strong className="block truncate text-xs text-[#3f6b56]">{ability.name}</strong>
                <span className="mt-1 block text-[0.6rem] text-[#2c1810]/55">{ability.ready ? abilityTargetLabel(ability) : unavailableLabel(ability)}</span>
              </button>
            ))}
            <button type="button" onClick={() => setDrawerOpen(true)} className="min-w-24 border border-dashed border-[#2c1810]/30 px-3 py-2 text-left text-xs text-[#2c1810]/65">全部术法<br /><span className="text-[0.6rem]">{activeAbilities.length} 项 · {BATTLE_QUICKBAR_MAX_SLOTS} 槽快捷栏</span></button>
          </div>
          <button
            type="button"
            disabled={!actions || !isPlanning || isLocked}
            onClick={() => activeUnit && submit(activeUnit.unitId, { kind: 'pass' })}
            className="hidden border border-[#2c1810]/25 px-3 py-2 text-xs disabled:opacity-40 sm:block"
          >
            观望
          </button>
          <button
            type="button"
            disabled={!actions || !isPlanning || isLocked || lockPending || !ownUnits.every((unit) => !unit.alive || ownSubmissions[unit.unitId])}
            onClick={lock}
            className="border border-[#8f2433]/50 px-4 py-2 text-xs text-[#8f2433] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLocked ? '已锁定' : lockPending ? '锁定中' : '锁定本方'}
          </button>
        </div>
        <div className="mx-auto mt-2 flex max-w-7xl gap-2 overflow-x-auto" aria-label="受控单位">
          {ownUnits.map((unit) => (
            <button key={unit.unitId} type="button" onClick={() => setActiveUnitId(unit.unitId)} className={`whitespace-nowrap border-b px-2 py-1 text-[0.68rem] ${unit.unitId === resolvedActiveUnitId ? 'border-[#8f2433] text-[#8f2433]' : 'border-transparent text-[#2c1810]/55'}`}>
              {unitName(view!, unit.unitId)} · {pendingSubmission?.unitId === unit.unitId && !pendingConfirmed ? '提交中' : ownSubmissions[unit.unitId] ? '已提交' : '待选'}
            </button>
          ))}
        </div>
      </footer>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-[#2c1810]/20" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}>
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-[#2c1810]/20 bg-[#eee7d6] shadow-2xl sm:w-[25rem]" role="dialog" aria-modal="true" aria-label="选择战斗技能">
            <div className="flex items-center justify-between border-b border-[#2c1810]/15 px-5 py-4">
              <div><p className="text-[0.65rem] tracking-[0.18em] text-[#2c1810]/55">第 {view?.round ?? '—'} 回合</p><h2 className="mt-1 text-base font-semibold">{activeUnit ? unitName(view!, activeUnit.unitId) : '选择单位'} · 术法</h2></div>
              <button type="button" onClick={() => setDrawerOpen(false)} className="border-b border-dashed border-[#2c1810]/35 px-1 py-1 text-xs text-[#2c1810]/65">关闭</button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {activeAbilities.map((ability) => {
                const pinned = quickbar.includes(ability.abilityId);
                return (
                  <div key={ability.abilityId} className="border border-[#2c1810]/15 bg-white/25 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" disabled={!isPlanning || !ability.ready || isLocked} onClick={() => chooseAbility(ability)} className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-45">
                        <strong className="block text-sm">{ability.name}</strong>
                        <span className="mt-1 block text-[0.68rem] text-[#2c1810]/55">{ability.description || `${abilityTargetLabel(ability)} · ${ability.targetScope}`}</span>
                      </button>
              <button type="button" aria-label={pinned ? '移出快捷栏' : '加入快捷栏'} onClick={() => {
                if (!view || !resolvedActiveUnitId) return;
                const next = toggleBattleQuickbarAbility(view.playerId, resolvedActiveUnitId, ability.abilityId);
                setQuickbarOverrides((current) => ({ ...current, [quickbarScope]: next }));
              }} className={`text-lg ${pinned ? 'text-[#8f2433]' : 'text-[#2c1810]/35'}`}>{pinned ? '★' : '☆'}</button>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[0.65rem] text-[#2c1810]/55">
                      <span>{ability.costs?.map((cost) => `${cost.resource === 'mp' ? '真元' : '气血'} ${cost.amount}`).join(' · ') || '无消耗'}</span>
                      <span>{ability.cooldown ? `冷却 ${ability.cooldown.current}/${ability.cooldown.max}` : abilityTargetLabel(ability)}</span>
                    </div>
                    {!ability.ready && <p className="mt-2 text-[0.65rem] text-[#8f2433]">{unavailableLabel(ability)}</p>}
                  </div>
                );
              })}
              {activeAbilities.length === 0 && <p className="py-10 text-center text-sm text-[#2c1810]/50">当前单位没有可选术法。</p>}
            </div>
          </aside>
        </div>
      )}

      {!view && !error && <p className="sr-only">正在建立战斗服务连接</p>}

      {view?.status === 'finished' && revealedResultMatchId === matchId && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#2c1810]/35 px-4 backdrop-blur-[2px]">
          <section className="w-full max-w-sm border border-[#2c1810]/25 bg-[#eee7d6] p-6 text-center shadow-2xl">
            <p className="text-xs tracking-[0.22em] text-[#2c1810]/55">战局已定</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[0.14em]">
              {view.latestResolution?.outcome.draw
                ? '两阵平分秋色'
                : view.latestResolution?.outcome.winnerTeamId === view.teamId
                  ? '此阵得胜'
                  : '此阵惜败'}
            </h2>
            <p className="mt-3 text-sm text-[#2c1810]/60">战斗结果已确认，完整回放正在归档。</p>
            <Link to="/game/battle/history" className="mt-5 inline-block border border-[#8f2433]/50 px-4 py-2 text-sm text-[#8f2433]">查看战斗记录</Link>
          </section>
        </div>
      )}

      {view?.status === 'cancelled' && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-[#2c1810]/35 px-4 backdrop-blur-[2px]">
          <section className="w-full max-w-sm border border-[#2c1810]/25 bg-[#eee7d6] p-6 text-center shadow-2xl">
            <p className="text-xs tracking-[0.22em] text-[#2c1810]/55">对局已结束</p>
            <h2 className="mt-2 text-xl font-semibold">本场对局已取消</h2>
            <Link to="/game/battle/history" className="mt-5 inline-block border border-[#2c1810]/40 px-4 py-2 text-sm">返回战斗记录</Link>
          </section>
        </div>
      )}
    </main>
  );
}

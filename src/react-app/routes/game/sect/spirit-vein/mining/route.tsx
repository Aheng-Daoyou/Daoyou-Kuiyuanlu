import {
  getSectPresentationForContext,
  useSectContextQuery,
  useSectTasksQuery,
} from '@app/components/feature/sect/sectResources';
import { createSectRoomNpcHref } from '@app/components/feature/sect/sectRoomNavigation';
import {
  decodeSectTaskOutcome,
  readMiningResultOutcome,
  readMiningSessionOutcome,
} from '@app/components/feature/sect/sectTaskOutcomeRegistry';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton, InkNotice } from '@app/components/ui';
import {
  readActivityViewportState,
  releaseActivityImmersiveMode,
  requestActivityImmersiveMode,
  shouldBlockActivityForPortrait,
} from '@app/lib/gameActivityImmersive';
import { useResourceMutation } from '@app/lib/resources/mutations';
import type {
  SectMiningResultData,
  SectMiningSessionData,
  SectTaskActionData,
  SectTasksData,
  SectTaskViewData,
} from '@shared/contracts/sect';
import {
  MINING_DURATION_MS,
  MINING_MAX_SCORE,
  type MiningCastInput,
} from '@shared/engine/sect';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  attachMiningPhaser,
  type MiningGameProgress,
  type MiningPhaserController,
} from './MiningPhaserRuntime';
import {
  miningActivityMessage,
  resolveMiningActivityMode,
} from './miningActivityState';

type ActiveMiningSession =
  | { kind: 'practice'; seed: string }
  | {
      kind: 'reward';
      seed: string;
      task: SectTaskViewData;
      server: SectMiningSessionData;
    };

interface MiningSettlement extends SectMiningResultData {
  kind: 'practice' | 'reward';
}

function postJson(
  input: Record<string, unknown>,
  idempotencyKey: string = crypto.randomUUID(),
): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ input }),
  };
}

function useMiningLandscapeGate() {
  const [viewport, setViewport] = useState(() => readActivityViewportState());

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');
    const landscape = window.matchMedia('(orientation: landscape)');
    const update = () => setViewport(readActivityViewportState());
    coarse.addEventListener('change', update);
    landscape.addEventListener('change', update);
    window.addEventListener('orientationchange', update);
    document.addEventListener('fullscreenchange', update);
    return () => {
      coarse.removeEventListener('change', update);
      landscape.removeEventListener('change', update);
      window.removeEventListener('orientationchange', update);
      document.removeEventListener('fullscreenchange', update);
    };
  }, []);

  return shouldBlockActivityForPortrait(viewport);
}

function localPracticeResult(
  progress: MiningGameProgress,
): SectMiningResultData {
  return {
    score: progress.score,
    maxScore: progress.maxScore,
    ratio: progress.maxScore > 0 ? progress.score / progress.maxScore : 0,
    ...(progress.tier ? { tier: progress.tier } : {}),
    qualified: Boolean(progress.tier),
    collected: progress.collected,
    destroyed: progress.destroyed,
    clearedAll: progress.collected + progress.destroyed === progress.total,
    ores: progress.ores,
  };
}

const MINING_ORE_LABELS = {
  spirit_crystal: '小型灵晶',
  copper_ore: '赤铜灵矿',
  dark_iron: '玄铁矿团',
  earth_essence: '地脉灵髓',
} as const;

function nextTierTarget(score: number, maxScore: number): string {
  const thresholds = [
    ['D', 0.2],
    ['C', 0.35],
    ['B', 0.5],
    ['A', 0.65],
    ['S', 0.8],
  ] as const;
  const next = thresholds.find(
    ([, ratio]) => score < Math.ceil(maxScore * ratio),
  );
  return next
    ? `距离 ${next[0]} 档还差 ${Math.max(0, Math.ceil(maxScore * next[1]) - score)} 分`
    : '已经达到最高档';
}

export default function SectSpiritVeinMiningPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MiningPhaserController | undefined>(undefined);
  const startedRef = useRef(false);
  const navigate = useNavigate();
  const context = useSectContextQuery();
  const { data: taskData, error: taskError } = useSectTasksQuery();
  const presentation = getSectPresentationForContext(context.data);
  const { mutate } = useResourceMutation();
  const { pushToast } = useInkUI();
  const portraitBlocked = useMiningLandscapeGate();
  const [session, setSession] = useState<ActiveMiningSession>();
  const [progress, setProgress] = useState<MiningGameProgress>();
  const [settlement, setSettlement] = useState<MiningSettlement>();
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [operationError, setOperationError] = useState<string>();

  const beginPractice = useCallback(() => {
    setSession({
      kind: 'practice',
      seed: `practice:${crypto.randomUUID()}`,
    });
    setProgress(undefined);
    setSettlement(undefined);
    setOperationError(undefined);
    startedRef.current = true;
  }, []);

  const beginSession = useCallback(
    async (snapshot?: SectTasksData) => {
      const mode = resolveMiningActivityMode(snapshot);
      setStarting(true);
      setSession(undefined);
      setProgress(undefined);
      setSettlement(undefined);
      setOperationError(undefined);
      startedRef.current = true;
      if (mode.kind === 'practice') {
        beginPractice();
        setStarting(false);
        return;
      }
      try {
        const result = await mutate<SectTaskActionData>(
          fetch(
            `/api/sects/current/tasks/${encodeURIComponent(mode.task.definitionId)}/actions/start`,
            postJson({}),
          ),
        );
        const decoded = decodeSectTaskOutcome(result.outcome);
        if (!decoded.ok) throw new Error(decoded.error);
        const server = readMiningSessionOutcome(decoded.value);
        if (!server) throw new Error('宗门返回的灵矿采掘场次无法识别');
        setSession({
          kind: 'reward',
          seed: server.seed,
          task: mode.task,
          server,
        });
      } catch (reason) {
        setOperationError(
          reason instanceof Error ? reason.message : '灵矿采掘场开启失败',
        );
      } finally {
        setStarting(false);
      }
    },
    [beginPractice, mutate],
  );

  useEffect(() => {
    if (portraitBlocked || startedRef.current || (!taskData && !taskError))
      return;
    void beginSession(taskData);
  }, [beginSession, portraitBlocked, taskData, taskError]);

  const complete = useCallback(
    async (casts: MiningCastInput[], finalProgress: MiningGameProgress) => {
      if (!session) return;
      if (session.kind === 'practice') {
        setSettlement({
          kind: 'practice',
          ...localPracticeResult(finalProgress),
        });
        return;
      }
      setSubmitting(true);
      setOperationError(undefined);
      try {
        const result = await mutate<SectTaskActionData>(
          fetch(
            `/api/sects/current/tasks/${encodeURIComponent(session.task.definitionId)}/actions/complete`,
            postJson(
              {
                sessionId: session.server.sessionId,
                rulesVersion: session.server.rulesVersion,
                casts,
              },
              session.server.sessionId,
            ),
          ),
        );
        const decoded = decodeSectTaskOutcome(result.outcome);
        if (!decoded.ok) throw new Error(decoded.error);
        const miningResult = readMiningResultOutcome(decoded.value);
        if (!miningResult) throw new Error('宗门无法识别本次采掘成绩');
        setSettlement({ kind: 'reward', ...miningResult });
        pushToast({
          message: miningResult.qualified
            ? `灵矿采掘评定为 ${miningResult.tier} 档`
            : '本轮采掘尚未达到验收线',
          tone: miningResult.qualified ? 'success' : 'warning',
        });
      } catch (reason) {
        setOperationError(
          reason instanceof Error ? reason.message : '灵矿采掘结果提交失败',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [mutate, pushToast, session],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !session || portraitBlocked) return;
    const controller = attachMiningPhaser({
      root,
      seed: session.seed,
      canvasLabel: `${presentation.facilityLabels.spirit_vein ?? '宗门灵脉'}灵索采矿游戏画布`,
      onState: setProgress,
      onComplete: (casts, finalProgress) => void complete(casts, finalProgress),
      onError: setOperationError,
    });
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      if (controllerRef.current === controller)
        controllerRef.current = undefined;
    };
  }, [
    complete,
    portraitBlocked,
    presentation.facilityLabels.spirit_vein,
    session,
  ]);

  useEffect(
    () => () => {
      void releaseActivityImmersiveMode();
    },
    [],
  );

  const exit = async () => {
    await releaseActivityImmersiveMode();
    navigate(createSectRoomNpcHref('/game/sect/spirit-vein', 'facility'), {
      replace: true,
    });
  };

  const newGame = async () => {
    startedRef.current = true;
    await beginSession(taskData);
  };

  const mode = resolveMiningActivityMode(taskData);
  const remainingSeconds = Math.ceil(
    (progress?.remainingMs ?? MINING_DURATION_MS) / 1_000,
  );

  return (
    <div
      className="fixed inset-0 isolate overflow-hidden bg-[#07110f] text-stone-50"
      aria-label="灵索采矿小游戏"
    >
      <div
        className="absolute -inset-8 scale-110 bg-cover bg-center opacity-55 blur-xl"
        style={{
          backgroundImage: "url('/assets/sect/mining/spirit-vein-cavern.webp')",
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[#06100e]/35" aria-hidden="true" />

      {!portraitBlocked ? (
        <div ref={rootRef} className="absolute inset-0" />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-[max(env(safe-area-inset-left),0.75rem)] pt-[max(env(safe-area-inset-top),0.75rem)] pr-[max(env(safe-area-inset-right),0.75rem)]">
        <div className="pointer-events-auto rounded-full bg-[#10201b]/65 px-4 py-2 text-sm shadow-lg ring-1 ring-white/10 backdrop-blur-md">
          <span>得分 {progress?.score ?? 0}</span>
          <span className="ml-4">灵矿 {progress?.collected ?? 0}/16</span>
          {progress?.destroyed ? (
            <span className="ml-4 text-orange-200">
              炸毁 {progress.destroyed}
            </span>
          ) : null}
          <span className="ml-4">剩余 {remainingSeconds}s</span>
          <span className="ml-4 text-xs text-emerald-100/75">
            {session?.kind === 'reward' ? '今日委托' : '自由练习'}
          </span>
        </div>
        <button
          type="button"
          className="pointer-events-auto rounded-full bg-[#10201b]/65 px-4 py-2 text-sm shadow-lg ring-1 ring-white/10 backdrop-blur-md transition hover:bg-[#10201b]/85 disabled:opacity-50"
          onClick={() => void exit()}
          disabled={submitting}
        >
          退出
        </button>
      </div>

      {portraitBlocked ? (
        <FullscreenNotice>
          <p className="text-lg font-semibold">请将设备旋转为横屏</p>
          <p className="mt-2 text-sm leading-7 text-stone-300">
            灵索需要足够宽度辨认摆角与矿藏位置。
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <InkButton
              variant="primary"
              onClick={() => void requestActivityImmersiveMode()}
            >
              进入横屏全屏
            </InkButton>
            <InkButton variant="secondary" onClick={() => void exit()}>
              返回灵脉
            </InkButton>
          </div>
        </FullscreenNotice>
      ) : starting || (!session && !operationError) ? (
        <FullscreenNotice>
          <p className="loading-tip">灵索与矿场封签正在校准……</p>
        </FullscreenNotice>
      ) : submitting ? (
        <FullscreenNotice>
          <p className="loading-tip">正在验收灵索轨迹与矿藏……</p>
        </FullscreenNotice>
      ) : operationError ? (
        <FullscreenNotice>
          <InkNotice>{operationError}</InkNotice>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <InkButton onClick={() => void newGame()}>重新开启</InkButton>
            <InkButton variant="secondary" onClick={beginPractice}>
              改为自由练习
            </InkButton>
            <InkButton variant="secondary" onClick={() => void exit()}>
              返回灵脉
            </InkButton>
          </div>
        </FullscreenNotice>
      ) : settlement ? (
        <FullscreenNotice>
          <p className="text-xl font-semibold">
            {settlement.qualified
              ? `采掘评定 · ${settlement.tier} 档`
              : '本轮采掘未达标'}
          </p>
          <p className="mt-3 text-sm leading-7 text-stone-300">
            得分 {settlement.score}/{settlement.maxScore}，
            {nextTierTarget(settlement.score, settlement.maxScore)}。
          </p>
          {settlement.ores.length ? (
            <p className="mt-2 text-sm leading-7 text-stone-300">
              采得：
              {settlement.ores
                .map(
                  (ore) =>
                    `${MINING_ORE_LABELS[ore.kind]} ×${ore.count}（${ore.score}分）`,
                )
                .join('、')}
            </p>
          ) : (
            <p className="mt-2 text-sm text-stone-400">本轮未采得灵矿。</p>
          )}
          {settlement.destroyed ? (
            <p className="mt-2 text-sm text-orange-200/80">
              爆破波及灵矿 ×{settlement.destroyed}，不会计入得分。
            </p>
          ) : null}
          {settlement.rewardSummary?.length ? (
            <div className="mx-auto mt-3 max-w-sm text-sm leading-7 text-emerald-100">
              {settlement.rewardSummary.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          <p className="mt-3 text-xs leading-6 text-stone-400">
            {settlement.kind === 'practice'
              ? '自由练习不会产生奖励。'
              : settlement.qualified
                ? '采掘回执已成，请回事务堂领取赏赐。'
                : '委托仍在名下，可以重新开启采掘场。'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <InkButton variant="primary" onClick={() => void exit()}>
              返回灵脉
            </InkButton>
            <InkButton
              variant="secondary"
              onClick={() => {
                if (settlement.qualified && settlement.kind === 'reward')
                  beginPractice();
                else void newGame();
              }}
            >
              {settlement.qualified && settlement.kind === 'reward'
                ? '自由练习'
                : '再来一局'}
            </InkButton>
          </div>
        </FullscreenNotice>
      ) : null}

      {!portraitBlocked && session && progress && !settlement ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-[max(env(safe-area-inset-bottom),0.65rem)] text-center">
          <p className="inline-block rounded-full bg-black/50 px-4 py-2 text-xs text-stone-200 backdrop-blur-sm">
            点击矿洞或按空格放下灵索 ·{' '}
            大矿更重也更值钱 · 炸药桶会炸毁周围灵矿 ·{' '}
            {nextTierTarget(progress.score, MINING_MAX_SCORE)} ·{' '}
            {miningActivityMessage(
              session.kind === 'reward'
                ? { kind: 'reward', task: session.task }
                : mode.kind === 'practice'
                  ? mode
                  : { kind: 'practice', reason: 'unavailable' },
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function FullscreenNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/72 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md text-center">{children}</div>
    </div>
  );
}

import {
  GameLoadingState,
  GameSceneAsideSection,
  GameSceneFrame,
} from '@app/components/game-shell';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkNotice } from '@app/components/ui';
import { useResourceMutation } from '@app/lib/resources/mutations';
import { useCultivatorCurrency } from '@app/lib/resources/player';
import type {
  BlackMarketNpcId,
  BlackMarketOverview,
  BlackMarketSessionView,
} from '@shared/types/blackMarket';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BlackMarketConversation } from './BlackMarketConversation';
import { BlackMarketRevealPanel } from './BlackMarketReveal';
import { BlackMarketRoom } from './BlackMarketRoom';
import {
  commitBlackMarketPurchase,
  fetchBlackMarketOverview,
  interactWithBlackMarket,
  leaveBlackMarketSession,
  openBlackMarketSession,
} from './blackMarketApi';

const DEFAULT_NODE_ID = 'TN_YUE_01';

function formatCountdown(target: number): string {
  const seconds = Math.max(0, Math.floor((target - Date.now()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours > 0 ? `${hours}时` : ''}${minutes}分${rest}秒`;
}

export default function BlackMarketPage() {
  const [searchParams] = useSearchParams();
  const nodeId = searchParams.get('nodeId') || DEFAULT_NODE_ID;
  const currency = useCultivatorCurrency();
  const { mutate } = useResourceMutation();
  const { pushToast } = useInkUI();
  const [overview, setOverview] = useState<BlackMarketOverview>();
  const [session, setSession] = useState<BlackMarketSessionView>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [timeLeft, setTimeLeft] = useState('');
  const interactionControllerRef = useRef<AbortController | undefined>(
    undefined,
  );

  useEffect(() => () => interactionControllerRef.current?.abort(), []);

  const loadOverview = useCallback(
    (signal?: AbortSignal) => fetchBlackMarketOverview(nodeId, signal),
    [nodeId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const next = await loadOverview(controller.signal);
        if (!controller.signal.aborted) {
          setOverview(next);
          setTimeLeft(formatCountdown(next.nextRefresh));
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : '黑市暂未开门');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [loadOverview]);

  useEffect(() => {
    if (!overview) return;
    let cancelled = false;
    const timer = window.setInterval(
      () => setTimeLeft(formatCountdown(overview.nextRefresh)),
      1000,
    );
    const rolloverTimer = window.setTimeout(
      () => {
        void (async () => {
          try {
            const nextOverview = await loadOverview();
            if (cancelled) return;
            setSession(undefined);
            setOverview(nextOverview);
            setTimeLeft(formatCountdown(nextOverview.nextRefresh));
            setError(undefined);
            setNotice(undefined);
          } catch (reason) {
            if (cancelled) return;
            pushToast({
              message:
                reason instanceof Error ? reason.message : '新一轮黑市暂未开门',
              tone: 'warning',
            });
          }
        })();
      },
      Math.max(250, overview.nextRefresh - Date.now() + 250),
    );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(rolloverTimer);
    };
  }, [loadOverview, overview, pushToast]);

  const selectedNpc = useMemo(
    () => overview?.npcs.find((npc) => npc.id === session?.npcId),
    [overview, session?.npcId],
  );

  const runInteraction = async (message?: string, offeredPrice?: number) => {
    if (!session) return;
    const activeSession = session;
    const controller = new AbortController();
    interactionControllerRef.current?.abort();
    interactionControllerRef.current = controller;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const optimisticId = `${activeSession.id}:${activeSession.version}:optimistic`;
    const optimisticBody = message?.trim()
      ? offeredPrice != null
        ? `${message.trim()}（报价：${offeredPrice.toLocaleString()}灵石）`
        : message.trim()
      : `我出${offeredPrice?.toLocaleString()}灵石。`;
    setSession((current) =>
      current
        ? {
            ...current,
            messages: [
              ...current.messages,
              {
                id: `${optimisticId}:player`,
                role: 'player',
                body: optimisticBody,
                createdAt: Date.now(),
                turn: activeSession.version,
              },
              {
                id: `${optimisticId}:npc`,
                role: 'npc',
                body: '……',
                gesture:
                  offeredPrice != null
                    ? '他没有立刻接价，只用指节轻敲摊沿。'
                    : '他重新打量着你指出的地方。',
                createdAt: Date.now() + 1,
                turn: activeSession.version,
              },
            ],
          }
        : current,
    );
    try {
      const result = await interactWithBlackMarket(
        nodeId,
        activeSession.id,
        { message, offeredPrice, version: activeSession.version },
        {
          onResolved: (event) => {
            setSession({
              ...event.result.session,
              messages: event.result.session.messages.map((item) =>
                item.id === event.messageId ? { ...item, body: '' } : item,
              ),
            });
          },
          onReplyChunk: (messageId, text) => {
            setSession((current) =>
              current
                ? {
                    ...current,
                    messages: current.messages.map((item) =>
                      item.id === messageId
                        ? { ...item, body: `${item.body}${text}` }
                        : item,
                    ),
                  }
                : current,
            );
          },
          onReplyComplete: (messageId, body) => {
            setSession((current) =>
              current
                ? {
                    ...current,
                    messages: current.messages.map((item) =>
                      item.id === messageId ? { ...item, body } : item,
                    ),
                  }
                : current,
            );
          },
          onReplyError: (messageId, fallbackBody) => {
            setSession((current) =>
              current
                ? {
                    ...current,
                    messages: current.messages.map((item) =>
                      item.id === messageId
                        ? { ...item, body: fallbackBody }
                        : item,
                    ),
                  }
                : current,
            );
          },
        },
        controller.signal,
      );
      if (result.notice) {
        setNotice(result.notice);
      } else if (offeredPrice != null) {
        const feedback =
          result.outcome === 'accepted'
            ? `摊主点头认价：${result.session.currentPrice.toLocaleString()} 灵石。`
            : result.outcome === 'countered'
              ? `摊主松了口：现在要价 ${result.session.currentPrice.toLocaleString()} 灵石。`
              : result.outcome === 'locked'
                ? '这一下压得太狠，摊主把价彻底咬死了。'
                : result.outcome === 'rejected'
                  ? '摊主没有松口。'
                  : undefined;
        if (feedback) setNotice(feedback);
      }
      if (result.session.phase === 'abandoned') {
        setSession(undefined);
        const nextOverview = await loadOverview();
        setOverview(nextOverview);
        setTimeLeft(formatCountdown(nextOverview.nextRefresh));
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setSession(activeSession);
        setError(reason instanceof Error ? reason.message : '交谈暂时中断');
      }
    } finally {
      if (interactionControllerRef.current === controller) {
        interactionControllerRef.current = undefined;
        setBusy(false);
      }
    }
  };

  const handleSelect = async (npcId: BlackMarketNpcId) => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      setSession(await openBlackMarketSession(nodeId, npcId));
    } catch (reason) {
      pushToast({
        message: reason instanceof Error ? reason.message : '摊主没有理会你',
        tone: 'warning',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    if (!session) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await mutate<{
        reveal: NonNullable<BlackMarketSessionView['reveal']>;
      }>(
        commitBlackMarketPurchase(
          nodeId,
          session.id,
          session.version,
          session.currentPrice,
        ),
      );
      setSession((current) =>
        current
          ? {
              ...current,
              phase: 'completed',
              reveal: result.reveal,
              currentPrice: result.reveal.paidPrice,
              version: current.version + 1,
            }
          : current,
      );
      try {
        const nextOverview = await loadOverview();
        setOverview(nextOverview);
        setTimeLeft(formatCountdown(nextOverview.nextRefresh));
      } catch {
        pushToast({
          message: '交易已经完成，但摊位状态暂未刷新',
          tone: 'warning',
        });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '成交失败');
      throw reason;
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await leaveBlackMarketSession(nodeId, session.id, session.version);
      setSession(undefined);
      const nextOverview = await loadOverview();
      setOverview(nextOverview);
      setTimeLeft(formatCountdown(nextOverview.nextRefresh));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '离开失败');
    } finally {
      setBusy(false);
    }
  };

  const detail = session?.reveal ? (
    <BlackMarketRevealPanel
      reveal={session.reveal}
      onBack={() => setSession(undefined)}
    />
  ) : session && selectedNpc ? (
    <BlackMarketConversation
      npc={selectedNpc}
      session={session}
      busy={busy}
      error={error}
      notice={notice}
      onSubmit={(message, offeredPrice) =>
        void runInteraction(message, offeredPrice)
      }
      onCommit={handleCommit}
      onLeave={() => void handleLeave()}
    />
  ) : undefined;

  return (
    <GameSceneFrame
      title="【暗巷黑市】"
      description="灯火之外，来历不明的货只在低声交谈中显出几分真相。"
      aside={
        <>
          <GameSceneAsideSection title="暗巷余时">
            <div className="space-y-2 text-sm leading-7">
              <p>本轮收摊：{timeLeft || '读取中'}</p>
              <p>灵石余额：{currency.data?.spiritStones ?? '读取中'}</p>
            </div>
          </GameSceneAsideSection>
        </>
      }
    >
      {loading ? (
        <GameLoadingState message="正在寻找暗巷入口……" variant="inline" />
      ) : overview ? (
        <BlackMarketRoom
          overview={overview}
          selectedNpcId={session?.npcId}
          busy={busy}
          detail={detail}
          onSelect={(npcId) => void handleSelect(npcId)}
        />
      ) : (
        <InkNotice>{error || '黑市暂未开门。'}</InkNotice>
      )}
    </GameSceneFrame>
  );
}

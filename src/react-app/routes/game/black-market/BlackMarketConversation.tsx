import { NpcConversation } from '@app/components/feature/room';
import {
  InkButton,
  InkDialog,
  type InkDialogState,
  InkNotice,
} from '@app/components/ui';
import { normalizeBlackMarketPlayerBody } from '@shared/lib/blackMarketMessages';
import { getGameConceptInfo } from '@shared/lib/gameConceptDisplay';
import type {
  BlackMarketNegotiationMood,
  BlackMarketNpcSummary,
  BlackMarketSessionView,
} from '@shared/types/blackMarket';
import { useState } from 'react';

const SPIRIT_STONES = getGameConceptInfo('spirit_stones');

const quickMessages = [
  '仔细观察货物外观',
  '凝神感知货物灵气',
  '检查货物破损痕迹',
  '再凑近看看这物件的细节',
  '问问这货的来历',
  '问问他为何急着出手',
];

const moodCopy: Record<BlackMarketNegotiationMood, string> = {
  calm: '神色从容',
  guarded: '开始掂量你的来意',
  impatient: '已经有些不耐烦',
  agreed: '已经点头认价',
  closed: '已经把价咬死',
};

export function BlackMarketConversation({
  npc,
  session,
  busy,
  error,
  notice,
  onSubmit,
  onCommit,
  onLeave,
}: {
  npc: BlackMarketNpcSummary;
  session: BlackMarketSessionView;
  busy: boolean;
  error?: string;
  notice?: string;
  onSubmit(message: string | undefined, offeredPrice?: number): void;
  onCommit(): Promise<void>;
  onLeave(): void;
}) {
  const [message, setMessage] = useState('');
  const [offeredPrice, setOfferedPrice] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<InkDialogState | null>(
    null,
  );
  const inspectExhausted = !session.canInspect;
  const dealReady = session.phase === 'deal_ready';
  const actionDisabled = busy || dealReady;

  const messages = session.messages.map((message) => ({
    id: message.id,
    speaker: message.role === 'npc' ? npc.name : undefined,
    body:
      message.role === 'player'
        ? `你：${normalizeBlackMarketPlayerBody(message.body)}`
        : message.body,
    tone:
      message.role === 'player'
        ? ('muted' as const)
        : message.role === 'system'
          ? ('attention' as const)
          : ('normal' as const),
  }));

  const confirmPurchase = () => {
    setConfirmDialog({
      id: `black-market-buy-${session.id}-${session.version}`,
      title: dealReady ? '就按这个价' : '暗巷成交',
      content: (
        <div className="space-y-3 text-sm leading-7">
          <p>
            以当前报价买下「{session.listing.disguisedName}
            」？成交后将当场揭晓真品。
          </p>
          <p className="text-gold font-semibold">
            将消耗：{SPIRIT_STONES.icon} {session.currentPrice.toLocaleString()}{' '}
            {SPIRIT_STONES.label}
          </p>
          <p className="text-ink-secondary">暗巷交易落子无悔。</p>
        </div>
      ),
      confirmLabel: dealReady ? '一手交钱，一手交货' : '成交揭晓',
      cancelLabel: '再想想',
      onConfirm: async () => {
        await onCommit();
      },
    });
  };

  const submitTurn = () => {
    const text = message.trim();
    const price = Number(offeredPrice);
    if (!text && (!offeredPrice || !Number.isSafeInteger(price))) return;
    onSubmit(
      text || undefined,
      offeredPrice ? price : undefined,
    );
    setMessage('');
    setOfferedPrice('');
  };

  return (
    <>
      <NpcConversation
        actor={npc}
        messages={messages}
        busy={busy}
        error={error}
      >
        <div className="space-y-5">
          <div className="border-ink/15 flex flex-wrap items-center justify-between gap-3 border-y py-3 text-sm">
            <span>{session.listing.disguisedName}</span>
            <strong className="text-gold">
              当前报价：{session.currentPrice.toLocaleString()} 灵石
            </strong>
            <span className="text-ink-secondary">
              摊主：{moodCopy[session.negotiationMood]}
            </span>
          </div>

          <p className="text-ink-secondary text-sm leading-7">
            {session.listing.description}
          </p>
          {notice ? <InkNotice>{notice}</InkNotice> : null}

          {dealReady ? (
            <InkNotice>
              摊主已经点头认下这个价。此刻再压价只会坏了规矩。
            </InkNotice>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {quickMessages.map((quick) => (
                  <InkButton
                    key={quick}
                    onClick={() => onSubmit(quick)}
                    disabled={actionDisabled || inspectExhausted}
                    variant="secondary"
                  >
                    {quick}
                  </InkButton>
                ))}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitTurn();
                }}
                className="border-ink/20 bg-paper/40 focus-within:border-crimson/45 border"
              >
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={240}
                  disabled={busy}
                  rows={2}
                  className="w-full resize-none bg-transparent px-3 py-3 outline-none"
                  placeholder="跟他说点什么……"
                  aria-label="跟摊主说点什么"
                />
                <div className="border-ink/15 flex flex-wrap items-center gap-2 border-t px-3 py-2">
                  <span className="text-ink-secondary text-sm">我的出价</span>
                  <input
                    type="number"
                    min={1}
                    max={2_000_000_000}
                    value={offeredPrice}
                    onChange={(event) => setOfferedPrice(event.target.value)}
                    disabled={busy || !session.canHaggle}
                    className="text-ink min-w-28 flex-1 bg-transparent px-2 py-1 text-right outline-none"
                    placeholder="可选"
                    aria-label="我的灵石出价"
                  />
                  <span className="text-ink-secondary text-sm">灵石</span>
                  <InkButton
                    type="submit"
                    disabled={actionDisabled || (!message.trim() && !offeredPrice)}
                    variant="primary"
                  >
                    开口
                  </InkButton>
                </div>
              </form>
            </>
          )}

          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <InkButton onClick={onLeave} disabled={busy} variant="secondary">
              先离开摊位
            </InkButton>
            <InkButton
              onClick={confirmPurchase}
              disabled={busy}
              variant="primary"
            >
              {dealReady ? '一手交钱，一手交货' : '按当前价格拿下'}
            </InkButton>
          </div>
        </div>
      </NpcConversation>
      <InkDialog
        dialog={confirmDialog}
        onClose={() => setConfirmDialog(null)}
      />
    </>
  );
}

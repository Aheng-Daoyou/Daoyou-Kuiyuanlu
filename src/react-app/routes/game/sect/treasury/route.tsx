import {
  NpcConversation,
  useConversationSession,
  type NpcConversationMessage,
  type NpcConversationOption,
} from '@app/components/feature/room';
import {
  useSectCurrentQuery,
  useSectResourceQuery,
} from '@app/components/feature/sect/SectQueryProvider';
import {
  SectNpcConversationRegistry,
  SectRoutedRoom,
  type SectNpcConversationRendererProps,
} from '@app/components/feature/sect/room';
import { usePlayerStateActions } from '@app/lib/player-state/store';
import { fetchSectShop } from '@app/lib/sect/sectClient';
import type { SectShopItemData } from '@shared/contracts/sect';
import {
  SECT_RANK_LABELS,
  STANDARD_SECT_PRESENTATION,
} from '@shared/engine/sect';
import { useState } from 'react';
import {
  postJson,
  SectPermissionBoundary,
  SectScene,
} from '../components/SectScene';

const registry = new SectNpcConversationRegistry([
  { key: 'sect.treasury.shop', renderer: TreasuryConversation },
]).assertRoom(STANDARD_SECT_PRESENTATION.rooms.treasury);

export default function SectTreasuryPage() {
  return (
    <SectPermissionBoundary permission="sect.shop.use" sceneKey="treasury">
      <SectScene sceneKey="treasury" mood="treasury">
        <SectRoutedRoom
          roomKey="treasury"
          registry={registry}
          eyebrow="贡献支取 · 库藏封签"
        />
      </SectScene>
    </SectPermissionBoundary>
  );
}

type TreasuryIntent = { type: 'purchase'; itemId: string };
const TREASURY_PAGE_SIZE = 6;

function TreasuryConversation({
  actor,
  onExit,
}: SectNpcConversationRendererProps) {
  const shop = useSectResourceQuery('shop', fetchSectShop);
  const current = useSectCurrentQuery();
  const { mutate } = usePlayerStateActions();
  const [selectedId, setSelectedId] = useState<string>();
  const [page, setPage] = useState(0);
  const session = useConversationSession({
    sessionKey: actor.id,
    snapshot: shop.data,
    load: async () => {
      await Promise.all([shop.reload(), current.reload()]);
    },
    perform: async ({ intent }: { intent: TreasuryIntent }) => {
      const selected = shop.data?.items.find(
        (item) => item.id === intent.itemId,
      );
      if (!selected) throw new Error('这件物资已经不在当前库单中。');
      await mutate(
        fetch(
          '/api/sects/current/shop/purchase',
          postJson({ itemId: selected.id, quantity: 1 }),
        ),
      );
      await Promise.all([shop.reload(), current.reload()]);
      return selected;
    },
    onReset: () => {
      setSelectedId(undefined);
      setPage(0);
    },
  });
  const selected = shop.data?.items.find((item) => item.id === selectedId);
  const items = shop.data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil(items.length / TREASURY_PAGE_SIZE));
  const visibleItems = items.slice(
    page * TREASURY_PAGE_SIZE,
    (page + 1) * TREASURY_PAGE_SIZE,
  );
  const messages = treasuryMessages(actor.name, actor.greeting, selected, {
    contribution: shop.data?.contribution,
    purchased: session.result,
  });
  const options: NpcConversationOption[] = selected
    ? [
        ...([
          {
            id: 'confirm',
            label: `就兑换一份${selected.name}`,
            tone: 'primary',
            disabled:
              selected.stock - selected.purchased <= 0 ||
              (shop.data?.contribution ?? 0) < selected.price,
          },
          { id: 'back', label: '我再看看别的' },
          { id: 'leave', label: '弟子告退', tone: 'muted' },
        ] satisfies NpcConversationOption[]),
      ]
    : [
        ...visibleItems.map((item) => ({
          id: `item:${item.id}`,
          label: item.rotating
            ? `请取本周轮换的${item.name}给我看看`
            : `请取${item.name}给我看看`,
          tone:
            item.stock - item.purchased <= 0
              ? ('muted' as const)
              : ('normal' as const),
          disabled: item.stock - item.purchased <= 0,
        })),
        ...(page > 0
          ? [{ id: 'previous-page', label: '请再翻回前一页库单' }]
          : []),
        ...(page + 1 < pageCount
          ? [{ id: 'next-page', label: '请再翻一页库单' }]
          : []),
        { id: 'leave', label: '弟子告退', tone: 'muted' },
      ];

  return (
    <NpcConversation
      actor={actor}
      messages={messages}
      options={options}
      busy={session.phase === 'loading' || session.phase === 'submitting'}
      error={session.error ?? shop.error ?? current.error}
      onSelectOption={(optionId) => {
        if (optionId === 'leave') onExit();
        else if (optionId === 'back') {
          session.clearResult();
          setSelectedId(undefined);
        } else if (optionId === 'confirm' && selected)
          void session.dispatch({ type: 'purchase', itemId: selected.id });
        else if (optionId === 'previous-page')
          setPage((currentPage) => Math.max(0, currentPage - 1));
        else if (optionId === 'next-page')
          setPage((currentPage) => Math.min(pageCount - 1, currentPage + 1));
        else if (optionId.startsWith('item:')) {
          session.clearResult();
          setSelectedId(optionId.slice(5));
        }
      }}
    />
  );
}

function treasuryMessages(
  actorName: string,
  greeting: string,
  selected: SectShopItemData | undefined,
  state: { contribution?: number; purchased?: SectShopItemData },
): NpcConversationMessage[] {
  const messages: NpcConversationMessage[] = [
    { id: 'greeting', speaker: actorName, body: greeting },
  ];
  if (state.purchased)
    messages.push({
      id: 'purchased',
      speaker: actorName,
      body: `「${state.purchased.name}」已经交到你手中，实际扣除${state.purchased.price}点贡献。`,
      tone: 'attention',
    });
  if (selected) {
    const remaining = selected.stock - selected.purchased;
    messages.push({
      id: 'quote',
      speaker: actorName,
      body: (
        <>
          {selected.description}。此物需要
          <span className="text-crimson font-medium">
            {selected.price}点贡献
          </span>
          ，限
          <span className="text-crimson font-medium">
            {SECT_RANK_LABELS[selected.requiredRank]}
          </span>
          支取，库中还剩{remaining}份。你现有
          {state.contribution?.toLocaleString('zh-CN') ?? 0}点贡献。
        </>
      ),
    });
  }
  return messages;
}

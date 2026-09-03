import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { InkInput } from '@app/components/ui/InkInput';
import type {
  GmGrantResponse,
  GmPlayerSummary,
} from '@shared/contracts/gmTools';
import { useCallback, useEffect, useRef, useState } from 'react';

/** GM 工具：按角色名实时模糊搜索并直接发放灯油券/声望/灯韵/寿元/窥悟/道具（测试与补偿用） */
export default function GmToolsPage() {
  const { pushToast } = useInkUI();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [players, setPlayers] = useState<GmPlayerSummary[]>([]);
  const [selected, setSelected] = useState<GmPlayerSummary | null>(null);
  const [spiritStones, setSpiritStones] = useState('');
  const [reputation, setReputation] = useState('');
  const [cultivationExp, setCultivationExp] = useState('');
  const [lifespan, setLifespan] = useState('');
  const [comprehensionInsight, setComprehensionInsight] = useState('');
  const [itemIds, setItemIds] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [note, setNote] = useState('');
  const [granting, setGranting] = useState(false);
  const [lastResult, setLastResult] = useState<GmGrantResponse | null>(null);
  const searchSeq = useRef(0);

  const search = useCallback(
    async (keyword: string) => {
      const trimmed = keyword.trim();
      if (!trimmed) {
        setPlayers([]);
        return;
      }
      const seq = ++searchSeq.current;
      setSearching(true);
      try {
        const response = await fetch(
          `/api/admin/gm/players?query=${encodeURIComponent(trimmed)}`,
        );
        const data = (await response.json()) as {
          players?: GmPlayerSummary[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? '搜索失败');
        if (seq === searchSeq.current) {
          setPlayers(data.players ?? []);
          setSelected((current) =>
            current && data.players?.some((p) => p.id === current.id)
              ? current
              : null,
          );
        }
      } catch {
        // 实时输入过程中静默失败，避免每个按键都弹提示
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    },
    [],
  );

  // 输入即搜：300ms 防抖实时检索，名字包含关键字即可命中
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setPlayers([]);
      setSelected(null);
      return;
    }
    const timer = window.setTimeout(() => void search(trimmed), 300);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const grant = async () => {
    if (!selected) return;
    const items = itemIds
      .split(/[\n,，;；\s]+/)
      .map((id) => id.trim())
      .filter(Boolean)
      .map((itemId) => ({
        itemId,
        quantity: Math.max(1, Math.floor(Number(itemQuantity) || 1)),
      }));
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.itemId)) {
        pushToast({ message: `道具 ID 重复：${item.itemId}`, tone: 'warning' });
        return;
      }
      seen.add(item.itemId);
    }
    if (items.length > 5) {
      pushToast({ message: '单次最多发放 5 种道具', tone: 'warning' });
      return;
    }
    const payload = {
      cultivatorId: selected.id,
      spiritStones: Number(spiritStones) || undefined,
      reputation: Number(reputation) || undefined,
      cultivationExp: Number(cultivationExp) || undefined,
      lifespan: Number(lifespan) || undefined,
      comprehensionInsight: Number(comprehensionInsight) || undefined,
      items: items.length ? items : undefined,
      note: note.trim() || undefined,
    };
    if (
      !payload.spiritStones &&
      !payload.reputation &&
      !payload.cultivationExp &&
      !payload.lifespan &&
      !payload.comprehensionInsight &&
      !payload.items
    ) {
      pushToast({ message: '至少填写一项发放内容', tone: 'warning' });
      return;
    }

    setGranting(true);
    try {
      const response = await fetch('/api/admin/gm/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as GmGrantResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? '发放失败');
      setLastResult(data);
      pushToast({
        message: `已向「${data.name}」发放资源`,
        tone: 'success',
      });
      setSpiritStones('');
      setReputation('');
      setCultivationExp('');
      setLifespan('');
      setComprehensionInsight('');
      setItemIds('');
      setItemQuantity('');
      setNote('');
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '发放失败',
        tone: 'danger',
      });
    } finally {
      setGranting(false);
    }
  };

  const numberInput = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    hint: string,
  ) => (
    <InkInput
      label={label}
      value={value}
      onChange={onChange}
      placeholder="0"
      hint={hint}
      disabled={!selected || granting}
    />
  );

  return (
    <div className="space-y-6">
      <header className="border-ink/15 bg-bgpaper/90 border border-dashed p-6">
        <p className="text-ink-secondary text-xs tracking-[0.22em]">GM TOOLS</p>
        <h2 className="font-heading text-ink mt-2 text-3xl">GM 工具</h2>
          <p className="text-ink-secondary mt-3 max-w-2xl text-sm leading-7">
            输入角色名关键字即时模糊检索（如输入「测试」即可命中所有含测试的名字），
            点选角色后直接发放灯油券 / 声望 / 灯韵 / 寿元 / 窥悟 / 道具库物品。
            发放即时到账，玩家客户端实时刷新；大额发放由服务端自动拆批结算。
          </p>
      </header>

      <section className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-6">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <InkInput
              label="角色名搜索（输入即搜）"
              value={query}
              onChange={setQuery}
              placeholder="输入关键字，如：测试"
              disabled={searching}
            />
          </div>
          <InkButton
            type="button"
            variant="primary"
            disabled={searching || !query.trim()}
            onClick={() => void search(query)}
          >
            {searching ? '搜索中…' : '刷新'}
          </InkButton>
        </div>

        {players.length > 0 && (
          <div className="border-ink/15 divide-ink/10 divide-y border">
            {players.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => setSelected(player)}
                className={`hover:bg-crimson/5 flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                  selected?.id === player.id ? 'border-crimson bg-crimson/10' : ''
                }`}
              >
                <span className="text-ink font-bold">
                  {player.name}
                  <span className="text-ink-secondary ml-2 font-normal">
                    {player.realm}·{player.realmStage}
                  </span>
                </span>
                <span className="text-ink-secondary text-xs">
                  灯油券 {player.spiritStones.toLocaleString()} · 声望{' '}
                  {player.reputation.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        )}
        {players.length === 0 && !searching && query.trim() ? (
          <p className="text-ink-secondary text-sm">没有匹配的角色。</p>
        ) : null}
      </section>

      {selected && (
        <section className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-6">
          <h3 className="text-ink text-lg font-bold">
            向「{selected.name}」发放
            <span className="text-ink-secondary ml-2 text-sm font-normal">
              {selected.realm}·{selected.realmStage}
            </span>
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {numberInput('灯油券', spiritStones, setSpiritStones, '通用货币，单次最高 10 亿')}
            {numberInput('声望', reputation, setReputation, '天骄宝阁兑换用，上限 100 万')}
            {numberInput('灯韵', cultivationExp, setCultivationExp, '修为进度，单次最高 10 亿')}
            {numberInput('寿元（年）', lifespan, setLifespan, '续命用，上限 1000 万年')}
            {numberInput('窥悟值', comprehensionInsight, setComprehensionInsight, '悟性进度 0~100，超出自动封顶')}
          </div>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <InkInput
              label="道具发放（可选）"
              value={itemIds}
              onChange={setItemIds}
              placeholder="粘贴道具库 itemId，多个用逗号或换行分隔（最多 5 个）"
              hint="ID 可在「道具库 → 目录」中点击复制"
              disabled={!selected || granting}
            />
            <InkInput
              label="道具数量"
              value={itemQuantity}
              onChange={setItemQuantity}
              placeholder="1"
              hint="每种道具的数量，默认 1"
              disabled={!selected || granting}
            />
          </div>
          <InkInput
            label="备注（可选）"
            value={note}
            onChange={setNote}
            placeholder="发放原因，如：测试补偿"
            disabled={granting}
          />
          <div className="flex flex-wrap gap-3">
            <InkButton
              type="button"
              variant="primary"
              disabled={granting}
              onClick={() => void grant()}
            >
              {granting ? '发放中…' : '确认发放'}
            </InkButton>
            <InkButton
              type="button"
              variant="secondary"
              disabled={granting}
              onClick={() => setSelected(null)}
            >
              取消
            </InkButton>
          </div>
          {lastResult && (
            <div className="border-ink/20 bg-paper p-4 text-sm">
              <p className="text-ink-secondary text-xs tracking-[0.16em]">
                最近一次发放
              </p>
              <p className="text-ink mt-2">
                {lastResult.name}：+{(lastResult.granted.spiritStones ?? 0).toLocaleString()}{' '}
                灯油券，+{(lastResult.granted.reputation ?? 0).toLocaleString()} 声望，+
                {(lastResult.granted.cultivationExp ?? 0).toLocaleString()} 灯韵
                {lastResult.granted.lifespan
                  ? `，+${lastResult.granted.lifespan.toLocaleString()} 寿元`
                  : ''}
                {lastResult.granted.comprehensionInsight
                  ? `，+${lastResult.granted.comprehensionInsight} 窥悟`
                  : ''}
                {lastResult.granted.items?.length
                  ? `，道具：${lastResult.granted.items
                      .map((item) => `${item.name}×${item.quantity}`)
                      .join('、')}`
                  : ''}
              </p>
              <p className="text-ink-secondary mt-1 text-xs">
                当前余额：灯油券 {lastResult.balances.spiritStones.toLocaleString()} · 声望{' '}
                {lastResult.balances.reputation.toLocaleString()}
                {lastResult.balances.lifespan !== undefined
                  ? ` · 寿元 ${lastResult.balances.lifespan.toLocaleString()}`
                  : ''}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

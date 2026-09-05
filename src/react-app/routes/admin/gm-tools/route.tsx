import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { InkInput } from '@app/components/ui/InkInput';
import type {
  GmGrantResponse,
  GmPlayerSummary,
  GmSetAttributesResponse,
} from '@shared/contracts/gmTools';
import { ATTRIBUTE_DISPLAY_MAP } from '@shared/lib/gameConceptDisplay';
import type { Attributes } from '@shared/types/cultivator';
import { useCallback, useEffect, useRef, useState } from 'react';

/** GM 工具：按角色名实时模糊搜索并直接发放灯油券/声望/灯韵/寿元/窥悟/灯油/宗门贡献/道具（测试与补偿用） */
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
  const [qi, setQi] = useState('');
  const [sectContribution, setSectContribution] = useState('');
  const [itemIds, setItemIds] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [note, setNote] = useState('');
  const [granting, setGranting] = useState(false);
  const [lastResult, setLastResult] = useState<GmGrantResponse | null>(null);
  const searchSeq = useRef(0);

  // —— 根基六维覆盖编辑状态（以字符串承载，选中角色后预填当前值）——
  const SIX_ATTR_KEYS: (keyof Attributes)[] = [
    'vitality',
    'strength',
    'spirit',
    'endurance',
    'speed',
    'willpower',
  ];
  const [attrFields, setAttrFields] = useState<Record<keyof Attributes, string>>({
    vitality: '',
    strength: '',
    spirit: '',
    endurance: '',
    speed: '',
    willpower: '',
  });
  const [unallocatedPoints, setUnallocatedPoints] = useState('');
  const [savingAttributes, setSavingAttributes] = useState(false);
  const [lastAttrResult, setLastAttrResult] =
    useState<GmSetAttributesResponse | null>(null);

  // 选中角色变化时，预填六维当前值（来自搜索返回的当前值）
  useEffect(() => {
    if (!selected) return;
    setAttrFields({
      vitality: String(selected.vitality ?? 0),
      strength: String(selected.strength ?? 0),
      spirit: String(selected.spirit ?? 0),
      endurance: String(selected.endurance ?? 0),
      speed: String(selected.speed ?? 0),
      willpower: String(selected.willpower ?? 0),
    });
    setUnallocatedPoints(String(selected.unallocatedAttributePoints ?? 0));
    setLastAttrResult(null);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps


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
      qi: Number(qi) || undefined,
      sectContribution:
        sectContribution.trim() && Number(sectContribution) !== 0
          ? Math.trunc(Number(sectContribution))
          : undefined,
      items: items.length ? items : undefined,
      note: note.trim() || undefined,
    };
    if (
      !payload.spiritStones &&
      !payload.reputation &&
      !payload.cultivationExp &&
      !payload.lifespan &&
      !payload.comprehensionInsight &&
      !payload.qi &&
      !payload.sectContribution &&
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
      setQi('');
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

  const setAttributes = async () => {
    if (!selected) return;
    const parseToInt = (value: string): number | undefined => {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const n = Math.floor(Number(trimmed));
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    // 空字段 = 不修改该项；显式填 0 会被提交（GM 覆盖语义允许设到 0）
    const body: Record<string, unknown> = { cultivatorId: selected.id };
    const sixValues: Record<keyof Attributes, number | undefined> = {
      vitality: parseToInt(attrFields.vitality),
      strength: parseToInt(attrFields.strength),
      spirit: parseToInt(attrFields.spirit),
      endurance: parseToInt(attrFields.endurance),
      speed: parseToInt(attrFields.speed),
      willpower: parseToInt(attrFields.willpower),
    };
    for (const key of SIX_ATTR_KEYS) {
      if (sixValues[key] !== undefined) body[key] = sixValues[key];
    }
    const unalloc = parseToInt(unallocatedPoints);
    if (unalloc !== undefined) body.unallocatedAttributePoints = unalloc;
    if (Object.keys(body).length === 1) {
      pushToast({ message: '至少填写一项要修改的六维或未分配点', tone: 'warning' });
      return;
    }

    setSavingAttributes(true);
    try {
      const response = await fetch('/api/admin/gm/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as GmSetAttributesResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? '修改六维失败');
      setLastAttrResult(data);
      // 同步 selected 与回填字段，使「恢复当前值」/后续修改以最新服务端值为准
      setSelected((current) =>
        current
          ? {
              ...current,
              vitality: data.after.vitality,
              strength: data.after.strength,
              spirit: data.after.spirit,
              endurance: data.after.endurance,
              speed: data.after.speed,
              willpower: data.after.willpower,
              unallocatedAttributePoints: data.after.unallocatedAttributePoints,
            }
          : current,
      );
      // 回填最新服务端值，便于连续编辑
      setAttrFields({
        vitality: String(data.after.vitality),
        strength: String(data.after.strength),
        spirit: String(data.after.spirit),
        endurance: String(data.after.endurance),
        speed: String(data.after.speed),
        willpower: String(data.after.willpower),
      });
      setUnallocatedPoints(String(data.after.unallocatedAttributePoints));
      pushToast({
        message: `已将「${data.name}」根基六维调整为灯红${data.after.vitality}/灯锋${data.after.strength}/梦涎${data.after.spirit}/灯骨${data.after.endurance}/灯影${data.after.speed}/灯芯${data.after.willpower}`,
        tone: 'success',
      });
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '修改六维失败',
        tone: 'danger',
      });
    } finally {
      setSavingAttributes(false);
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
            点选角色后直接发放灯油券 / 声望 / 灯韵 / 寿元 / 窥悟 / 灯油 / 宗门贡献 / 道具库物品。
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
            {numberInput('灯油', qi, setQi, '行动体力，最高补到 300，超出自动封顶')}
            <InkInput
              label="宗门贡献（可选）"
              value={sectContribution}
              onChange={setSectContribution}
              placeholder="如 500 或 -200"
              hint="正数发放（终身贡献同加），负数扣减当期（最低到 0）；须已加入宗门"
              disabled={!selected || granting}
            />
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
                {lastResult.granted.qi
                  ? `，灯油 ${lastResult.granted.qi.before} → ${lastResult.granted.qi.after}（实际 +${lastResult.granted.qi.restored}）`
                  : ''}
                {lastResult.granted.sectContribution
                  ? `，宗门贡献 ${lastResult.granted.sectContribution.before.toLocaleString()} → ${lastResult.granted.sectContribution.after.toLocaleString()}`
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

      {selected && (
        <section className="border-crimson/25 bg-bgpaper/90 space-y-4 border border-dashed p-6">
          <h3 className="text-ink text-lg font-bold">
            根基六维修改
            <span className="text-ink-secondary ml-2 text-sm font-normal">
              覆盖式设定绝对值，不受境界自然值下限 / 属性预算约束
            </span>
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {SIX_ATTR_KEYS.map((key) => {
              const info = ATTRIBUTE_DISPLAY_MAP[key];
              return (
                <InkInput
                  key={key}
                  label={`${info.label}（${key}）`}
                  value={attrFields[key]}
                  onChange={(next) =>
                    setAttrFields((current) => ({ ...current, [key]: next }))
                  }
                  placeholder="留空则不修改"
                  hint={info.description}
                  disabled={!selected || savingAttributes}
                />
              );
            })}
            <InkInput
              label="未分配属性点（可选）"
              value={unallocatedPoints}
              onChange={setUnallocatedPoints}
              placeholder="留空则不修改"
              hint="角色当前可自由分配的点数；填 0 可清空"
              disabled={!selected || savingAttributes}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <InkButton
              type="button"
              variant="primary"
              disabled={savingAttributes}
              onClick={() => void setAttributes()}
            >
              {savingAttributes ? '修改中…' : '确认修改六维'}
            </InkButton>
            <InkButton
              type="button"
              variant="secondary"
              disabled={savingAttributes}
              onClick={() => {
                if (!selected) return;
                setAttrFields({
                  vitality: String(selected.vitality ?? 0),
                  strength: String(selected.strength ?? 0),
                  spirit: String(selected.spirit ?? 0),
                  endurance: String(selected.endurance ?? 0),
                  speed: String(selected.speed ?? 0),
                  willpower: String(selected.willpower ?? 0),
                });
                setUnallocatedPoints(String(selected.unallocatedAttributePoints ?? 0));
              }}
            >
              恢复当前值
            </InkButton>
          </div>
          {lastAttrResult && (
            <div className="border-ink/20 bg-paper p-4 text-sm">
              <p className="text-ink-secondary text-xs tracking-[0.16em]">
                最近一次六维修改
              </p>
              <p className="text-ink mt-2">
                {lastAttrResult.name}（{lastAttrResult.realm}·{lastAttrResult.realmStage}）：
                灯红 {lastAttrResult.before.vitality} → {lastAttrResult.after.vitality} ·
                灯锋 {lastAttrResult.before.strength} → {lastAttrResult.after.strength} ·
                梦涎 {lastAttrResult.before.spirit} → {lastAttrResult.after.spirit} ·
                灯骨 {lastAttrResult.before.endurance} → {lastAttrResult.after.endurance} ·
                灯影 {lastAttrResult.before.speed} → {lastAttrResult.after.speed} ·
                灯芯 {lastAttrResult.before.willpower} → {lastAttrResult.after.willpower}
              </p>
              <p className="text-ink-secondary mt-1 text-xs">
                未分配点 {lastAttrResult.before.unallocatedAttributePoints} →{' '}
                {lastAttrResult.after.unallocatedAttributePoints}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

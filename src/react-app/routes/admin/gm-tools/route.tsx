import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { InkInput } from '@app/components/ui/InkInput';
import type {
  GmGrantResponse,
  GmPlayerSummary,
} from '@shared/contracts/gmTools';
import { useCallback, useRef, useState } from 'react';

/** GM 工具：按角色名搜索并直接发放灯油券/声望/灯韵（测试与补偿用） */
export default function GmToolsPage() {
  const { pushToast } = useInkUI();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [players, setPlayers] = useState<GmPlayerSummary[]>([]);
  const [selected, setSelected] = useState<GmPlayerSummary | null>(null);
  const [spiritStones, setSpiritStones] = useState('');
  const [reputation, setReputation] = useState('');
  const [cultivationExp, setCultivationExp] = useState('');
  const [note, setNote] = useState('');
  const [granting, setGranting] = useState(false);
  const [lastResult, setLastResult] = useState<GmGrantResponse | null>(null);
  const searchSeq = useRef(0);

  const search = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      pushToast({ message: '请输入角色名关键字', tone: 'warning' });
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
        setSelected(null);
      }
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '搜索失败',
        tone: 'danger',
      });
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, [pushToast, query]);

  const grant = async () => {
    if (!selected) return;
    const payload = {
      cultivatorId: selected.id,
      spiritStones: Number(spiritStones) || undefined,
      reputation: Number(reputation) || undefined,
      cultivationExp: Number(cultivationExp) || undefined,
      note: note.trim() || undefined,
    };
    if (!payload.spiritStones && !payload.reputation && !payload.cultivationExp) {
      pushToast({ message: '至少填写一项发放数额', tone: 'warning' });
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
          按角色名搜索在线角色，直接发放灯油券 / 声望 / 灯韵，用于测试与客诉补偿。
          发放即时到账并记录操作日志；物品类发放请使用「游戏邮件」广播页。
        </p>
      </header>

      <section className="border-ink/15 bg-bgpaper/90 space-y-4 border border-dashed p-6">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <InkInput
              label="角色名搜索"
              value={query}
              onChange={setQuery}
              placeholder="输入角色名关键字，如：测试守灯人"
              disabled={searching}
            />
          </div>
          <InkButton
            type="button"
            variant="primary"
            disabled={searching}
            onClick={() => void search()}
          >
            {searching ? '搜索中…' : '搜索'}
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
            {numberInput('灯油券', spiritStones, setSpiritStones, '通用货币')}
            {numberInput('声望', reputation, setReputation, '天骄宝阁兑换用')}
            {numberInput('灯韵', cultivationExp, setCultivationExp, '修为进度')}
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
              </p>
              <p className="text-ink-secondary mt-1 text-xs">
                当前余额：灯油券 {lastResult.balances.spiritStones.toLocaleString()} · 声望{' '}
                {lastResult.balances.reputation.toLocaleString()}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

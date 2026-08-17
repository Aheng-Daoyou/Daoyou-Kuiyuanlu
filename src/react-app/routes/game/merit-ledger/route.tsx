import {
  GameSceneAsideSection,
  GameSceneFrame,
} from '@app/components/game-shell';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import { InkButton } from '@app/components/ui/InkButton';
import { InkInput } from '@app/components/ui/InkInput';
import { usePlayerMailSummary } from '@app/lib/resources/player';
import {
  SPONSORSHIP_TIER_IDS,
  SPONSORSHIP_TIER_META,
  type SponsorshipTierId,
} from '@shared/lib/sponsorship';
import { useCallback, useEffect, useRef, useState } from 'react';

type Tab = 'mine' | 'world' | 'support';
type ClientConfig = {
  enabled: boolean;
  fulfillmentEnabled: boolean;
  tiers: Record<
    SponsorshipTierId,
    {
      name: string;
      theme: string;
      configured: boolean;
      minimumAmountFen: number;
    }
  >;
};
type MeritState = {
  profile: {
    isPublic: boolean;
    highestTier: SponsorshipTierId;
    firstSupportedAt: string;
  } | null;
  records: { id: string; tier: SponsorshipTierId; supportedAt: string }[];
};
type PublicRow = {
  cultivatorId: string;
  name: string;
  title: string | null;
  realm: string;
  realmStage: string;
  highestTier: SponsorshipTierId;
  firstSupportedMonth: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? '请求失败');
  return data as T;
}

export default function MeritLedgerPage() {
  const { pushToast } = useInkUI();
  const mailSummary = usePlayerMailSummary();
  const [tab, setTab] = useState<Tab>('mine');
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [mine, setMine] = useState<MeritState | null>(null);
  const [world, setWorld] = useState<PublicRow[]>([]);
  const [worldPage, setWorldPage] = useState(1);
  const [worldTotal, setWorldTotal] = useState(0);
  const [publicListing, setPublicListing] = useState(true);
  const [claimCode, setClaimCode] = useState('');
  const [pendingCheckoutUrl, setPendingCheckoutUrl] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const pollingGeneration = useRef(0);

  const load = useCallback(async () => {
    const [nextConfig, nextMine, publicList] = await Promise.all([
      readJson<ClientConfig>(await fetch('/api/sponsorship/config')),
      readJson<MeritState>(await fetch('/api/sponsorship/me')),
      readJson<{ items: PublicRow[]; total: number }>(
        await fetch('/api/sponsorship/public?page=1&pageSize=50'),
      ),
    ]);
    setConfig(nextConfig);
    setMine(nextMine);
    setWorld(publicList.items);
    setWorldPage(1);
    setWorldTotal(publicList.total);
    setPublicListing(nextMine.profile?.isPublic ?? true);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (error) {
        pushToast({
          message: error instanceof Error ? error.message : '功德簿加载失败',
          tone: 'danger',
        });
      }
    })();
  }, [load, pushToast]);

  useEffect(
    () => () => {
      pollingGeneration.current += 1;
    },
    [],
  );

  const loadWorldPage = async (page: number) => {
    const result = await readJson<{ items: PublicRow[]; total: number }>(
      await fetch(`/api/sponsorship/public?page=${page}&pageSize=50`),
    );
    setWorld(result.items);
    setWorldPage(page);
    setWorldTotal(result.total);
  };

  const updateVisibility = async (checked: boolean) => {
    setPublicListing(checked);
    if (!mine?.profile) return;
    try {
      await readJson(
        await fetch('/api/sponsorship/me/visibility', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ isPublic: checked }),
        }),
      );
      await load();
    } catch (error) {
      setPublicListing(!checked);
      pushToast({
        message: error instanceof Error ? error.message : '公开设置更新失败',
        tone: 'danger',
      });
    }
  };

  const claim = async () => {
    if (!claimCode.trim()) return;
    setBusy(true);
    try {
      await readJson(
        await fetch('/api/sponsorship/claims', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: claimCode.trim(), publicListing }),
        }),
      );
      setClaimCode('');
      await load();
      await mailSummary.reload();
      setTab('mine');
      pushToast({ message: '功德已归入当前角色，感谢同行', tone: 'success' });
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '认领失败',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const checkout = async (tier: SponsorshipTierId) => {
    const generation = ++pollingGeneration.current;
    setBusy(true);
    try {
      const intent = await readJson<{ id: string; checkoutUrl: string }>(
        await fetch('/api/sponsorship/checkout-intents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tier, publicListing }),
        }),
      );
      setPendingCheckoutUrl(intent.checkoutUrl);
      window.open(intent.checkoutUrl, '_blank', 'noopener,noreferrer');
      pushToast({
        message: '已发起爱发电支付；若窗口未打开，请点击页面中的备用链接',
        tone: 'success',
      });
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3_000));
        if (pollingGeneration.current !== generation) return;
        const status = await readJson<{ status: string }>(
          await fetch(`/api/sponsorship/checkout-intents/${intent.id}`),
        );
        if (status.status === 'fulfilled') {
          await load();
          await mailSummary.reload();
          setTab('mine');
          pushToast({
            message: '功德已记，谢信已送至传音玉简',
            tone: 'success',
          });
          return;
        }
      }
      pushToast({
        message: '暂未收到支付结果；订单仍会由后台继续核对，无需重复支付',
        tone: 'warning',
      });
    } catch (error) {
      pushToast({
        message: error instanceof Error ? error.message : '发起支持失败',
        tone: 'danger',
      });
    } finally {
      if (pollingGeneration.current === generation) setBusy(false);
    }
  };

  return (
    <GameSceneFrame
      variant="lite"
      title="功德簿"
      description="不记灵石多寡，只录同行之缘。每笔支持留下一页功德与一封无附件谢信。"
      aside={
        <GameSceneAsideSection title="留名规则" className="text-sm leading-7">
          <p>
            默认公开角色名、称号、境界、最高档位与首次支持月份；次数和金额从不公开，可随时关闭留名。
          </p>
        </GameSceneAsideSection>
      }
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ['mine', '我的功德'],
            ['world', '天下功德'],
            ['support', '续添功德'],
          ] as const
        ).map(([id, label]) => (
          <InkButton
            key={id}
            variant={tab === id ? 'primary' : 'secondary'}
            onClick={() => setTab(id)}
          >
            {label}
          </InkButton>
        ))}
      </div>

      {tab === 'mine' && (
        <div className="space-y-4">
          {mine?.profile ? (
            <div className="border-ink/20 bg-paper border border-dashed p-5">
              <p className="text-xl">
                {SPONSORSHIP_TIER_META[mine.profile.highestTier].theme}
              </p>
              <p className="text-ink-secondary mt-2 text-sm">
                最高留名：{SPONSORSHIP_TIER_META[mine.profile.highestTier].name}
              </p>
            </div>
          ) : (
            <p className="text-ink-secondary">当前角色尚未在功德簿留名。</p>
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={publicListing}
              onChange={(event) => void updateVisibility(event.target.checked)}
            />
            <span>
              公开留名（仅展示角色名、称号、境界、最高档位与首次支持月份）
            </span>
          </label>
          <div className="space-y-2">
            {mine?.records.map((record) => (
              <div
                key={record.id}
                className="border-ink/15 flex justify-between border-b py-2 text-sm"
              >
                <span>{SPONSORSHIP_TIER_META[record.tier].name}</span>
                <span>
                  {new Date(record.supportedAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'world' && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {world.map((row) => (
              <article
                key={row.cultivatorId}
                className="border-ink/20 bg-paper border border-dashed p-4"
              >
                <p className="text-lg">
                  {row.name}
                  {row.title ? ` · ${row.title}` : ''}
                </p>
                <p className="text-ink-secondary mt-1 text-sm">
                  {row.realm} · {row.realmStage}
                </p>
                <p className="mt-3 text-sm">
                  {SPONSORSHIP_TIER_META[row.highestTier].theme} ·{' '}
                  {row.firstSupportedMonth}
                </p>
              </article>
            ))}
          </div>
          <div className="flex items-center justify-center gap-3">
            <InkButton
              variant="secondary"
              disabled={worldPage <= 1}
              onClick={() =>
                void loadWorldPage(worldPage - 1).catch((error) =>
                  pushToast({ message: error.message, tone: 'danger' }),
                )
              }
            >
              上一页
            </InkButton>
            <span className="text-ink-secondary text-sm">
              第 {worldPage} 页 · 共 {worldTotal} 位道友
            </span>
            <InkButton
              variant="secondary"
              disabled={worldPage * 50 >= worldTotal}
              onClick={() =>
                void loadWorldPage(worldPage + 1).catch((error) =>
                  pushToast({ message: error.message, tone: 'danger' }),
                )
              }
            >
              下一页
            </InkButton>
          </div>
        </div>
      )}

      {tab === 'support' && (
        <div className="space-y-6">
          {pendingCheckoutUrl && (
            <p className="border-ink/15 border border-dashed p-3 text-sm">
              支付窗口未打开？
              <a
                className="ml-2 underline"
                href={pendingCheckoutUrl}
                target="_blank"
                rel="noreferrer"
              >
                点击此处继续前往爱发电
              </a>
            </p>
          )}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={publicListing}
              onChange={(event) => setPublicListing(event.target.checked)}
            />
            <span>本次功德完成后公开留名（默认开启，不公开金额和次数）</span>
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            {SPONSORSHIP_TIER_IDS.map((tier) => {
              const item = config?.tiers[tier];
              return (
                <article
                  key={tier}
                  className="border-ink/20 bg-paper border border-dashed p-5"
                >
                  <p className="text-xl">{SPONSORSHIP_TIER_META[tier].name}</p>
                  <p className="text-ink-secondary mt-1 text-sm">
                    {SPONSORSHIP_TIER_META[tier].theme}
                  </p>
                  <InkButton
                    className="mt-4"
                    variant="primary"
                    disabled={busy || !config?.enabled || !item?.configured}
                    onClick={() => void checkout(tier)}
                  >
                    前往爱发电
                  </InkButton>
                </article>
              );
            })}
          </div>
          <div className="border-ink/15 border-t pt-5">
            <InkInput
              label="站外订单认领码"
              value={claimCode}
              onChange={(value) => setClaimCode(value.toUpperCase())}
              placeholder="请输入爱发电私信中的功德认领码"
              disabled={busy}
            />
            <InkButton
              className="mt-3"
              variant="secondary"
              pending={busy}
              onClick={() => void claim()}
            >
              认领至当前角色
            </InkButton>
          </div>
        </div>
      )}
    </GameSceneFrame>
  );
}

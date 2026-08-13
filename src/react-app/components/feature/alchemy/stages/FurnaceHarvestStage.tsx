import { getPillFamilyLabel } from '@app/components/feature/consumables';
import { InkButton, InkNotice } from '@app/components/ui';
import { isPillConsumable } from '@shared/lib/consumables';
import { getPillAppearanceLabel } from '@shared/lib/pillAppearance';
import type { Consumable } from '@shared/types/cultivator';
import { useAlchemyCraftSession } from '../alchemyCraftContext';

export function FurnaceHarvestStage({ onReturn }: { onReturn(): void }) {
  const session = useAlchemyCraftSession();
  const items = session.result.craftedConsumables;
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="space-y-5">
      <div className="border-wood/30 border bg-[radial-gradient(circle_at_50%_0%,rgba(136,97,45,0.14),transparent_50%)] px-5 py-8 text-center">
        <p className="text-wood text-xs tracking-[0.3em]">
          炉鸣三响 · 开鼎收丹
        </p>
        <p className="text-wood mt-3 text-4xl font-semibold">{total}</p>
        <p className="text-ink-secondary mt-1 text-sm">
          枚丹药 · {items.length} 个批次
        </p>
      </div>
      {items.length ? (
        <div className="space-y-3">
          <Batch item={items[0]} primary />
          {items.slice(1).map((item, index) => (
            <Batch key={`${item.id}-${index}`} item={item} />
          ))}
        </div>
      ) : (
        <InkNotice tone="warning">炉中结果尚未落定。</InkNotice>
      )}
      {session.result.yieldProfile ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ResultMetric
            label="药蕴损耗"
            value={`${Math.round(session.result.yieldProfile.essenceLossRatio * 100)}%`}
          />
          <ResultMetric
            label="批次分布"
            value={session.result.yieldProfile.distributionSummary}
          />
        </div>
      ) : null}
      {session.result.formulaProgress ? (
        <InkNotice tone="info">
          丹方熟练 +{session.result.formulaProgress.gainedExp}，当前 Lv.
          {session.result.formulaProgress.level}。
        </InkNotice>
      ) : null}
      {session.result.formulaDiscovery ? (
        <section className="border-crimson/30 border border-dashed p-5">
          <p className="text-crimson text-xs tracking-[0.24em]">余韵成方</p>
          <h3 className="mt-2 text-lg">
            {session.result.formulaDiscovery.name}
          </h3>
          <p className="text-ink-secondary mt-2 text-sm leading-7">
            {session.result.formulaDiscovery.description}
          </p>
          <p className="text-ink-secondary mt-2 text-xs">
            {session.result.formulaDiscovery.discoveryRemark}
          </p>
          <div className="mt-4 flex gap-3">
            <InkButton
              variant="secondary"
              onClick={() => void session.resolveDiscovery(false)}
            >
              任其散去
            </InkButton>
            <InkButton
              variant="primary"
              onClick={() => void session.resolveDiscovery(true)}
            >
              收入丹方玉简
            </InkButton>
          </div>
        </section>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        <InkButton
          variant="secondary"
          onClick={() => {
            session.startNextBatch();
            onReturn();
          }}
        >
          收丹返回丹房
        </InkButton>
        <InkButton variant="primary" onClick={session.startNextBatch}>
          清炉，准备下一炉
        </InkButton>
      </div>
    </div>
  );
}
function Batch({
  item,
  primary = false,
}: {
  item: Consumable;
  primary?: boolean;
}) {
  const pill = isPillConsumable(item) ? item : null;
  return (
    <div
      className={`grid gap-3 border p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${primary ? 'border-wood/35 bg-wood/10' : 'border-ink/15'}`}
    >
      <span
        className={`grid size-10 place-items-center rounded-full border text-sm ${primary ? 'border-wood/40 text-wood' : 'border-ink/20 text-ink-secondary'}`}
      >
        {primary ? '主' : '副'}
      </span>
      <div>
        <p className="font-semibold">{item.name}</p>
        <p className="text-ink-secondary mt-1 text-xs">
          {pill
            ? `${getPillFamilyLabel(pill.spec.family)} · ${getPillAppearanceLabel(pill.spec.alchemyMeta.appearance)}`
            : '丹药'}{' '}
          · {item.quality ?? '凡品'}
        </p>
      </div>
      <strong className={primary ? 'text-wood text-xl' : 'text-lg'}>
        ×{item.quantity}
      </strong>
    </div>
  );
}
function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink/[0.035] p-4">
      <p className="text-ink-secondary text-xs">{label}</p>
      <p className="mt-2 text-sm leading-6">{value}</p>
    </div>
  );
}

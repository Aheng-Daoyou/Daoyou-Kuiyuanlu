import { getPillFamilyLabel } from '@app/components/feature/consumables';
import {
  InkBadge,
  InkButton,
  InkNotice,
  inkFieldVariants,
} from '@app/components/ui';
import { formatAlchemyPropertyVector } from '@shared/lib/alchemyProperties';
import { cn } from '@shared/lib/cn';
import {
  PILL_FAMILY_VALUES,
  type AlchemyFormula,
  type PillFamily,
} from '@shared/types/consumable';
import { useState } from 'react';
import { AlchemyFacilityWorkspace } from '../AlchemyFacilityWorkspace';
import { useAlchemyCraftSession } from '../alchemyCraftContext';
import { useAlchemyFormulaLibrary } from '../useAlchemyFormulaLibrary';

export function FormulaArchiveView({
  onBack,
  onOpenFurnace,
}: {
  onBack(): void;
  onOpenFurnace(): void;
}) {
  const session = useAlchemyCraftSession();
  const library = useAlchemyFormulaLibrary();
  const [detail, setDetail] = useState<AlchemyFormula | null>(null);
  const openFurnace = (formula: AlchemyFormula) => {
    session.selectFormula(formula);
    onOpenFurnace();
  };
  return (
    <AlchemyFacilityWorkspace
      sigil="简"
      title="丹方玉简"
      description="查阅、整理与管理已经悟得的丹方；本炉配伍仍由丹炉完成。"
      onBack={onBack}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
          <input
            className={inkFieldVariants()}
            value={library.search}
            placeholder="以丹方名检索玉简"
            onChange={(event) => library.setSearch(event.target.value)}
          />
          <select
            className={inkFieldVariants()}
            value={library.family}
            onChange={(event) =>
              library.setFamily(event.target.value as PillFamily | 'all')
            }
          >
            <option value="all">全部丹类</option>
            {PILL_FAMILY_VALUES.map((family) => (
              <option key={family} value={family}>
                {getPillFamilyLabel(family)}
              </option>
            ))}
          </select>
          <InkButton
            variant="secondary"
            pending={library.loading}
            onClick={library.reload}
          >
            重读玉简
          </InkButton>
        </div>

        {library.error ? (
          <InkNotice tone="warning">{library.error}</InkNotice>
        ) : null}

        {detail ? (
          <section className="border-crimson/25 bg-crimson/[0.025] border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg">{detail.name}</h3>
                  <InkBadge>{getPillFamilyLabel(detail.family)}</InkBadge>
                  <span className="text-ink-secondary text-xs">
                    熟练 Lv.{detail.mastery.level}
                  </span>
                </div>
                <p className="text-ink-secondary mt-3 text-sm leading-7">
                  {detail.description}
                </p>
                <p className="text-ink-secondary mt-2 text-sm leading-7">
                  药性取向：
                  {formatAlchemyPropertyVector(
                    detail.pattern.targetPropertyVector,
                  )}
                </p>
                <p className="text-ink-secondary mt-2 text-xs leading-6">
                  需 {detail.pattern.slotCount} 味灵材
                  {detail.pattern.minQuality
                    ? `，最低 ${detail.pattern.minQuality}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <InkButton variant="secondary" onClick={() => setDetail(null)}>
                  收起详情
                </InkButton>
                <InkButton
                  variant="primary"
                  onClick={() => openFurnace(detail)}
                >
                  以此方开炉
                </InkButton>
              </div>
            </div>
          </section>
        ) : null}

        {library.formulas.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {library.formulas.map((formula) => (
              <article
                key={formula.id}
                className={cn(
                  'border-ink/15 border p-4',
                  detail?.id === formula.id &&
                    'border-crimson bg-crimson/[0.025]',
                )}
              >
                <button
                  type="button"
                  onClick={() => setDetail(formula)}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-medium">{formula.name}</strong>
                    <InkBadge>{getPillFamilyLabel(formula.family)}</InkBadge>
                    <span className="text-ink-secondary ml-auto text-xs">
                      熟练 Lv.{formula.mastery.level}
                    </span>
                  </div>
                  <p className="text-ink-secondary mt-3 text-sm leading-6">
                    {formatAlchemyPropertyVector(
                      formula.pattern.targetPropertyVector,
                    )}
                  </p>
                </button>
                <div className="border-ink/10 mt-4 flex items-center justify-end gap-2 border-t pt-3">
                  <InkButton
                    variant="secondary"
                    onClick={() => library.deleteFormula(formula)}
                  >
                    删去
                  </InkButton>
                  <InkButton
                    variant="primary"
                    onClick={() => openFurnace(formula)}
                  >
                    以此方开炉
                  </InkButton>
                </div>
              </article>
            ))}
          </div>
        ) : !library.loading ? (
          <InkNotice tone="info">
            尚未留存丹方。可在丹炉选择随心炼丹，成功后有机会悟得新方。
          </InkNotice>
        ) : null}

        <div className="flex items-center justify-between">
          <InkButton
            variant="secondary"
            disabled={!library.pagination.hasPreviousPage || library.loading}
            onClick={() => library.setPage(library.page - 1)}
          >
            前卷
          </InkButton>
          <span className="text-ink-secondary text-xs">
            {library.pagination.page} /{' '}
            {Math.max(1, library.pagination.totalPages)}
          </span>
          <InkButton
            variant="secondary"
            disabled={!library.pagination.hasNextPage || library.loading}
            onClick={() => library.setPage(library.page + 1)}
          >
            后卷
          </InkButton>
        </div>
      </div>
    </AlchemyFacilityWorkspace>
  );
}

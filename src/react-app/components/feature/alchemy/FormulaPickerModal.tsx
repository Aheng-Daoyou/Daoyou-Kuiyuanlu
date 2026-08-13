import { getPillFamilyLabel } from '@app/components/feature/consumables';
import { InkModal } from '@app/components/layout';
import {
  InkBadge,
  InkButton,
  InkNotice,
  inkFieldVariants,
} from '@app/components/ui';
import { formatAlchemyPropertyVector } from '@shared/lib/alchemyProperties';
import {
  PILL_FAMILY_VALUES,
  type AlchemyFormula,
  type PillFamily,
} from '@shared/types/consumable';
import { useAlchemyFormulaLibrary } from './useAlchemyFormulaLibrary';

export function FormulaPickerModal({
  isOpen,
  selectedId,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  selectedId?: string;
  onClose(): void;
  onSelect(formula: AlchemyFormula): void;
}) {
  const library = useAlchemyFormulaLibrary({ enabled: isOpen, pageSize: 5 });
  return (
    <InkModal
      isOpen={isOpen}
      onClose={onClose}
      title="选择本炉丹方"
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <input
            className={inkFieldVariants()}
            value={library.search}
            placeholder="搜索丹方"
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
        </div>
        {library.error ? (
          <InkNotice tone="warning">{library.error}</InkNotice>
        ) : null}
        {library.formulas.length ? (
          <div className="space-y-2">
            {library.formulas.map((formula) => (
              <button
                key={formula.id}
                type="button"
                aria-pressed={selectedId === formula.id}
                onClick={() => {
                  onSelect(formula);
                  onClose();
                }}
                className={`w-full border p-4 text-left transition-colors ${selectedId === formula.id ? 'border-crimson bg-crimson/5' : 'border-ink/15 hover:border-crimson/35'}`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <strong>{formula.name}</strong>
                  <InkBadge>{getPillFamilyLabel(formula.family)}</InkBadge>
                  <span className="text-ink-secondary ml-auto text-xs">
                    熟练 Lv.{formula.mastery.level}
                  </span>
                </span>
                <span className="text-ink-secondary mt-2 block text-sm">
                  {formatAlchemyPropertyVector(
                    formula.pattern.targetPropertyVector,
                  )}
                </span>
              </button>
            ))}
          </div>
        ) : !library.loading ? (
          <InkNotice>暂无符合条件的丹方。</InkNotice>
        ) : null}
        <div className="flex items-center justify-between">
          <InkButton
            variant="secondary"
            disabled={!library.pagination.hasPreviousPage}
            onClick={() => library.setPage(library.page - 1)}
          >
            上一页
          </InkButton>
          <span className="text-ink-secondary text-xs">
            {library.pagination.page} /{' '}
            {Math.max(1, library.pagination.totalPages)}
          </span>
          <InkButton
            variant="secondary"
            disabled={!library.pagination.hasNextPage}
            onClick={() => library.setPage(library.page + 1)}
          >
            下一页
          </InkButton>
        </div>
      </div>
    </InkModal>
  );
}

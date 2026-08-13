import {
  describeAppearanceTendency,
  describeBatchOmen,
  describeEssenceState,
  describeFireState,
  describeFormulaObservation,
  describeFurnaceGreeting,
  type AlchemyWorkspacePhase,
} from '@app/components/feature/alchemy/alchemyPresentation';
import {
  PillAppearanceMark,
  PillDetailGroups,
  getPillFamilyLabel,
  toPillDisplayModel,
} from '@app/components/feature/consumables';
import {
  MaterialSelectionModal,
  SelectedMaterialsWithDose,
} from '@app/components/feature/creation';
import { useQiActionConfirm } from '@app/components/feature/cultivator/useQiActionConfirm';
import { NpcConversation } from '@app/components/feature/room';
import { GameLoadingState, GameSceneLoading } from '@app/components/game-shell';
import { InkModal } from '@app/components/layout';
import { useInkUI } from '@app/components/providers/InkUIProvider';
import {
  InkActionGroup,
  InkBadge,
  InkButton,
  InkCard,
  InkDetailDrawer,
  InkDialog,
  InkIdentifyCelebration,
  InkInput,
  InkNotice,
  ItemShowcaseModal,
  type InkDialogState,
} from '@app/components/ui';
import { STARTER_ALCHEMY_PROMPT } from '@app/lib/alchemy/starterAlchemy';
import { useTaskList } from '@app/lib/hooks/useTaskList';
import { useResourceMutation } from '@app/lib/resources/mutations';
import {
  useCultivatorCurrency,
  useCultivatorIdentity,
  usePlayerSession,
} from '@app/lib/resources/player';
import { findNextTutorialTask } from '@app/lib/tasks/taskClient';
import { QI_ACTION_COSTS } from '@shared/config/qiSystem';
import {
  ALCHEMY_MAX_DOSE,
  CREATION_INPUT_CONSTRAINTS,
} from '@shared/engine/creation-v2/config/CreationBalance';
import { formatAlchemyPropertyVector } from '@shared/lib/alchemyProperties';
import { cn } from '@shared/lib/cn';
import { isPillConsumable } from '@shared/lib/consumables';
import { getPillAppearanceLabel } from '@shared/lib/pillAppearance';
import type { MaterialType, RealmType } from '@shared/types/constants';
import type {
  AlchemyBatchPreview,
  AlchemyFormula,
  AlchemyFormulaDiscoveryCandidate,
  AlchemyMode,
  FormulaAnalysisResult,
  FormulaMaterialJudgment,
  PillFamily,
} from '@shared/types/consumable';
import { PILL_FAMILY_VALUES } from '@shared/types/consumable';
import type { Consumable, Material } from '@shared/types/cultivator';
import { useEffect, useMemo, useRef, useState } from 'react';

const ALLOWED_MATERIAL_TYPES = [
  'herb',
  'ore',
  'monster',
  'tcdb',
  'aux',
] as const;
const CRAFT_TYPE = 'alchemy' as const;
const MAX_MATERIALS = CREATION_INPUT_CONSTRAINTS.maxMaterialKinds;
const MIN_DOSE = CREATION_INPUT_CONSTRAINTS.minQuantityPerMaterial;
const MAX_DOSE = ALCHEMY_MAX_DOSE;

type PreviewValidation = {
  valid: boolean;
  blockingReason?: string;
  warnings: string[];
};

type AlchemyPreviewResponse = {
  success: boolean;
  data?: {
    cost: {
      spiritStones: number;
    };
    canAfford: boolean;
    validation: PreviewValidation;
    batchPreview?: AlchemyBatchPreview;
  };
  error?: string;
};

type PreviewState = {
  key: string | null;
  estimatedSpiritStones: number | null;
  validation: PreviewValidation | null;
  batchPreview: AlchemyBatchPreview | null;
  canAfford: boolean;
  previewError: string | null;
};

type FormulaProgress = {
  previousLevel: number;
  level: number;
  exp: number;
  gainedExp: number;
  leveledUp: boolean;
};

type AlchemyCraftResponse = {
  success: boolean;
  data?: {
    consumable: Consumable;
    consumables?: Consumable[];
    craftedConsumables?: Consumable[];
    yieldProfile?: import('@shared/types/consumable').AlchemyYieldDisplayProfile;
    formulaDiscovery?: AlchemyFormulaDiscoveryCandidate;
    formulaProgress?: FormulaProgress;
  };
  error?: string;
};

type FormulaListResponse = {
  success: boolean;
  data?: {
    formulas: AlchemyFormula[];
    pagination: FormulaListPagination;
  };
  error?: string;
};

type FormulaListPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type DiscoveryConfirmResponse = {
  success: boolean;
  data?: {
    saved: boolean;
    formula?: AlchemyFormula;
  };
  error?: string;
};

type FormulaDeleteResponse = {
  success: boolean;
  message?: string;
  error?: string;
};

type FormulaAnalyzeResponse = {
  success: boolean;
  data?: FormulaAnalysisResult;
  error?: string;
  remainingSeconds?: number;
};

const DEFAULT_PREVIEW_STATE: PreviewState = {
  key: null,
  estimatedSpiritStones: null,
  validation: null,
  batchPreview: null,
  canAfford: true,
  previewError: null,
};

const DEFAULT_FORMULA_PAGINATION: FormulaListPagination = {
  page: 1,
  pageSize: 5,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

function formatFormulaTags(formula: AlchemyFormula): string {
  return formatAlchemyPropertyVector(formula.pattern.targetPropertyVector);
}

function getFormulaMasteryRequiredExp(formula: AlchemyFormula): number {
  return 5 * (formula.mastery.level + 1);
}

function getFormulaFitBandLabel(
  fitBand: FormulaAnalysisResult['fitBand'],
): string {
  switch (fitBand) {
    case 'aligned':
      return '契合';
    case 'degraded':
      return '勉强';
    case 'poor':
      return '偏路';
  }
}

function getFormulaFitBandTone(
  fitBand: FormulaAnalysisResult['fitBand'],
): 'accent' | 'warning' | 'danger' {
  switch (fitBand) {
    case 'aligned':
      return 'accent';
    case 'degraded':
      return 'warning';
    case 'poor':
      return 'danger';
  }
}

function getFormulaAnalysisNarrative(
  fitBand: FormulaAnalysisResult['fitBand'],
): string {
  switch (fitBand) {
    case 'aligned':
      return '炉中药脉已顺着丹方主路收束，此刻开炉，最易成丹。';
    case 'degraded':
      return '这一炉尚能循方而行，只是药力已有散逸，成丹后难免折损几分。';
    case 'poor':
      return '这一炉药路偏离丹方甚远，仍可强行收丹，但药效和品相都会明显受损。';
  }
}

function getFormulaFitBandEffectText(
  fitBand: FormulaAnalysisResult['fitBand'],
): string {
  switch (fitBand) {
    case 'aligned':
      return '药效与品相概率按丹方正常发挥，契合越高熟练增长越快。';
    case 'degraded':
      return '药效会有折损，品相更难上行，熟练增长较少。';
    case 'poor':
      return '药效削减明显，品相大多偏下，且基本不会增长熟练。';
  }
}

function getBatchTierLabel(
  tier: NonNullable<FormulaAnalysisResult['batchProfile']>['compoundTier'],
): string {
  switch (tier) {
    case 'single':
      return '单材';
    case 'balanced':
      return '均衡';
    case 'synergy':
      return '协同';
    case 'conflict':
      return '冲突';
  }
}

export function AlchemyGuideModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <InkDetailDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="炉理指引"
      description="即兴炼丹与丹方炼制的炉前说明。"
      size="md"
    >
      <div className="space-y-4 text-sm leading-7">
        <section>
          <div className="text-battle-muted mb-2 text-[0.75rem] tracking-[0.2em]">
            即兴炼丹
          </div>
          <div className="text-ink-secondary space-y-1">
            <p>
              先挑灵材，再写丹意。你写的是想成什么丹，炉中灵材决定这股药力能往哪条路走：疗伤、回元、积修、启悟、破境、清心、护脉、延寿、炼体、洗髓，都会从这里分出路数。
            </p>
            <p>
              丹意写得越清楚，炉火越容易顺着你的意思走；灵材本性若不相合，也会把丹势带偏。想炼筑基丹，可投些温稳灵草或辅材，再写“冲关蓄势、辅助筑基、破境凝神”。
            </p>
            <p>
              想推动肉身炼体时，丹意要写清皮肤、筋骨、脏腑、气血或元神等方向。成丹名称仍随材料与炉意生成，不再固定叫某一种炼体丹。
            </p>
            <p>
              偶有一炉火候极顺、药路分明，出丹时便可能悟出丹方。留下丹方后，下次就能按方复炼。
            </p>
          </div>
        </section>

        <section>
          <div className="text-battle-muted mb-2 text-[0.75rem] tracking-[0.2em]">
            丹方炼制
          </div>
          <div className="text-ink-secondary space-y-1">
            <p>
              丹方记的是成丹路数，不是死记哪几味药。先选丹方，再把你手头相近的灵材投入炉中；若炉位、品阶或灵石不够，炉前会直接拦下。
            </p>
            <p>
              投料后先“推演药路”。这一步会看每味材料是能当主材、只能凑用，还是会拖偏丹方。
            </p>
            <p>
              药路若见“契合”，便可安心开炉；若只是“勉强”或“偏路”，也能强行成丹，只是药力、品相和熟练收益都会受影响。
            </p>
          </div>
        </section>

        <section>
          <div className="text-battle-muted mb-2 text-[0.75rem] tracking-[0.2em]">
            炉火提醒
          </div>
          <div className="text-ink-secondary space-y-1">
            <p>
              一炉里药味越多、方向越杂，火势越难稳。炉势不稳时即便成丹，疗伤、修为、感悟、炼体、延寿等药力也会打折。
            </p>
            <p>
              猛药常带丹毒，燥烈材料用得多，服后更要记得调息。解毒一类丹药能化浊，但这一炉的主要药力也会分去一部分。
            </p>
            <p>
              修为、启悟、破境、清心、护脉、延寿、炼体、洗髓都不是一口吞尽的便宜事。同一炉最好只求一条主路，丹意写得太散，反而什么都留不深。
            </p>
            <p>
              破境丹服下后，可能留下破境凝神、清心或护脉之效。破境前看的是你身上有没有这份准备，不问这枚丹是不是亲手炼成。
            </p>
            <p>
              肉身进阶另走炼体体系：看丹药是否为炼体类、药性是否对应目标五轨、丹药质量是否达标，不按丹药名称判断。
            </p>
          </div>
        </section>
      </div>
    </InkDetailDrawer>
  );
}

export function FormulaNarrativeBlock({
  formula,
  showMasteryExp = false,
}: {
  formula: AlchemyFormula;
  showMasteryExp?: boolean;
}) {
  return (
    <div className="text-ink-secondary mt-2 space-y-1 text-sm">
      <div>{formula.description}</div>
      <div>药路取向：{formatFormulaTags(formula)}</div>
      <div>
        需 {formula.pattern.slotCount} 味灵材
        {formula.pattern.minQuality
          ? `，至少 ${formula.pattern.minQuality}`
          : ''}
        {showMasteryExp ? `，熟练进度 ${formula.mastery.exp}` : ''}
      </div>
    </div>
  );
}

export function AlchemyFormulaSummaryCard({
  formula,
}: {
  formula: AlchemyFormula;
}) {
  return (
    <InkCard variant="elevated" padding="lg">
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{formula.name}</span>
          <InkBadge tone="default">
            {getPillFamilyLabel(formula.family)}
          </InkBadge>
          <InkBadge tone="accent">
            {`熟练 Lv.${formula.mastery.level}`}
          </InkBadge>
        </div>
        <FormulaNarrativeBlock formula={formula} showMasteryExp />
      </div>
    </InkCard>
  );
}

export function AlchemyFormulaAnalysisModal({
  analysis,
  cooldownRemainingSeconds,
  isOpen,
  isCrafting,
  onClose,
  onCraft,
}: {
  analysis: FormulaAnalysisResult | null;
  cooldownRemainingSeconds: number;
  isOpen: boolean;
  isCrafting: boolean;
  onClose: () => void;
  onCraft: () => void;
}) {
  if (!analysis) {
    return null;
  }

  return (
    <InkModal
      isOpen={isOpen}
      onClose={onClose}
      title="药路推演"
      className="max-w-2xl"
      footer={
        <InkActionGroup align="right">
          <InkButton onClick={onClose} disabled={isCrafting}>
            稍后开炉
          </InkButton>
          <InkButton
            variant="primary"
            onClick={onCraft}
            pending={isCrafting}
            pendingLabel="丹火炼中……"
          >
            确认开炉
          </InkButton>
        </InkActionGroup>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <InkBadge tone={getFormulaFitBandTone(analysis.fitBand)}>
            {getFormulaFitBandLabel(analysis.fitBand)}
          </InkBadge>
          <span className="text-ink-secondary">
            合方程度 {Math.round(analysis.fitScore * 100)}%
          </span>
        </div>
        {analysis.batchProfile ? (
          <div className="border-ink/10 bg-ink/5 grid gap-3 border border-dashed p-3 sm:grid-cols-2">
            <div>
              <div className="text-ink-secondary text-xs">预计成丹</div>
              <div className="text-wood text-2xl leading-9 font-bold">
                {analysis.batchProfile.totalQuantityRange.min}～
                {analysis.batchProfile.totalQuantityRange.max} 枚
              </div>
            </div>
            <div>
              <div className="text-ink-secondary text-xs">配伍</div>
              <div className="leading-7 font-semibold">
                {getBatchTierLabel(analysis.batchProfile.compoundTier)}
              </div>
              <div className="text-ink-secondary text-xs leading-5">
                {analysis.batchProfile.roleSummary}
              </div>
            </div>
            <div>
              <div className="text-ink-secondary text-xs">药蕴损耗</div>
              <div className="leading-7 font-semibold">
                约{' '}
                {Math.round(
                  analysis.batchProfile.essenceLossRatioRange.min * 100,
                )}
                % ～
                {Math.round(
                  analysis.batchProfile.essenceLossRatioRange.max * 100,
                )}
                %
              </div>
            </div>
          </div>
        ) : null}
        <div className="text-ink-secondary space-y-1 leading-6">
          <p>{getFormulaAnalysisNarrative(analysis.fitBand)}</p>
          <p>{getFormulaFitBandEffectText(analysis.fitBand)}</p>
          {cooldownRemainingSeconds > 0 ? (
            <p>
              本次推演已留炉路，可直接开炉；{cooldownRemainingSeconds}{' '}
              秒后可重新推演药路。
            </p>
          ) : null}
        </div>
        {analysis.materialJudgments.length > 0 ? (
          <div className="space-y-2">
            {analysis.materialJudgments.map((judgment) => (
              <div
                key={judgment.materialId}
                className="border-ink/10 flex flex-wrap items-center gap-2 border px-3 py-2"
              >
                <InkBadge
                  tone={getFormulaFitBandTone(
                    judgment.verdict === 'core'
                      ? 'aligned'
                      : judgment.verdict === 'usable'
                        ? 'degraded'
                        : 'poor',
                  )}
                >
                  {judgment.verdict === 'core'
                    ? '主材'
                    : judgment.verdict === 'usable'
                      ? '可用'
                      : '偏路'}
                </InkBadge>
                <span className="font-medium">{judgment.materialName}</span>
                <span className="text-ink-secondary">{judgment.reason}</span>
              </div>
            ))}
          </div>
        ) : null}
        {analysis.warnings.length > 0 ? (
          <div className="space-y-2">
            {analysis.warnings.map((warning) => (
              <InkNotice key={warning} tone="warning">
                {warning}
              </InkNotice>
            ))}
          </div>
        ) : null}
      </div>
    </InkModal>
  );
}

export function AlchemyFormulaListItem({
  formula,
  isActive,
  isDeleting,
  onSelect,
  onDelete,
}: {
  formula: AlchemyFormula;
  isActive: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const requiredMasteryExp = getFormulaMasteryRequiredExp(formula);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'w-full border px-3 py-3 text-left transition-colors',
        isActive
          ? 'border-crimson bg-crimson/5'
          : 'border-ink/10 hover:border-ink/30',
      )}
    >
      <div className="space-y-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="leading-6 font-semibold">{formula.name}</span>
            <InkBadge tone="default">
              {getPillFamilyLabel(formula.family)}
            </InkBadge>
          </div>
          <div className="text-ink-secondary flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span>{`熟练 Lv.${formula.mastery.level}`}</span>
            <span>{`进度 ${formula.mastery.exp}/${requiredMasteryExp}`}</span>
            <span>{`需 ${formula.pattern.slotCount} 味灵材`}</span>
            {formula.pattern.minQuality ? (
              <span>{`至少 ${formula.pattern.minQuality}`}</span>
            ) : null}
          </div>
          <div className="text-ink-secondary space-y-1 text-sm leading-6">
            <p>{formula.description}</p>
            <p>药路取向：{formatFormulaTags(formula)}</p>
          </div>
        </div>
        <div
          className="flex justify-end"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <InkButton
            variant="ghost"
            onClick={onDelete}
            pending={isDeleting}
            pendingLabel="删除中……"
            className="text-crimson hover:text-crimson/80 w-[6em] justify-center"
          >
            删除
          </InkButton>
        </div>
      </div>
    </div>
  );
}

export function AlchemyFormulaSelectionModal({
  isOpen,
  onClose,
  formulas,
  selectedFormulaId,
  isLoading,
  error,
  search,
  familyFilter,
  pagination,
  isDeleting,
  isSubmitting,
  onSearchChange,
  onFamilyFilterChange,
  onPageChange,
  onSelectFormula,
  onDeleteFormula,
}: {
  isOpen: boolean;
  onClose: () => void;
  formulas: AlchemyFormula[];
  selectedFormulaId: string | null;
  isLoading: boolean;
  error: string | null;
  search: string;
  familyFilter: PillFamily | 'all';
  pagination: FormulaListPagination;
  isDeleting: boolean;
  isSubmitting: boolean;
  onSearchChange: (value: string) => void;
  onFamilyFilterChange: (value: PillFamily | 'all') => void;
  onPageChange: (page: number) => void;
  onSelectFormula: (formula: AlchemyFormula) => void;
  onDeleteFormula: (formula: AlchemyFormula) => void;
}) {
  return (
    <InkModal
      isOpen={isOpen}
      onClose={onClose}
      title="选择丹方"
      className="max-w-3xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-ink-secondary text-xs">
            共 {pagination.total} 份丹方，第 {pagination.page} /{' '}
            {pagination.totalPages} 页
          </div>
          <InkActionGroup align="right">
            <InkButton
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={
                isSubmitting || isLoading || !pagination.hasPreviousPage
              }
            >
              上一页
            </InkButton>
            <InkButton
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={isSubmitting || isLoading || !pagination.hasNextPage}
            >
              下一页
            </InkButton>
            <InkButton variant="primary" onClick={onClose}>
              完成选择
            </InkButton>
          </InkActionGroup>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem]">
          <InkInput
            label="搜索丹方"
            placeholder="按名称或记述查找"
            value={search}
            onChange={onSearchChange}
            disabled={isSubmitting}
          />
          <label className="text-ink-secondary flex flex-col gap-1 text-sm">
            族类
            <select
              value={familyFilter}
              onChange={(event) =>
                onFamilyFilterChange(event.target.value as PillFamily | 'all')
              }
              disabled={isSubmitting}
              className="border-ink/20 bg-paper text-ink min-h-10 border px-3"
            >
              <option value="all">全部</option>
              {PILL_FAMILY_VALUES.map((family) => (
                <option key={family} value={family}>
                  {getPillFamilyLabel(family)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <InkNotice tone="warning">{error}</InkNotice> : null}
        {isLoading ? (
          <GameLoadingState message="正在整理你的丹方笔录……" variant="inline" />
        ) : null}
        {!isLoading && formulas.length === 0 ? (
          <InkNotice tone="info">
            {search || familyFilter !== 'all'
              ? '没有符合筛选条件的丹方。'
              : '你尚未悟得丹方。先在“即兴炼丹”中炼出稳固成丹，再尝试留方。'}
          </InkNotice>
        ) : null}

        <div className="space-y-2">
          {formulas.map((formula) => (
            <AlchemyFormulaListItem
              key={formula.id}
              formula={formula}
              isActive={formula.id === selectedFormulaId}
              isDeleting={isDeleting}
              onSelect={() => onSelectFormula(formula)}
              onDelete={() => onDeleteFormula(formula)}
            />
          ))}
        </div>
      </div>
    </InkModal>
  );
}

export function AlchemyResultModal({
  consumable,
  consumables,
  craftedConsumables,
  yieldProfile,
  formulaProgress,
  isOpen,
  onClose,
  viewerRealm,
}: {
  consumable: Consumable | null;
  consumables?: Consumable[];
  craftedConsumables?: Consumable[];
  yieldProfile?: import('@shared/types/consumable').AlchemyYieldDisplayProfile;
  formulaProgress: FormulaProgress | null;
  isOpen: boolean;
  onClose: () => void;
  viewerRealm?: RealmType;
}) {
  if (!consumable || !isPillConsumable(consumable)) {
    return null;
  }

  const model = toPillDisplayModel(consumable, { realm: viewerRealm });
  const meta = consumable.spec.alchemyMeta;
  const outputItems = craftedConsumables?.length
    ? craftedConsumables
    : consumables?.length
      ? consumables
      : [consumable];

  return (
    <ItemShowcaseModal
      isOpen={isOpen}
      onClose={onClose}
      icon="🌕"
      name={consumable.name}
      nameMark={
        model.appearance ? (
          <PillAppearanceMark
            appearance={model.appearance}
            className="text-xs"
          />
        ) : undefined
      }
      badges={[
        consumable.quality ? (
          <InkBadge key="quality" tier={consumable.quality}>
            {consumable.type}
          </InkBadge>
        ) : undefined,
        <InkBadge key="family" tone="default">
          {getPillFamilyLabel(consumable.spec.family)}
        </InkBadge>,
        meta.source === 'formula' ? (
          <InkBadge key="source" tone="accent">
            丹方炼制
          </InkBadge>
        ) : undefined,
      ].filter(Boolean)}
      metaSection={
        <div className="space-y-2">
          <div className="border-wood/30 bg-wood/10 flex items-center justify-between border px-3 py-2">
            <span className="text-ink-secondary text-sm">本炉成丹</span>
            <span className="text-wood text-xl font-bold">
              {yieldProfile?.totalQuantity ??
                outputItems.reduce((sum, item) => sum + item.quantity, 0)}{' '}
              枚
            </span>
          </div>
          {outputItems.length > 1 ? (
            <div className="border-ink/10 space-y-1 border border-dashed p-3 text-sm">
              <div className="text-ink-secondary mb-1 text-xs">同炉产出</div>
              {outputItems.map((item) => (
                <div
                  key={`${item.quality}-${item.spec.kind === 'pill' ? item.spec.alchemyMeta.appearance : 'none'}-${item.quantity}-${item.score}`}
                  className="flex items-center justify-between"
                >
                  <span>
                    {item.quality ?? '凡品'} ·{' '}
                    {item.spec.kind === 'pill'
                      ? getPillAppearanceLabel(item.spec.alchemyMeta.appearance)
                      : '丹药'}
                  </span>
                  <span className="font-bold">×{item.quantity}</span>
                </div>
              ))}
            </div>
          ) : null}
          {meta.batch ? (
            <div className="border-border/50 flex justify-between border-b pb-2">
              <span className="opacity-70">配伍</span>
              <span className="font-bold">
                {getBatchTierLabel(meta.batch.compoundTier)} ·{' '}
                {meta.batch.roleSummary}
              </span>
            </div>
          ) : null}
          {yieldProfile ? (
            <div className="border-ink/10 flex justify-between border-b pb-2">
              <span className="opacity-70">药蕴损耗</span>
              <span className="font-bold">
                约 {Math.round(yieldProfile.essenceLossRatio * 100)}%
              </span>
            </div>
          ) : null}
          <PillDetailGroups groups={model.detailGroups} />
          {formulaProgress && (
            <div className="border-ink/10 border border-dashed p-3">
              <div className="text-ink-secondary mb-2 text-xs">丹方熟练</div>
              <div className="space-y-1 text-sm">
                <div>本次熟练 +{formulaProgress.gainedExp}</div>
                <div>
                  当前等级 Lv.{formulaProgress.level}，进度{' '}
                  {formulaProgress.exp}
                </div>
                {formulaProgress.leveledUp && (
                  <div className="text-emerald-700">
                    丹方熟练提升：Lv.{formulaProgress.previousLevel} → Lv.
                    {formulaProgress.level}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      }
      description={consumable.description}
      descriptionTitle="丹成评述"
    />
  );
}

export function AlchemyFormulaDiscoveryModal({
  formulaDiscovery,
  isHandlingDiscovery,
  isOpen,
  onAcceptDiscovery,
  onRejectDiscovery,
}: {
  formulaDiscovery: AlchemyFormulaDiscoveryCandidate | null;
  isHandlingDiscovery: boolean;
  isOpen: boolean;
  onAcceptDiscovery: () => void;
  onRejectDiscovery: () => void;
}) {
  if (!formulaDiscovery) {
    return null;
  }

  return (
    <ItemShowcaseModal
      isOpen={isOpen}
      onClose={() => undefined}
      icon="📜"
      name={formulaDiscovery.name}
      badges={[
        <InkBadge key="discovery" tone="accent">
          新悟丹方
        </InkBadge>,
        <InkBadge key="family" tone="default">
          {getPillFamilyLabel(formulaDiscovery.family)}
        </InkBadge>,
      ]}
      metaSection={
        <div className="space-y-2">
          <InkNotice tone="info">
            <div className="space-y-1">
              <div>{formulaDiscovery.discoveryRemark}</div>
              <div className="text-ink-secondary text-xs">
                {formulaDiscovery.patternSummary}
              </div>
            </div>
          </InkNotice>
        </div>
      }
      description={formulaDiscovery.description}
      descriptionTitle="留方记述"
      footer={
        <InkActionGroup align="right">
          <InkButton onClick={onRejectDiscovery} disabled={isHandlingDiscovery}>
            暂不保存
          </InkButton>
          <InkButton
            variant="primary"
            onClick={onAcceptDiscovery}
            pending={isHandlingDiscovery}
            pendingLabel="留方中……"
          >
            保存丹方
          </InkButton>
        </InkActionGroup>
      }
    />
  );
}

export type AlchemySceneProps = {
  onExit?(): void;
  sectContext?: {
    facilityLevel: number;
    discountPercent: number;
    facilityLabel: string;
    scene: import('@shared/engine/sect').SectScenePresentation;
    onExit?(): void;
  };
};

export function AlchemyScene({ sectContext, onExit }: AlchemySceneProps) {
  const profile = useCultivatorIdentity();
  const currency = useCultivatorCurrency();
  const session = usePlayerSession();
  const identity = profile.data?.cultivator;
  const cultivator =
    identity?.id && currency.data
      ? {
          id: identity.id,
          realm: identity.realm,
          spirit_stones: currency.data.spiritStones,
        }
      : null;
  const note = session.data?.note;
  const isLoading = profile.loading || currency.loading || session.loading;
  const { mutate } = useResourceMutation();
  const cultivatorId = cultivator?.id ?? null;
  const { tasks } = useTaskList(cultivatorId ?? undefined);
  const [activeMode, setActiveMode] = useState<AlchemyMode>('improvised');
  const [workspacePhase, setWorkspacePhase] =
    useState<AlchemyWorkspacePhase>('idle');
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(
    null,
  );
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [selectedMaterialMap, setSelectedMaterialMap] = useState<
    Record<string, Material>
  >({});
  const [doseMap, setDoseMap] = useState<Record<string, number>>({});
  const [userPrompt, setUserPrompt] = useState('');
  const [status, setStatus] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [createdConsumable, setCreatedConsumable] = useState<Consumable | null>(
    null,
  );
  const [createdConsumables, setCreatedConsumables] = useState<Consumable[]>(
    [],
  );
  const [createdCraftedConsumables, setCreatedCraftedConsumables] = useState<
    Consumable[]
  >([]);
  const [createdYieldProfile, setCreatedYieldProfile] = useState<
    import('@shared/types/consumable').AlchemyYieldDisplayProfile | null
  >(null);
  const [formulaDiscovery, setFormulaDiscovery] =
    useState<AlchemyFormulaDiscoveryCandidate | null>(null);
  const [formulaProgress, setFormulaProgress] =
    useState<FormulaProgress | null>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [isDiscoveryModalOpen, setIsDiscoveryModalOpen] = useState(false);
  const [isHandlingDiscovery, setIsHandlingDiscovery] = useState(false);
  const [isDeletingFormula, setIsDeletingFormula] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isFormulaSelectionModalOpen, setIsFormulaSelectionModalOpen] =
    useState(false);
  const [dialog, setDialog] = useState<InkDialogState | null>(null);
  const [celebrationTick, setCelebrationTick] = useState(0);
  const [previewState, setPreviewState] = useState<PreviewState>(
    DEFAULT_PREVIEW_STATE,
  );
  const [formulaAnalysis, setFormulaAnalysis] =
    useState<FormulaAnalysisResult | null>(null);
  const [isFormulaAnalysisModalOpen, setIsFormulaAnalysisModalOpen] =
    useState(false);
  const [isAnalyzingFormula, setIsAnalyzingFormula] = useState(false);
  const [formulaAnalysisError, setFormulaAnalysisError] = useState<
    string | null
  >(null);
  const [analysisCooldownRemaining, setAnalysisCooldownRemaining] = useState(0);
  const [analysisExpiresAfterMs, setAnalysisExpiresAfterMs] = useState<
    number | null
  >(null);
  const [formulas, setFormulas] = useState<AlchemyFormula[]>([]);
  const [selectedFormulaSnapshot, setSelectedFormulaSnapshot] =
    useState<AlchemyFormula | null>(null);
  const [formulaSearch, setFormulaSearch] = useState('');
  const [formulaFamilyFilter, setFormulaFamilyFilter] = useState<
    PillFamily | 'all'
  >('all');
  const [formulaPage, setFormulaPage] = useState(1);
  const [formulaPagination, setFormulaPagination] =
    useState<FormulaListPagination>(DEFAULT_FORMULA_PAGINATION);
  const [formulasError, setFormulasError] = useState<string | null>(null);
  const [isLoadingFormulas, setIsLoadingFormulas] = useState(false);
  const analyzedFormulaSelectionKeyRef = useRef<string | null>(null);
  const { pushToast } = useInkUI();
  const { openQiActionConfirm } = useQiActionConfirm();
  const selectedFormula = useMemo(
    () =>
      selectedFormulaSnapshot?.id === selectedFormulaId
        ? selectedFormulaSnapshot
        : (formulas.find((formula) => formula.id === selectedFormulaId) ??
          null),
    [formulas, selectedFormulaId, selectedFormulaSnapshot],
  );
  const nextTutorialTask = useMemo(
    () => (tasks ? findNextTutorialTask(tasks) : null),
    [tasks],
  );
  const isStarterAlchemyTask =
    nextTutorialTask?.definitionId === 'tutorial_first_alchemy';
  const formulaJudgmentMap = useMemo(
    () =>
      Object.fromEntries(
        (formulaAnalysis?.materialJudgments ?? []).map((judgment) => [
          judgment.materialId,
          judgment,
        ]),
      ) as Record<string, FormulaMaterialJudgment>,
    [formulaAnalysis],
  );
  const currentFormulaSelectionKey = useMemo(() => {
    if (activeMode !== 'formula' || !selectedFormulaId) {
      return null;
    }

    return JSON.stringify({
      formulaId: selectedFormulaId,
      materials: selectedMaterialIds.map((id) => ({
        id,
        dose: doseMap[id] ?? MIN_DOSE,
      })),
    });
  }, [activeMode, doseMap, selectedFormulaId, selectedMaterialIds]);

  useEffect(() => {
    if (analysisCooldownRemaining <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setAnalysisCooldownRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [analysisCooldownRemaining]);

  useEffect(() => {
    if (!formulaAnalysis || !analysisExpiresAfterMs) {
      return;
    }

    const timer = window.setTimeout(() => {
      setFormulaAnalysis(null);
      setIsFormulaAnalysisModalOpen(false);
      setAnalysisExpiresAfterMs(null);
      setFormulaAnalysisError('上次推演已散去，请重新推演药路。');
    }, analysisExpiresAfterMs);

    return () => window.clearTimeout(timer);
  }, [analysisExpiresAfterMs, formulaAnalysis]);

  const clearFormulaAnalysis = (options?: { keepError?: boolean }) => {
    setFormulaAnalysis(null);
    setIsFormulaAnalysisModalOpen(false);
    setAnalysisExpiresAfterMs(null);
    analyzedFormulaSelectionKeyRef.current = null;
    if (!options?.keepError) {
      setFormulaAnalysisError(null);
    }
  };

  useEffect(() => {
    if (
      analyzedFormulaSelectionKeyRef.current &&
      analyzedFormulaSelectionKeyRef.current !== currentFormulaSelectionKey
    ) {
      analyzedFormulaSelectionKeyRef.current = null;
      setFormulaAnalysis(null);
      setIsFormulaAnalysisModalOpen(false);
      setAnalysisExpiresAfterMs(null);
      setFormulaAnalysisError(null);
    }
  }, [currentFormulaSelectionKey]);

  const loadFormulas = async (options?: { page?: number }) => {
    if (!cultivatorId) {
      return;
    }

    try {
      setIsLoadingFormulas(true);
      const nextPage = options?.page ?? formulaPage;
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: '5',
      });
      const keyword = formulaSearch.trim();
      if (keyword) {
        params.set('search', keyword);
      }
      if (formulaFamilyFilter !== 'all') {
        params.set('family', formulaFamilyFilter);
      }
      const response = await fetch(
        `/api/alchemy/formulas?${params.toString()}`,
      );
      const result: FormulaListResponse = await response.json();

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || '丹方列表读取失败');
      }

      const nextFormulas = result.data.formulas;

      setFormulas(nextFormulas);
      setFormulaPagination(result.data.pagination);
      setFormulaPage(result.data.pagination.page);
      setFormulasError(null);
    } catch (error) {
      setFormulasError(
        error instanceof Error
          ? error.message
          : '丹方列表读取失败，请稍后再试。',
      );
    } finally {
      setIsLoadingFormulas(false);
    }
  };

  useEffect(() => {
    if (!cultivatorId || !isFormulaSelectionModalOpen) {
      return;
    }

    let cancelled = false;

    const loadInitialFormulas = async () => {
      try {
        setIsLoadingFormulas(true);
        const params = new URLSearchParams({
          page: String(formulaPage),
          pageSize: '5',
        });
        const keyword = formulaSearch.trim();
        if (keyword) {
          params.set('search', keyword);
        }
        if (formulaFamilyFilter !== 'all') {
          params.set('family', formulaFamilyFilter);
        }
        const response = await fetch(
          `/api/alchemy/formulas?${params.toString()}`,
        );
        const result: FormulaListResponse = await response.json();

        if (cancelled) return;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || '丹方列表读取失败');
        }

        const nextFormulas = result.data.formulas;

        setFormulas(nextFormulas);
        setFormulaPagination(result.data.pagination);
        setFormulaPage(result.data.pagination.page);
        setFormulasError(null);
      } catch (error) {
        if (cancelled) return;
        setFormulasError(
          error instanceof Error
            ? error.message
            : '丹方列表读取失败，请稍后再试。',
        );
      } finally {
        if (!cancelled) {
          setIsLoadingFormulas(false);
        }
      }
    };

    void loadInitialFormulas();

    return () => {
      cancelled = true;
    };
  }, [
    cultivatorId,
    formulaFamilyFilter,
    formulaPage,
    formulaSearch,
    isFormulaSelectionModalOpen,
  ]);

  const previewRequest = useMemo(() => {
    if (selectedMaterialIds.length === 0) {
      return null;
    }
    if (activeMode === 'formula' && !selectedFormulaId) {
      return null;
    }

    const params = new URLSearchParams({
      craftType: CRAFT_TYPE,
      alchemyMode: activeMode,
      materialIds: selectedMaterialIds.join(','),
    });
    const materialQuantities = Object.fromEntries(
      selectedMaterialIds.map((id) => [id, doseMap[id] ?? MIN_DOSE]),
    );
    params.set('materialQuantities', JSON.stringify(materialQuantities));
    if (activeMode === 'formula' && selectedFormulaId) {
      params.set('formulaId', selectedFormulaId);
    }

    return {
      key: JSON.stringify({
        activeMode,
        selectedFormulaId,
        materialIds: selectedMaterialIds,
        materialQuantities,
      }),
      url: `/api/craft?${params.toString()}`,
    };
  }, [activeMode, doseMap, selectedFormulaId, selectedMaterialIds]);

  useEffect(() => {
    if (!previewRequest) {
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      try {
        const response = await fetch(previewRequest.url);
        const result: AlchemyPreviewResponse = await response.json();

        if (cancelled) return;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || '炼丹预估失败');
        }

        setPreviewState({
          key: previewRequest.key,
          estimatedSpiritStones: result.data.cost.spiritStones,
          validation: result.data.validation,
          batchPreview: result.data.batchPreview ?? null,
          canAfford: result.data.canAfford,
          previewError: null,
        });
      } catch (error) {
        if (cancelled) return;
        setPreviewState({
          key: previewRequest.key,
          estimatedSpiritStones: null,
          validation: null,
          batchPreview: null,
          canAfford: true,
          previewError:
            error instanceof Error
              ? error.message
              : '炼丹预估失败，请稍后再试。',
        });
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [previewRequest]);

  const resetWorkbench = () => {
    setStatus('');
    setCreatedConsumable(null);
    setCreatedConsumables([]);
    setCreatedCraftedConsumables([]);
    setCreatedYieldProfile(null);
    setFormulaDiscovery(null);
    setFormulaProgress(null);
    setIsResultModalOpen(false);
    setIsDiscoveryModalOpen(false);
    setSelectedMaterialIds([]);
    setSelectedMaterialMap({});
    setDoseMap({});
    setUserPrompt('');
    setPreviewState(DEFAULT_PREVIEW_STATE);
    clearFormulaAnalysis();
    setIsMaterialModalOpen(false);
  };

  const handleModeChange = (value: string) => {
    const nextMode = value as AlchemyMode;
    if (nextMode !== activeMode) {
      setActiveMode(nextMode);
      resetWorkbench();
    }
    setWorkspacePhase('preparing');
  };

  const toggleMaterial = (id: string, material?: Material) => {
    clearFormulaAnalysis();
    setSelectedMaterialIds((prev) => {
      if (prev.includes(id)) {
        setSelectedMaterialMap((map) => {
          const next = { ...map };
          delete next[id];
          return next;
        });
        setDoseMap((map) => {
          const next = { ...map };
          delete next[id];
          return next;
        });
        return prev.filter((mid) => mid !== id);
      }
      if (prev.length >= MAX_MATERIALS) {
        pushToast({
          message: `丹炉承载有限，最多投入 ${MAX_MATERIALS} 种灵材`,
          tone: 'warning',
        });
        return prev;
      }
      if (material) {
        setSelectedMaterialMap((map) => ({ ...map, [id]: material }));
        setDoseMap((map) => ({ ...map, [id]: MIN_DOSE }));
      }
      return [...prev, id];
    });
  };

  const handleDoseChange = (id: string, dose: number) => {
    const material = selectedMaterialMap[id];
    if (!material) return;
    clearFormulaAnalysis();
    const stock = material.quantity ?? 0;
    const clamped = Math.min(
      Math.min(MAX_DOSE, Math.max(stock, MIN_DOSE)),
      Math.max(MIN_DOSE, Math.floor(dose)),
    );
    setDoseMap((prev) => ({ ...prev, [id]: clamped }));
  };

  const resetAll = () => {
    resetWorkbench();
    setWorkspacePhase('idle');
  };

  const submitPayload = useMemo(
    () => ({
      materialIds: selectedMaterialIds,
      craftType: CRAFT_TYPE,
      alchemyMode: activeMode,
      formulaId: activeMode === 'formula' ? selectedFormulaId : undefined,
      analysisId:
        activeMode === 'formula' ? formulaAnalysis?.analysisId : undefined,
      materialQuantities: Object.fromEntries(
        selectedMaterialIds.map((id) => [id, doseMap[id] ?? MIN_DOSE]),
      ),
      userPrompt: activeMode === 'improvised' ? userPrompt.trim() : undefined,
    }),
    [
      activeMode,
      doseMap,
      formulaAnalysis?.analysisId,
      selectedFormulaId,
      selectedMaterialIds,
      userPrompt,
    ],
  );

  const hasFreshPreview = previewState.key === previewRequest?.key;
  const estimatedSpiritStones = hasFreshPreview
    ? previewState.estimatedSpiritStones
    : null;
  const batchPreview = hasFreshPreview ? previewState.batchPreview : null;
  const validation = hasFreshPreview ? previewState.validation : null;
  const canAfford = hasFreshPreview ? previewState.canAfford : true;
  const previewError = hasFreshPreview ? previewState.previewError : null;
  const displayValidation = validation;
  const displayCanAfford = canAfford;
  const isFormulaMode = activeMode === 'formula';
  const displayBatchPreview = batchPreview;
  const displayPreviewWarnings = displayValidation?.warnings ?? [];
  const qiCost = isFormulaMode
    ? QI_ACTION_COSTS.alchemy_formula
    : QI_ACTION_COSTS.alchemy_improvised;
  const hasCraftableFormulaAnalysis = !!formulaAnalysis?.analysisId;
  const canAnalyzeFormula =
    !isSubmitting &&
    !isAnalyzingFormula &&
    !!selectedFormulaId &&
    selectedMaterialIds.length > 0 &&
    hasFreshPreview &&
    estimatedSpiritStones !== null &&
    !previewError &&
    displayCanAfford &&
    displayValidation?.valid !== false &&
    analysisCooldownRemaining <= 0;
  const canCraftFormula =
    !isSubmitting &&
    !!selectedFormulaId &&
    hasCraftableFormulaAnalysis &&
    !previewError &&
    estimatedSpiritStones !== null &&
    displayCanAfford &&
    displayValidation?.valid !== false;
  const canChooseMaterials =
    !isSubmitting && (!isFormulaMode || !!selectedFormulaId);

  const handleAnalyzeFormula = async () => {
    if (!cultivator) {
      pushToast({ message: '请先在首页觉醒灵根。', tone: 'warning' });
      return;
    }
    if (!selectedFormulaId) {
      pushToast({ message: '请先选定丹方。', tone: 'warning' });
      return;
    }
    if (selectedMaterialIds.length === 0) {
      pushToast({ message: '请先投入灵材。', tone: 'warning' });
      return;
    }
    if (!hasFreshPreview || estimatedSpiritStones === null) {
      pushToast({ message: '炉前验材尚未完成。', tone: 'warning' });
      return;
    }
    if (
      previewError ||
      displayValidation?.valid === false ||
      !displayCanAfford
    ) {
      pushToast({ message: '请先让这一炉通过验材。', tone: 'warning' });
      return;
    }
    if (analysisCooldownRemaining > 0) {
      pushToast({
        message: `炉意未散，请 ${analysisCooldownRemaining} 秒后再推演药路。`,
        tone: 'warning',
      });
      return;
    }

    setIsAnalyzingFormula(true);
    setFormulaAnalysisError(null);

    try {
      const response = await fetch(
        `/api/alchemy/formulas/${selectedFormulaId}/analyze`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            materialIds: selectedMaterialIds,
            materialQuantities: Object.fromEntries(
              selectedMaterialIds.map((id) => [id, doseMap[id] ?? MIN_DOSE]),
            ),
          }),
        },
      );
      const result: FormulaAnalyzeResponse = await response.json();

      if (!response.ok || !result.success || !result.data) {
        if (typeof result.remainingSeconds === 'number') {
          setAnalysisCooldownRemaining(result.remainingSeconds);
        }
        throw new Error(result.error || '推演药路失败');
      }

      if (!result.data.valid) {
        clearFormulaAnalysis();
        setFormulaAnalysisError(
          result.data.staticBlockingReason || '当前炉材未通过炉前验材。',
        );
        return;
      }

      setFormulaAnalysis(result.data);
      setWorkspacePhase('observing');
      setAnalysisExpiresAfterMs(result.data.expiresInSeconds * 1000);
      analyzedFormulaSelectionKeyRef.current = currentFormulaSelectionKey;
      setAnalysisCooldownRemaining(result.data.cooldownRemainingSeconds);
      pushToast({
        message:
          result.data.fitBand === 'aligned'
            ? '药路已明，可依方成丹。'
            : result.data.fitBand === 'degraded'
              ? '这炉尚可循方，但药力会有折损。'
              : '这炉偏离丹方较远，仍可强行收丹。',
        tone:
          result.data.fitBand === 'poor'
            ? 'warning'
            : result.data.fitBand === 'degraded'
              ? 'default'
              : 'success',
      });
    } catch (error) {
      clearFormulaAnalysis({ keepError: true });
      setFormulaAnalysisError(
        error instanceof Error ? error.message : '推演药路失败，请稍后再试。',
      );
      pushToast({
        message:
          error instanceof Error ? error.message : '推演药路失败，请稍后再试。',
        tone: 'danger',
      });
    } finally {
      setIsAnalyzingFormula(false);
    }
  };

  const handleSubmit = async () => {
    if (!cultivator) {
      pushToast({ message: '请先在首页觉醒灵根。', tone: 'warning' });
      return;
    }
    if (activeMode === 'formula' && !selectedFormulaId) {
      pushToast({ message: '请先选定丹方。', tone: 'warning' });
      return;
    }
    if (activeMode === 'formula' && !formulaAnalysis?.analysisId) {
      pushToast({ message: '请先推演药路。', tone: 'warning' });
      return;
    }
    if (selectedMaterialIds.length === 0) {
      pushToast({ message: '丹炉已备，只欠灵材。', tone: 'warning' });
      return;
    }
    if (activeMode === 'improvised' && !userPrompt.trim()) {
      pushToast({ message: '请先注入丹意。', tone: 'warning' });
      return;
    }
    if (previewError || validation?.valid === false || !displayCanAfford) {
      pushToast({ message: '当前炉况未稳，暂不可开炉。', tone: 'warning' });
      return;
    }
    openQiActionConfirm({
      actionName: activeMode === 'formula' ? '丹方炼丹' : '开炉炼丹',
      qiCost,
      confirmLabel: activeMode === 'formula' ? '依方成丹' : '开炉炼丹',
      onConfirm: async () => {
        setWorkspacePhase('firing');
        setSubmitting(true);
        setStatus(
          activeMode === 'formula'
            ? '丹方引火，炉势循脉而行……'
            : '地火回环，药性相搏……',
        );
        setCreatedConsumable(null);
        setCreatedConsumables([]);
        setCreatedCraftedConsumables([]);
        setCreatedYieldProfile(null);
        setFormulaDiscovery(null);
        setFormulaProgress(null);
        setIsResultModalOpen(false);
        setIsDiscoveryModalOpen(false);

        try {
          const result = await mutate<
            NonNullable<AlchemyCraftResponse['data']>
          >(
            fetch('/api/craft', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(submitPayload),
            }),
          );

          if (!result.consumable) {
            throw new Error('炼丹失败');
          }

          const nextConsumable = result.consumable;
          const nextConsumables = result.craftedConsumables?.length
            ? result.craftedConsumables
            : result.consumables?.length
              ? result.consumables
              : [nextConsumable];
          const discoveredFormula = result.formulaDiscovery ?? null;
          const totalQuantity = nextConsumables.reduce(
            (sum, item) => sum + item.quantity,
            0,
          );
          const successMessage = `【${nextConsumable.name}】丹成 ${totalQuantity} 枚，${nextConsumables.length} 个批次！`;
          setCreatedConsumable(nextConsumable);
          setCreatedConsumables(nextConsumables);
          setCreatedCraftedConsumables(nextConsumables);
          setCreatedYieldProfile(result.yieldProfile ?? null);
          setFormulaDiscovery(discoveredFormula);
          setFormulaProgress(result.formulaProgress ?? null);
          setWorkspacePhase('result');
          setIsResultModalOpen(false);
          setIsDiscoveryModalOpen(false);
          setCelebrationTick((prev) => prev + 1);
          setStatus(successMessage);
          pushToast({ message: successMessage, tone: 'success' });
          setSelectedMaterialIds([]);
          setSelectedMaterialMap({});
          setDoseMap({});
          setIsMaterialModalOpen(false);
          if (activeMode === 'improvised') {
            setUserPrompt('');
          }
          setPreviewState(DEFAULT_PREVIEW_STATE);
          clearFormulaAnalysis();
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes('请先推演药路')
          ) {
            clearFormulaAnalysis({ keepError: true });
            setFormulaAnalysisError(error.message);
          }
          const failMessage =
            error instanceof Error
              ? `炸炉了：${error.message}`
              : '炼丹失败，请稍后再试。';
          setStatus(failMessage);
          pushToast({ message: failMessage, tone: 'danger' });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleDiscoveryDecision = async (accept: boolean) => {
    if (!formulaDiscovery) {
      return;
    }

    setIsHandlingDiscovery(true);
    try {
      const response = await fetch('/api/alchemy/formulas/discovery/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: formulaDiscovery.token,
          accept,
        }),
      });
      const result: DiscoveryConfirmResponse = await response.json();

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || '丹方确认失败');
      }

      if (accept && result.data.saved && result.data.formula) {
        setSelectedFormulaId(result.data.formula.id);
        setSelectedFormulaSnapshot(result.data.formula);
        setFormulaPage(1);
        await loadFormulas({ page: 1 });
        pushToast({
          message: `已悟得【${result.data.formula.name}】`,
          tone: 'success',
        });
      } else if (!accept) {
        pushToast({
          message: '丹意散去，未留成方。',
          tone: 'default',
        });
      }

      setFormulaDiscovery(null);
      setIsDiscoveryModalOpen(false);
      setWorkspacePhase('idle');
    } catch (error) {
      pushToast({
        message:
          error instanceof Error ? error.message : '丹方确认失败，请稍后再试。',
        tone: 'danger',
      });
    } finally {
      setIsHandlingDiscovery(false);
    }
  };

  const openDeleteFormulaConfirm = (formula: AlchemyFormula) => {
    setDialog({
      id: `delete-formula-${formula.id}`,
      title: '删除丹方',
      content: (
        <div className="space-y-2 py-2 text-center">
          <p>
            确定要删去{' '}
            <span className="text-ink-primary font-bold">{formula.name}</span>{' '}
            吗？
          </p>
          <p className="text-ink-secondary text-xs">
            删除后将无法恢复，但已炼成丹药的来源记述不会受影响。
          </p>
        </div>
      ),
      confirmLabel: '删除丹方',
      cancelLabel: '作罢',
      loading: isDeletingFormula,
      loadingLabel: '删除中……',
      onConfirm: async () => {
        if (isDeletingFormula) {
          return;
        }

        try {
          setIsDeletingFormula(true);
          setDialog((currentDialog) =>
            currentDialog
              ? {
                  ...currentDialog,
                  loading: true,
                }
              : currentDialog,
          );

          const response = await fetch(`/api/alchemy/formulas/${formula.id}`, {
            method: 'DELETE',
          });
          const result: FormulaDeleteResponse = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(result.error || '丹方删除失败');
          }

          setPreviewState(DEFAULT_PREVIEW_STATE);
          clearFormulaAnalysis();
          if (selectedFormulaId === formula.id) {
            setSelectedFormulaId(null);
            setSelectedFormulaSnapshot(null);
          }
          await loadFormulas({
            page:
              formulas.length === 1 && formulaPagination.hasPreviousPage
                ? formulaPagination.page - 1
                : formulaPagination.page,
          });
          pushToast({
            message: result.message || `已删除【${formula.name}】`,
            tone: 'success',
          });
        } catch (error) {
          pushToast({
            message:
              error instanceof Error
                ? error.message
                : '丹方删除失败，请稍后再试。',
            tone: 'danger',
          });
        } finally {
          setIsDeletingFormula(false);
          setDialog((currentDialog) =>
            currentDialog
              ? {
                  ...currentDialog,
                  loading: false,
                }
              : currentDialog,
          );
        }
      },
    });
  };

  if (isLoading && !cultivator) {
    return <GameSceneLoading message="丹火温养中……" />;
  }

  const canObserveImprovised =
    !isFormulaMode &&
    selectedMaterialIds.length > 0 &&
    !!userPrompt.trim() &&
    hasFreshPreview &&
    estimatedSpiritStones !== null &&
    !previewError &&
    displayCanAfford &&
    displayValidation?.valid !== false;
  const fireState = describeFireState({
    preview: displayBatchPreview,
    blockingReason: displayValidation?.blockingReason,
    canAfford: displayCanAfford,
  });
  const essenceState = describeEssenceState(displayBatchPreview);
  const batchOmen = describeBatchOmen(displayBatchPreview);
  const formulaObservation = describeFormulaObservation(formulaAnalysis);
  const totalSelectedDose = selectedMaterialIds.reduce(
    (sum, id) => sum + (doseMap[id] ?? MIN_DOSE),
    0,
  );
  const totalCreatedQuantity = createdCraftedConsumables.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const furnaceActor = {
    id: sectContext ? 'sect-alchemy-furnace' : 'alchemy-furnace',
    sigil: '鼎',
    name: sectContext ? sectContext.facilityLabel : '玄火丹炉',
    identity: sectContext
      ? `宗门炼丹设施 · ${sectContext.facilityLevel}阶`
      : '炼丹设施',
    responsibility: sectContext
      ? `纳药、引火、聚蕴、凝丹 · 灵石减免 ${sectContext.discountPercent.toFixed(0)}%`
      : '纳药、引火、聚蕴、凝丹',
    appearance: 'facility' as const,
  };
  const furnaceMessages = [
    {
      id: 'furnace-state',
      body: describeFurnaceGreeting({
        phase: workspacePhase,
        materialCount: selectedMaterialIds.length,
        mode: activeMode,
      }),
      tone:
        fireState.tone === 'attention'
          ? ('attention' as const)
          : ('normal' as const),
    },
    ...(note
      ? [{ id: 'session-note', body: note, tone: 'muted' as const }]
      : []),
    ...(status && workspacePhase !== 'result'
      ? [{ id: 'status', body: status, tone: 'muted' as const }]
      : []),
  ];

  return (
    <>
      <NpcConversation
        actor={furnaceActor}
        messages={furnaceMessages}
        busy={isSubmitting || isAnalyzingFormula}
        error={previewError ?? formulaAnalysisError ?? undefined}
        options={[
          { id: 'guide', label: '察看炉理碑' },
          ...(workspacePhase !== 'idle'
            ? [{ id: 'restart', label: '封炉重来', tone: 'muted' as const }]
            : []),
          {
            id: 'leave',
            label: sectContext ? '返回丹房执事' : '返回炼丹房',
            tone: 'muted',
          },
        ]}
        onSelectOption={(optionId) => {
          if (optionId === 'guide') setIsGuideModalOpen(true);
          else if (optionId === 'restart') resetAll();
          else if (optionId === 'leave') {
            if (sectContext?.onExit) sectContext.onExit();
            else onExit?.();
          }
        }}
        actions={
          workspacePhase === 'idle' ? (
            <>
              <InkButton
                variant="primary"
                onClick={() => handleModeChange('improvised')}
                disabled={isSubmitting}
              >
                随心起炉
              </InkButton>
              <InkButton
                onClick={() => handleModeChange('formula')}
                disabled={isSubmitting}
              >
                依照丹方炼制
              </InkButton>
            </>
          ) : workspacePhase === 'preparing' ? (
            <>
              {isFormulaMode && !selectedFormula ? (
                <InkButton
                  variant="primary"
                  onClick={() => setIsFormulaSelectionModalOpen(true)}
                  disabled={isSubmitting}
                >
                  将丹方玉简置于炉前
                </InkButton>
              ) : isFormulaMode ? (
                <InkButton
                  variant="primary"
                  onClick={() => void handleAnalyzeFormula()}
                  disabled={!canAnalyzeFormula}
                  pending={isAnalyzingFormula}
                  pendingLabel="推演药路中……"
                >
                  推演药路
                </InkButton>
              ) : (
                <InkButton
                  variant="primary"
                  onClick={() => setWorkspacePhase('observing')}
                  disabled={!canObserveImprovised}
                >
                  观火辨药
                </InkButton>
              )}
            </>
          ) : workspacePhase === 'observing' ? (
            <>
              <InkButton
                variant="primary"
                onClick={() => setWorkspacePhase('confirming')}
                disabled={
                  isFormulaMode ? !canCraftFormula : !canObserveImprovised
                }
              >
                引火前再核一遍
              </InkButton>
              <InkButton onClick={() => setWorkspacePhase('preparing')}>
                调整炉材与炉法
              </InkButton>
            </>
          ) : workspacePhase === 'confirming' ? (
            <>
              <InkButton
                variant="primary"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
              >
                引动地火，正式开炉
              </InkButton>
              <InkButton onClick={() => setWorkspacePhase('observing')}>
                再察看一遍
              </InkButton>
            </>
          ) : workspacePhase === 'result' ? (
            <>
              <InkButton
                variant="primary"
                onClick={() => setIsResultModalOpen(true)}
                disabled={!createdConsumable}
              >
                查看主丹与各批次详情
              </InkButton>
              <InkButton
                onClick={() => {
                  if (formulaDiscovery) setIsDiscoveryModalOpen(true);
                  else resetAll();
                }}
              >
                {formulaDiscovery ? '收丹并察看炼丹余韵' : '收丹，再起一炉'}
              </InkButton>
            </>
          ) : undefined
        }
      >
        <div className="space-y-5">
          {workspacePhase !== 'idle' ? (
            <AlchemyPhaseRail phase={workspacePhase} />
          ) : null}

          {workspacePhase === 'idle' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <FurnaceChoice
                title="随心起炉"
                description="不循旧方，让灵材药性与一缕丹意共同决定最终丹形。"
                detail="适合试验新配伍，并有机会从成丹余韵中悟得丹方。"
              />
              <FurnaceChoice
                title="依方炼制"
                description="先定丹方，再让炉火沿着已经掌握的药路收束。"
                detail="可累积丹方熟练，但炉材仍需经过一次炉前推演。"
              />
            </div>
          ) : null}

          {workspacePhase === 'preparing' ? (
            <>
              {isFormulaMode ? (
                <AlchemyWorkspaceSection title="丹方火纹" eyebrow="定法">
                  {selectedFormula ? (
                    <div className="space-y-3">
                      <AlchemyFormulaSummaryCard formula={selectedFormula} />
                      <InkButton
                        variant="outline"
                        onClick={() => setIsFormulaSelectionModalOpen(true)}
                        disabled={isSubmitting}
                      >
                        更换丹方玉简
                      </InkButton>
                    </div>
                  ) : (
                    <InkNotice tone="info">
                      炉壁上的火纹仍是空白。先选定一份丹方，才能安排这一炉药路。
                    </InkNotice>
                  )}
                </AlchemyWorkspaceSection>
              ) : null}

              <AlchemyWorkspaceSection title="炉前药盘" eyebrow="投药">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-ink-secondary text-sm">
                    已备 {selectedMaterialIds.length} 种灵材，共{' '}
                    {totalSelectedDose} 份
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <InkButton
                      variant="outline"
                      onClick={() => setIsMaterialModalOpen(true)}
                      disabled={!canChooseMaterials}
                    >
                      打开百草药匣
                    </InkButton>
                    <InkButton
                      variant="outline"
                      onClick={() => {
                        clearFormulaAnalysis();
                        setDoseMap((current) => {
                          const next = { ...current };
                          for (const id of selectedMaterialIds) {
                            next[id] = Math.min(
                              MAX_DOSE,
                              selectedMaterialMap[id]?.quantity ?? MIN_DOSE,
                            );
                          }
                          return next;
                        });
                      }}
                      disabled={
                        !selectedMaterialIds.length || !canChooseMaterials
                      }
                    >
                      投入所选全部
                    </InkButton>
                  </div>
                </div>
                {selectedMaterialIds.length ? (
                  <SelectedMaterialsWithDose
                    selectedIds={selectedMaterialIds}
                    materialMap={selectedMaterialMap}
                    doseMap={doseMap}
                    minDose={MIN_DOSE}
                    maxDose={MAX_DOSE}
                    disabled={!canChooseMaterials}
                    judgmentMap={formulaJudgmentMap}
                    sortByJudgment={isFormulaMode && !!formulaAnalysis}
                    onRemove={toggleMaterial}
                    onDoseChange={handleDoseChange}
                  />
                ) : (
                  <div className="border-ink/15 text-ink-secondary border border-dashed px-4 py-8 text-center text-sm leading-7">
                    炉盖已经打开。先从百草药匣中挑选灵材，药盘才会显出剂量与药性。
                  </div>
                )}
              </AlchemyWorkspaceSection>

              {!isFormulaMode ? (
                <AlchemyWorkspaceSection
                  title="向炉中注入一缕丹意"
                  eyebrow="定法"
                >
                  <p className="text-ink-secondary mb-3 text-sm leading-7">
                    说清希望药力归于何处，不必预先写定丹名。炉火会根据灵材与心意自行凝形。
                  </p>
                  <InkInput
                    label="这一炉所求"
                    placeholder="例如：疗伤回元，药性温和，不要留下太重丹毒……"
                    value={userPrompt}
                    onChange={setUserPrompt}
                    multiline
                    rows={3}
                    disabled={isSubmitting}
                  />
                  {isStarterAlchemyTask ? (
                    <InkButton
                      className="mt-3"
                      variant="outline"
                      onClick={() => setUserPrompt(STARTER_ALCHEMY_PROMPT)}
                    >
                      借用第一炉丹意
                    </InkButton>
                  ) : null}
                </AlchemyWorkspaceSection>
              ) : null}

              <div className="border-ink/10 bg-ink/[0.025] grid gap-3 border p-4 text-sm sm:grid-cols-3">
                <FurnaceMetric
                  label="地火耗费"
                  value={
                    estimatedSpiritStones === null
                      ? '待验材'
                      : `${estimatedSpiritStones} 灵石`
                  }
                />
                <FurnaceMetric
                  label="灵石余额"
                  value={`${cultivator?.spirit_stones ?? 0}`}
                />
                <FurnaceMetric
                  label="炉前状态"
                  value={fireState.label}
                  attention={fireState.tone === 'attention'}
                />
              </div>
              {displayValidation?.blockingReason ? (
                <InkNotice tone="warning">
                  {displayValidation.blockingReason}
                </InkNotice>
              ) : null}
            </>
          ) : null}

          {workspacePhase === 'observing' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <ObservationCard
                  title="炉火"
                  value={fireState.label}
                  attention={fireState.tone === 'attention'}
                >
                  {fireState.description}
                </ObservationCard>
                <ObservationCard title="药蕴" value={essenceState.label}>
                  {essenceState.description}
                </ObservationCard>
                <ObservationCard
                  title="主丹征兆"
                  value={`${displayBatchPreview?.primaryQualityRange.min ?? '未显'}～${displayBatchPreview?.primaryQualityRange.max ?? '未显'}`}
                >
                  {batchOmen.primary}
                </ObservationCard>
                <ObservationCard
                  title="同炉副丹"
                  value={
                    displayBatchPreview?.likelyLots.length
                      ? `${displayBatchPreview.likelyLots.length}类征兆`
                      : '未显'
                  }
                >
                  {batchOmen.secondary}
                </ObservationCard>
              </div>
              <AlchemyWorkspaceSection title="丹纹与药路" eyebrow="细察">
                <div className="space-y-2 text-sm leading-7">
                  <p>
                    品相倾向：
                    {describeAppearanceTendency(
                      displayBatchPreview?.appearanceHints,
                    )}
                  </p>
                  {formulaObservation ? <p>{formulaObservation}</p> : null}
                  {displayBatchPreview?.summary ? (
                    <p>{displayBatchPreview.summary}</p>
                  ) : null}
                  {displayPreviewWarnings.map((warning) => (
                    <p key={warning} className="text-crimson">
                      {warning}
                    </p>
                  ))}
                </div>
              </AlchemyWorkspaceSection>
              <AlchemyWorkspaceSection title="细察药蕴" eyebrow="数值">
                <div className="grid gap-3 text-sm sm:grid-cols-4">
                  <FurnaceMetric
                    label="灵材"
                    value={`${selectedMaterialIds.length}味 · ${totalSelectedDose}份`}
                  />
                  <FurnaceMetric
                    label="预计成丹"
                    value={
                      displayBatchPreview
                        ? `${displayBatchPreview.totalQuantityRange.min}～${displayBatchPreview.totalQuantityRange.max}枚`
                        : '未显'
                    }
                  />
                  <FurnaceMetric
                    label="药蕴损耗"
                    value={
                      displayBatchPreview
                        ? `${Math.round(displayBatchPreview.essenceLossRatioRange.min * 100)}%～${Math.round(displayBatchPreview.essenceLossRatioRange.max * 100)}%`
                        : '未显'
                    }
                  />
                  <FurnaceMetric
                    label="灵石"
                    value={
                      estimatedSpiritStones === null
                        ? '未核'
                        : `${estimatedSpiritStones}枚`
                    }
                  />
                </div>
              </AlchemyWorkspaceSection>
            </>
          ) : null}

          {workspacePhase === 'confirming' ? (
            <AlchemyWorkspaceSection title="引火之前" eyebrow="最终确认">
              <p className="text-ink mb-4 leading-8">
                药材已经沉入炉腹，丹意也已附着于火纹。此刻引动地火，最终成丹的数量、品质与品相才会真正落定。
              </p>
              <div className="divide-ink/10 border-ink/15 divide-y border text-sm">
                <ConfirmationRow
                  label="炉法"
                  value={
                    isFormulaMode
                      ? `依方炼制 · ${selectedFormula?.name ?? '未定丹方'}`
                      : '随心起炉'
                  }
                />
                <ConfirmationRow
                  label="投入"
                  value={`${selectedMaterialIds.length}味灵材，共${totalSelectedDose}份`}
                />
                <ConfirmationRow
                  label="耗费"
                  value={`${estimatedSpiritStones ?? 0}灵石 · ${qiCost}气`}
                />
                <ConfirmationRow
                  label="预计成丹"
                  value={
                    displayBatchPreview
                      ? `${displayBatchPreview.totalQuantityRange.min}～${displayBatchPreview.totalQuantityRange.max}枚`
                      : '未显'
                  }
                />
                <ConfirmationRow label="主丹征兆" value={batchOmen.primary} />
                <ConfirmationRow
                  label="炉况"
                  value={fireState.label}
                  attention={fireState.tone === 'attention'}
                />
              </div>
            </AlchemyWorkspaceSection>
          ) : null}

          {workspacePhase === 'firing' ? (
            <div className="border-crimson/25 bg-crimson/[0.035] relative overflow-hidden border px-5 py-14 text-center">
              <div className="bg-crimson/10 absolute inset-x-[18%] bottom-0 h-24 rounded-[50%] blur-2xl" />
              <div className="relative">
                <div className="text-crimson animate-pulse text-6xl">鼎</div>
                <p className="text-ink mt-5 text-lg">
                  药气入炉 · 炉火合药 · 药蕴凝丹
                </p>
                <p className="text-ink-secondary mt-2 text-sm leading-7">
                  最终批次正在服务端结算。炉火不会提前泄露已经落定的品质与品相。
                </p>
              </div>
            </div>
          ) : null}

          {workspacePhase === 'result' && createdConsumable ? (
            <>
              <div className="border-wood/30 bg-wood/10 border px-5 py-5 text-center">
                <p className="text-ink-secondary text-xs tracking-[0.3em]">
                  丹成启炉
                </p>
                <p className="text-wood mt-2 text-2xl font-bold">
                  本炉共得 {totalCreatedQuantity} 枚丹药
                </p>
                <p className="text-ink-secondary mt-2 text-sm">
                  主丹已成，另有{' '}
                  {Math.max(0, createdCraftedConsumables.length - 1)}{' '}
                  批副丹随炉凝结。
                </p>
              </div>
              <AlchemyWorkspaceSection title="本炉主丹" eyebrow="收丹">
                <BatchResultRow
                  item={createdCraftedConsumables[0] ?? createdConsumable}
                  primary
                />
              </AlchemyWorkspaceSection>
              {createdCraftedConsumables.length > 1 ? (
                <AlchemyWorkspaceSection title="同炉副丹" eyebrow="批次">
                  <div className="space-y-2">
                    {createdCraftedConsumables.slice(1).map((item, index) => (
                      <BatchResultRow key={`${item.id}-${index}`} item={item} />
                    ))}
                  </div>
                </AlchemyWorkspaceSection>
              ) : null}
              {createdYieldProfile ? (
                <p className="text-ink-secondary text-sm leading-7">
                  本炉药蕴损耗约{' '}
                  {Math.round(createdYieldProfile.essenceLossRatio * 100)}%。
                  {createdYieldProfile.distributionSummary}
                </p>
              ) : null}
              {formulaProgress ? (
                <InkNotice tone="info">
                  丹方熟练 +{formulaProgress.gainedExp}，当前 Lv.
                  {formulaProgress.level}。
                </InkNotice>
              ) : null}
            </>
          ) : null}
        </div>
      </NpcConversation>

      <MaterialSelectionModal
        isOpen={isMaterialModalOpen}
        onClose={() => setIsMaterialModalOpen(false)}
        title="打开百草药匣"
        maxMaterials={MAX_MATERIALS}
        cultivatorId={cultivator?.id}
        selectedMaterialIds={selectedMaterialIds}
        onToggleMaterial={toggleMaterial}
        selectedMaterialMap={selectedMaterialMap}
        isSubmitting={isSubmitting}
        pageSize={20}
        includeMaterialTypes={[...ALLOWED_MATERIAL_TYPES] as MaterialType[]}
        loadingText="正在检索储物袋中的灵材，请稍候……"
        emptyNoticeText="暂无可用于炼丹的材料。"
        totalText={(total) => `共 ${total} 份可用于炼丹的材料`}
      />

      <AlchemyFormulaSelectionModal
        isOpen={isFormulaSelectionModalOpen}
        onClose={() => setIsFormulaSelectionModalOpen(false)}
        formulas={formulas}
        selectedFormulaId={selectedFormulaId}
        isLoading={isLoadingFormulas}
        error={formulasError}
        search={formulaSearch}
        familyFilter={formulaFamilyFilter}
        pagination={formulaPagination}
        isDeleting={isDeletingFormula}
        isSubmitting={isSubmitting}
        onSearchChange={(value) => {
          setFormulaSearch(value);
          setFormulaPage(1);
        }}
        onFamilyFilterChange={(value) => {
          setFormulaFamilyFilter(value);
          setFormulaPage(1);
        }}
        onPageChange={setFormulaPage}
        onSelectFormula={(formula) => {
          clearFormulaAnalysis();
          setSelectedFormulaId(formula.id);
          setSelectedFormulaSnapshot(formula);
          setPreviewState(DEFAULT_PREVIEW_STATE);
          setIsFormulaSelectionModalOpen(false);
        }}
        onDeleteFormula={openDeleteFormulaConfirm}
      />

      <AlchemyResultModal
        consumable={createdConsumable}
        consumables={createdConsumables}
        craftedConsumables={createdCraftedConsumables}
        yieldProfile={createdYieldProfile ?? undefined}
        formulaProgress={formulaProgress}
        isOpen={isResultModalOpen}
        onClose={() => {
          setIsResultModalOpen(false);
          if (formulaDiscovery) setIsDiscoveryModalOpen(true);
        }}
        viewerRealm={cultivator?.realm}
      />

      <AlchemyFormulaDiscoveryModal
        formulaDiscovery={formulaDiscovery}
        isHandlingDiscovery={isHandlingDiscovery}
        isOpen={isDiscoveryModalOpen}
        onAcceptDiscovery={() => void handleDiscoveryDecision(true)}
        onRejectDiscovery={() => void handleDiscoveryDecision(false)}
      />

      <AlchemyFormulaAnalysisModal
        analysis={formulaAnalysis}
        cooldownRemainingSeconds={analysisCooldownRemaining}
        isOpen={isFormulaAnalysisModalOpen}
        isCrafting={isSubmitting}
        onClose={() => setIsFormulaAnalysisModalOpen(false)}
        onCraft={() => {
          setIsFormulaAnalysisModalOpen(false);
          setWorkspacePhase('confirming');
        }}
      />

      <AlchemyGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />

      <InkDialog
        dialog={dialog}
        onClose={() => {
          if (!isDeletingFormula) setDialog(null);
        }}
      />

      {celebrationTick > 0 ? (
        <InkIdentifyCelebration key={celebrationTick} variant="basic" />
      ) : null}
    </>
  );
}

function AlchemyPhaseRail({ phase }: { phase: AlchemyWorkspacePhase }) {
  const steps: Array<{ key: AlchemyWorkspacePhase; label: string }> = [
    { key: 'preparing', label: '投药定法' },
    { key: 'observing', label: '观火辨药' },
    { key: 'confirming', label: '核炉引火' },
    { key: 'firing', label: '聚蕴凝丹' },
    { key: 'result', label: '开鼎收丹' },
  ];
  const current = steps.findIndex((step) => step.key === phase);
  return (
    <ol className="border-ink/10 grid grid-cols-5 border-y py-3 text-center text-[0.68rem] sm:text-xs">
      {steps.map((step, index) => (
        <li
          key={step.key}
          className={cn(
            'border-ink/10 px-1 not-last:border-r',
            index === current
              ? 'text-crimson font-semibold'
              : index < current
                ? 'text-ink'
                : 'text-ink-secondary',
          )}
        >
          <span className="block text-[0.6rem] opacity-60">{index + 1}</span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function FurnaceChoice({
  title,
  description,
  detail,
}: {
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <div className="border-ink/15 bg-ink/[0.025] border border-dashed p-4">
      <h3 className="text-ink text-lg">{title}</h3>
      <p className="text-ink mt-2 text-sm leading-7">{description}</p>
      <p className="text-ink-secondary mt-2 text-xs leading-6">{detail}</p>
    </div>
  );
}

function AlchemyWorkspaceSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-ink/15 border border-dashed p-4 sm:p-5">
      <p className="text-crimson text-[0.68rem] tracking-[0.24em]">{eyebrow}</p>
      <h3 className="text-ink mt-1 text-lg">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FurnaceMetric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <div>
      <div className="text-ink-secondary text-xs">{label}</div>
      <div
        className={cn(
          'mt-1 font-semibold',
          attention ? 'text-crimson' : 'text-ink',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ObservationCard({
  title,
  value,
  attention = false,
  children,
}: {
  title: string;
  value: string;
  attention?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-ink/15 bg-ink/[0.025] border p-4">
      <p className="text-ink-secondary text-xs tracking-[0.18em]">{title}</p>
      <p
        className={cn(
          'mt-2 text-lg font-semibold',
          attention ? 'text-crimson' : 'text-ink',
        )}
      >
        {value}
      </p>
      <p className="text-ink-secondary mt-2 text-sm leading-7">{children}</p>
    </section>
  );
}

function ConfirmationRow({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <span className="text-ink-secondary">{label}</span>
      <span className={attention ? 'text-crimson' : 'text-ink'}>{value}</span>
    </div>
  );
}

function BatchResultRow({
  item,
  primary = false,
}: {
  item: Consumable;
  primary?: boolean;
}) {
  const appearance = isPillConsumable(item)
    ? getPillAppearanceLabel(item.spec.alchemyMeta.appearance)
    : '丹药';
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border px-4 py-3',
        primary ? 'border-wood/35 bg-wood/10' : 'border-ink/10',
      )}
    >
      <div className="min-w-0">
        <p className="text-ink truncate font-semibold">{item.name}</p>
        <p className="text-ink-secondary mt-1 text-xs">
          {item.quality ?? '凡品'} · {appearance}
        </p>
      </div>
      <strong className={primary ? 'text-wood text-xl' : 'text-ink'}>
        ×{item.quantity}
      </strong>
    </div>
  );
}
export default AlchemyScene;

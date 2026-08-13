import {
  MaterialSelectionModal,
  SelectedMaterialsWithDose,
} from '@app/components/feature/creation';
import { InkButton, InkNotice, inkFieldVariants } from '@app/components/ui';
import { STARTER_ALCHEMY_PROMPT } from '@app/lib/alchemy/starterAlchemy';
import { useState } from 'react';
import {
  ALCHEMY_MAX_DOSE,
  ALCHEMY_MAX_MATERIALS,
  ALCHEMY_MIN_DOSE,
  useAlchemyCraftSession,
} from '../alchemyCraftContext';
import { FormulaPickerModal } from '../FormulaPickerModal';

const MATERIAL_TYPES = ['herb', 'ore', 'monster', 'tcdb', 'aux'] as const;

export function FurnacePreparationStage() {
  const session = useAlchemyCraftSession();
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [formulaPickerOpen, setFormulaPickerOpen] = useState(false);
  const canObserve =
    session.readyForObservation &&
    (session.mode === 'formula'
      ? Boolean(session.formula)
      : Boolean(session.intent.trim()));
  return (
    <div className="space-y-6">
      <section>
        <p className="text-ink-secondary mb-3 text-xs tracking-[0.2em]">
          炼制方式
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice
            active={session.mode === 'improvised'}
            title="随心炼丹"
            detail="以材料药性和一句丹意引导成丹，可能悟得新方。"
            onClick={() => session.setMode('improvised')}
          />
          <Choice
            active={session.mode === 'formula'}
            title="依方炼制"
            detail="选择已有丹方，观火时统一推演本炉配伍。"
            onClick={() => session.setMode('formula')}
          />
        </div>
      </section>

      {session.mode === 'improvised' ? (
        <section>
          <label className="block">
            <span className="text-ink-secondary text-xs tracking-[0.2em]">
              注入丹意
            </span>
            <textarea
              className={`${inkFieldVariants()} mt-3 min-h-28 resize-y`}
              value={session.intent}
              maxLength={300}
              placeholder="例如：以温养经脉、缓复气血为主，不求猛烈。"
              onChange={(event) => session.setIntent(event.target.value)}
            />
          </label>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span>
              {session.starterTask ? (
                <InkButton
                  variant="secondary"
                  onClick={() => session.setIntent(STARTER_ALCHEMY_PROMPT)}
                >
                  借用第一炉丹意
                </InkButton>
              ) : null}
            </span>
            <span className="text-ink-secondary text-xs">
              {session.intent.length} / 300
            </span>
          </div>
        </section>
      ) : (
        <section className="border-ink/15 border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-ink-secondary text-xs tracking-[0.2em]">
                本炉丹方
              </p>
              <p className="mt-2 text-lg">
                {session.formula?.name ?? '尚未选择'}
              </p>
              {session.formula ? (
                <p className="text-ink-secondary mt-1 text-xs">
                  熟练 Lv.{session.formula.mastery.level}
                </p>
              ) : null}
            </div>
            <InkButton
              variant={session.formula ? 'secondary' : 'primary'}
              onClick={() => setFormulaPickerOpen(true)}
            >
              {session.formula ? '更换丹方' : '选择丹方'}
            </InkButton>
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-ink-secondary text-xs tracking-[0.2em]">
              本炉材料
            </p>
            <p className="mt-1 text-sm">
              {session.materials.ids.length} / {ALCHEMY_MAX_MATERIALS} 味 · 共{' '}
              {session.totalDose} 份
            </p>
          </div>
          <InkButton
            variant="secondary"
            onClick={() => setMaterialPickerOpen(true)}
          >
            选择灵材
          </InkButton>
        </div>
        <SelectedMaterialsWithDose
          selectedIds={session.materials.ids}
          materialMap={session.materials.map}
          doseMap={session.materials.doses}
          minDose={ALCHEMY_MIN_DOSE}
          maxDose={ALCHEMY_MAX_DOSE}
          disabled={session.submitting}
          onRemove={session.removeMaterial}
          onDoseChange={session.setMaterialDose}
        />
      </section>

      {session.preview.loading ? (
        <InkNotice tone="info">炉火正在辨认新配伍……</InkNotice>
      ) : null}
      {session.preview.previewError ? (
        <InkNotice tone="warning">{session.preview.previewError}</InkNotice>
      ) : null}
      {session.preview.validation?.blockingReason ? (
        <InkNotice tone="warning">
          {session.preview.validation.blockingReason}
        </InkNotice>
      ) : null}
      {session.analysis.error ? (
        <InkNotice tone="warning">{session.analysis.error}</InkNotice>
      ) : null}

      <div className="flex justify-end">
        <InkButton
          variant="primary"
          pending={session.analysis.loading}
          pendingLabel="推演药路……"
          disabled={!canObserve || session.analysis.cooldownRemaining > 0}
          onClick={() => void session.observe()}
        >
          {session.analysis.cooldownRemaining > 0
            ? `${session.analysis.cooldownRemaining} 秒后可再观火`
            : '观火推演'}
        </InkButton>
      </div>

      <MaterialSelectionModal
        isOpen={materialPickerOpen}
        onClose={() => setMaterialPickerOpen(false)}
        title="选择本炉灵材"
        maxMaterials={ALCHEMY_MAX_MATERIALS}
        cultivatorId={session.cultivator?.id}
        selectedMaterialIds={session.materials.ids}
        selectedMaterialMap={session.materials.map}
        onToggleMaterial={session.toggleMaterial}
        isSubmitting={session.submitting}
        includeMaterialTypes={[...MATERIAL_TYPES]}
        pageSize={16}
        loadingText="正在展开药材名录……"
        emptyNoticeText="暂无可用于炼丹的材料。"
        totalText={(total) => `共 ${total} 份可用材料`}
      />
      <FormulaPickerModal
        isOpen={formulaPickerOpen}
        selectedId={session.formula?.id}
        onClose={() => setFormulaPickerOpen(false)}
        onSelect={session.selectFormula}
      />
    </div>
  );
}

function Choice({
  active,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  title: string;
  detail: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-28 border p-4 text-left transition-colors ${active ? 'border-crimson bg-crimson/5' : 'border-ink/15 hover:border-crimson/35'}`}
    >
      <span className="text-lg">{title}</span>
      <span className="text-ink-secondary mt-2 block text-sm leading-6">
        {detail}
      </span>
    </button>
  );
}

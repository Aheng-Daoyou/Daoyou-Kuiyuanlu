import { useQiActionConfirm } from '@app/components/feature/cultivator/useQiActionConfirm';
import { useInkUI } from '@app/components/providers/InkUIProvider';
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
import type { AlchemyFormula, AlchemyMode } from '@shared/types/consumable';
import type { Material } from '@shared/types/cultivator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AddMaterialResult,
  AlchemyResultState,
  AlchemySectContext,
  AlchemyWorkspacePhase,
  FormulaAnalysisState,
  MaterialDraft,
  PreviewState,
} from './alchemyTypes';

export const ALCHEMY_MIN_DOSE =
  CREATION_INPUT_CONSTRAINTS.minQuantityPerMaterial;
export const ALCHEMY_MAX_MATERIALS =
  CREATION_INPUT_CONSTRAINTS.maxMaterialKinds;
export { ALCHEMY_MAX_DOSE };

const EMPTY_MATERIALS: MaterialDraft = { ids: [], map: {}, doses: {} };
const EMPTY_PREVIEW: PreviewState = {
  key: null,
  estimatedSpiritStones: null,
  validation: null,
  batchPreview: null,
  canAfford: true,
  previewError: null,
  loading: false,
};
const EMPTY_RESULT: AlchemyResultState = {
  consumable: null,
  consumables: [],
  craftedConsumables: [],
  yieldProfile: null,
  formulaDiscovery: null,
  formulaProgress: null,
};
const EMPTY_ANALYSIS: FormulaAnalysisState = {
  value: null,
  loading: false,
  error: null,
  cooldownRemaining: 0,
};

type PreviewResponse = {
  success: boolean;
  data?: {
    cost: { spiritStones: number };
    canAfford: boolean;
    validation: PreviewState['validation'];
    batchPreview?: PreviewState['batchPreview'];
  };
  error?: string;
};
type AnalyzeResponse = {
  success: boolean;
  data?: FormulaAnalysisState['value'];
  error?: string;
  remainingSeconds?: number;
};
type DiscoveryResponse = {
  success: boolean;
  data?: { saved: boolean; formula?: AlchemyFormula };
  error?: string;
};
type CraftResult = Omit<
  AlchemyResultState,
  'formulaDiscovery' | 'formulaProgress'
> & {
  formulaDiscovery?: AlchemyResultState['formulaDiscovery'];
  formulaProgress?: AlchemyResultState['formulaProgress'];
};

export function useAlchemyCraftSessionState(sectContext?: AlchemySectContext) {
  const profile = useCultivatorIdentity();
  const currency = useCultivatorCurrency();
  const playerSession = usePlayerSession();
  const identity = profile.data?.cultivator;
  const cultivator = useMemo(
    () =>
      identity?.id && currency.data
        ? {
            id: identity.id,
            realm: identity.realm,
            spiritStones: currency.data.spiritStones,
          }
        : null,
    [currency.data, identity?.id, identity?.realm],
  );
  const { mutate } = useResourceMutation();
  const { pushToast } = useInkUI();
  const { openQiActionConfirm } = useQiActionConfirm();
  const { tasks } = useTaskList(cultivator?.id);
  const starterTask = useMemo(
    () =>
      findNextTutorialTask(tasks ?? [])?.definitionId ===
      'tutorial_first_alchemy',
    [tasks],
  );

  const [phase, setPhase] = useState<AlchemyWorkspacePhase>('preparing');
  const [mode, setModeState] = useState<AlchemyMode>('improvised');
  const [intent, setIntentState] = useState('');
  const [formula, setFormula] = useState<AlchemyFormula | null>(null);
  const [materials, setMaterials] = useState<MaterialDraft>(EMPTY_MATERIALS);
  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW);
  const [analysis, setAnalysis] =
    useState<FormulaAnalysisState>(EMPTY_ANALYSIS);
  const [result, setResult] = useState<AlchemyResultState>(EMPTY_RESULT);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const analysisKeyRef = useRef<string | null>(null);
  const analysisExpiryTimerRef = useRef<number | null>(null);

  const materialQuantities = useMemo(
    () =>
      Object.fromEntries(
        materials.ids.map((id) => [
          id,
          materials.doses[id] ?? ALCHEMY_MIN_DOSE,
        ]),
      ),
    [materials.doses, materials.ids],
  );
  const selectionKey = useMemo(
    () =>
      JSON.stringify({
        mode,
        formulaId: formula?.id ?? null,
        ids: materials.ids,
        materialQuantities,
      }),
    [formula?.id, materialQuantities, materials.ids, mode],
  );
  const qiCost =
    mode === 'formula'
      ? QI_ACTION_COSTS.alchemy_formula
      : QI_ACTION_COSTS.alchemy_improvised;
  const readyForPreview =
    materials.ids.length > 0 && (mode === 'improvised' || Boolean(formula));
  const previewIsFresh =
    preview.key === selectionKey &&
    preview.estimatedSpiritStones !== null &&
    !preview.loading;
  const readyForObservation = Boolean(
    readyForPreview &&
    previewIsFresh &&
    preview.validation?.valid !== false &&
    preview.canAfford &&
    !preview.previewError,
  );
  const readyForFiring =
    phase === 'observing' &&
    readyForObservation &&
    (mode === 'improvised'
      ? Boolean(intent.trim())
      : Boolean(
          analysis.value?.analysisId && analysisKeyRef.current === selectionKey,
        ));

  const clearAnalysis = useCallback(() => {
    if (analysisExpiryTimerRef.current !== null) {
      window.clearTimeout(analysisExpiryTimerRef.current);
      analysisExpiryTimerRef.current = null;
    }
    analysisKeyRef.current = null;
    setAnalysis((current) => ({
      ...EMPTY_ANALYSIS,
      cooldownRemaining: current.cooldownRemaining,
    }));
  }, []);

  const invalidateObservation = useCallback(() => {
    setPhase('preparing');
    setPreview(EMPTY_PREVIEW);
    setResult(EMPTY_RESULT);
    setStatus('');
    clearAnalysis();
  }, [clearAnalysis]);

  const setMode = useCallback(
    (nextMode: AlchemyMode) => {
      if (nextMode === mode) return;
      setModeState(nextMode);
      invalidateObservation();
    },
    [invalidateObservation, mode],
  );

  const setIntent = useCallback(
    (nextIntent: string) => {
      setIntentState(nextIntent);
      if (phase !== 'preparing') setPhase('preparing');
      setResult(EMPTY_RESULT);
      setStatus('');
      clearAnalysis();
    },
    [clearAnalysis, phase],
  );

  const selectFormula = useCallback(
    (nextFormula: AlchemyFormula) => {
      if (phase === 'result') {
        setMaterials(EMPTY_MATERIALS);
        setIntentState('');
      }
      setFormula(nextFormula);
      setModeState('formula');
      invalidateObservation();
    },
    [invalidateObservation, phase],
  );

  const addMaterialToFurnace = useCallback(
    (material: Material): AddMaterialResult => {
      if (!material.id) return 'limit-reached';
      if (materials.ids.includes(material.id)) return 'already-added';
      if (phase !== 'result' && materials.ids.length >= ALCHEMY_MAX_MATERIALS)
        return 'limit-reached';
      if (phase === 'result') {
        setMaterials({
          ids: [material.id],
          map: { [material.id]: material },
          doses: { [material.id]: ALCHEMY_MIN_DOSE },
        });
      } else {
        setMaterials((current) => ({
          ids: [...current.ids, material.id!],
          map: { ...current.map, [material.id!]: material },
          doses: { ...current.doses, [material.id!]: ALCHEMY_MIN_DOSE },
        }));
      }
      invalidateObservation();
      return 'added';
    },
    [invalidateObservation, materials.ids, phase],
  );

  const removeMaterial = useCallback(
    (id: string) => {
      setMaterials((current) => {
        const map = { ...current.map };
        const doses = { ...current.doses };
        delete map[id];
        delete doses[id];
        return {
          ids: current.ids.filter((item) => item !== id),
          map,
          doses,
        };
      });
      invalidateObservation();
    },
    [invalidateObservation],
  );

  const toggleMaterial = useCallback(
    (id: string, material?: Material) => {
      if (materials.ids.includes(id)) {
        removeMaterial(id);
        return;
      }
      if (!material) return;
      const outcome = addMaterialToFurnace(material);
      if (outcome === 'limit-reached')
        pushToast({
          message: `一炉最多投入 ${ALCHEMY_MAX_MATERIALS} 种灵材。`,
          tone: 'warning',
        });
    },
    [addMaterialToFurnace, materials.ids, pushToast, removeMaterial],
  );

  const setMaterialDose = useCallback(
    (id: string, dose: number) => {
      const material = materials.map[id];
      const available = Math.max(
        ALCHEMY_MIN_DOSE,
        material?.quantity ?? ALCHEMY_MAX_DOSE,
      );
      const next = Math.max(
        ALCHEMY_MIN_DOSE,
        Math.min(ALCHEMY_MAX_DOSE, available, Math.floor(dose)),
      );
      setMaterials((current) => ({
        ...current,
        doses: { ...current.doses, [id]: next },
      }));
      invalidateObservation();
    },
    [invalidateObservation, materials.map],
  );

  useEffect(() => {
    if (!readyForPreview) {
      setPreview(EMPTY_PREVIEW);
      return;
    }
    const params = new URLSearchParams({
      craftType: 'alchemy',
      alchemyMode: mode,
      materialIds: materials.ids.join(','),
      materialQuantities: JSON.stringify(materialQuantities),
    });
    if (mode === 'formula' && formula?.id) params.set('formulaId', formula.id);
    const controller = new AbortController();
    setPreview((current) => ({
      ...current,
      key: selectionKey,
      loading: true,
      previewError: null,
    }));
    void fetch(`/api/craft?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => ({
        response,
        body: (await response.json()) as PreviewResponse,
      }))
      .then(({ response, body }) => {
        if (!response.ok || !body.success || !body.data)
          throw new Error(body.error || '炉前验材失败');
        setPreview({
          key: selectionKey,
          estimatedSpiritStones: body.data.cost.spiritStones,
          validation: body.data.validation,
          batchPreview: body.data.batchPreview ?? null,
          canAfford: body.data.canAfford,
          previewError: null,
          loading: false,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setPreview({
          ...EMPTY_PREVIEW,
          key: selectionKey,
          previewError: error instanceof Error ? error.message : '炉前验材失败',
        });
      });
    return () => controller.abort();
  }, [
    formula?.id,
    materialQuantities,
    materials.ids,
    mode,
    readyForPreview,
    selectionKey,
  ]);

  useEffect(() => {
    if (analysis.cooldownRemaining <= 0) return;
    const timer = window.setInterval(
      () =>
        setAnalysis((current) => ({
          ...current,
          cooldownRemaining: Math.max(0, current.cooldownRemaining - 1),
        })),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [analysis.cooldownRemaining]);

  useEffect(
    () => () => {
      if (analysisExpiryTimerRef.current !== null)
        window.clearTimeout(analysisExpiryTimerRef.current);
    },
    [],
  );

  const analyzeFormula = useCallback(async (): Promise<boolean> => {
    if (!formula?.id || !readyForObservation || analysis.cooldownRemaining > 0)
      return false;
    setAnalysis((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await fetch(
        `/api/alchemy/formulas/${formula.id}/analyze`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            materialIds: materials.ids,
            materialQuantities,
          }),
        },
      );
      const body = (await response.json()) as AnalyzeResponse;
      if (!response.ok || !body.success || !body.data) {
        if (typeof body.remainingSeconds === 'number')
          setAnalysis((current) => ({
            ...current,
            cooldownRemaining: body.remainingSeconds!,
          }));
        throw new Error(body.error || '丹方推演失败');
      }
      analysisKeyRef.current = selectionKey;
      if (analysisExpiryTimerRef.current !== null)
        window.clearTimeout(analysisExpiryTimerRef.current);
      analysisExpiryTimerRef.current = window.setTimeout(() => {
        analysisKeyRef.current = null;
        analysisExpiryTimerRef.current = null;
        setAnalysis((current) => ({
          ...EMPTY_ANALYSIS,
          cooldownRemaining: current.cooldownRemaining,
          error: '玉简中的药路投影已经散去，请重新推演。',
        }));
        setPhase('preparing');
      }, body.data.expiresInSeconds * 1000);
      setAnalysis({
        value: body.data,
        loading: false,
        error: null,
        cooldownRemaining: body.data.cooldownRemainingSeconds,
      });
      return true;
    } catch (error) {
      setAnalysis((current) => ({
        ...current,
        value: null,
        loading: false,
        error: error instanceof Error ? error.message : '丹方推演失败',
      }));
      return false;
    }
  }, [
    analysis.cooldownRemaining,
    formula?.id,
    materialQuantities,
    materials.ids,
    readyForObservation,
    selectionKey,
  ]);

  const observe = useCallback(async () => {
    if (!readyForObservation) return;
    if (mode === 'improvised') {
      if (!intent.trim()) return;
      setPhase('observing');
      return;
    }
    if (await analyzeFormula()) setPhase('observing');
  }, [analyzeFormula, intent, mode, readyForObservation]);

  const returnToPreparation = useCallback(() => setPhase('preparing'), []);

  const submitPayload = useMemo(
    () => ({
      craftType: 'alchemy' as const,
      alchemyMode: mode,
      materialIds: materials.ids,
      materialQuantities,
      userPrompt: mode === 'improvised' ? intent.trim() : undefined,
      formulaId: mode === 'formula' ? formula?.id : undefined,
      analysisId: mode === 'formula' ? analysis.value?.analysisId : undefined,
    }),
    [
      analysis.value?.analysisId,
      formula?.id,
      intent,
      materialQuantities,
      materials.ids,
      mode,
    ],
  );

  const resolveDiscovery = useCallback(
    async (save: boolean) => {
      const discovery = result.formulaDiscovery;
      if (!discovery) return;
      try {
        const response = await fetch(
          '/api/alchemy/formulas/discovery/confirm',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: discovery.token, save }),
          },
        );
        const body = (await response.json()) as DiscoveryResponse;
        if (!response.ok || !body.success)
          throw new Error(body.error || '丹方留存失败');
        setResult((current) => ({ ...current, formulaDiscovery: null }));
        if (save)
          pushToast({
            message: body.data?.formula
              ? `已将【${body.data.formula.name}】收入玉简。`
              : '新丹方已收入玉简。',
            tone: 'success',
          });
      } catch (error) {
        pushToast({
          message: error instanceof Error ? error.message : '丹方留存失败',
          tone: 'danger',
        });
      }
    },
    [pushToast, result.formulaDiscovery],
  );

  const fire = useCallback(() => {
    if (!cultivator || !readyForFiring || submitting) return;
    openQiActionConfirm({
      actionName: mode === 'formula' ? '依方引火' : '随心引火',
      qiCost,
      confirmLabel: '落印引火',
      onConfirm: async () => {
        setPhase('firing');
        setSubmitting(true);
        setStatus('炉门闭合，地火正沿阵纹攀升……');
        setResult(EMPTY_RESULT);
        const firePulse = window.setTimeout(
          () => setStatus('炉腹轰鸣，杂气正被地火逐层煅去……'),
          700,
        );
        const essencePulse = window.setTimeout(
          () => setStatus('药蕴回旋，主丹与副丹正在不同火层中凝形……'),
          1500,
        );
        try {
          const body = await mutate<CraftResult>(
            fetch('/api/craft', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(submitPayload),
            }),
          );
          if (!body.consumable) throw new Error('炉中未能凝丹');
          setResult({
            consumable: body.consumable,
            consumables: body.consumables ?? [body.consumable],
            craftedConsumables: body.craftedConsumables ??
              body.consumables ?? [body.consumable],
            yieldProfile: body.yieldProfile ?? null,
            formulaDiscovery: body.formulaDiscovery ?? null,
            formulaProgress: body.formulaProgress ?? null,
          });
          setStatus('炉鸣三响，丹香已从炉隙逸出。');
          setPhase('result');
        } catch (error) {
          setStatus(error instanceof Error ? error.message : '炼丹失败');
          setPhase('observing');
          pushToast({
            message: error instanceof Error ? error.message : '炼丹失败',
            tone: 'danger',
          });
        } finally {
          window.clearTimeout(firePulse);
          window.clearTimeout(essencePulse);
          setSubmitting(false);
        }
      },
    });
  }, [
    cultivator,
    mode,
    mutate,
    openQiActionConfirm,
    pushToast,
    qiCost,
    readyForFiring,
    submitPayload,
    submitting,
  ]);

  const startNextBatch = useCallback(() => {
    setPhase('preparing');
    setIntentState('');
    setFormula(null);
    setMaterials(EMPTY_MATERIALS);
    setPreview(EMPTY_PREVIEW);
    setResult(EMPTY_RESULT);
    setStatus('');
    clearAnalysis();
  }, [clearAnalysis]);

  const resetDraft = useCallback(() => {
    setModeState('improvised');
    startNextBatch();
  }, [startNextBatch]);

  return {
    cultivator,
    loading: profile.loading || currency.loading || playerSession.loading,
    note: playerSession.data?.note,
    sectContext,
    starterTask,
    phase,
    mode,
    intent,
    formula,
    materials,
    preview,
    analysis,
    result,
    submitting,
    status,
    qiCost,
    totalDose: materials.ids.reduce(
      (sum, id) => sum + (materials.doses[id] ?? ALCHEMY_MIN_DOSE),
      0,
    ),
    readyForObservation,
    readyForFiring,
    setMode,
    setIntent,
    selectFormula,
    addMaterialToFurnace,
    toggleMaterial,
    removeMaterial,
    setMaterialDose,
    observe,
    returnToPreparation,
    fire,
    startNextBatch,
    resetDraft,
    resolveDiscovery,
  };
}

export type AlchemyCraftSession = ReturnType<
  typeof useAlchemyCraftSessionState
>;

import { calculateSingleElixirScore } from '@server/utils/rankingUtils';
import { resolveAlchemyEffects } from '@shared/lib/alchemyEffectResolver';
import type { AlchemyYieldProfile } from '@shared/types/consumable';
import type { Consumable } from '@shared/types/cultivator';
import type { Quality } from '@shared/types/constants';

/** 将共享产出批次转换为库存 lot；不包含数据库读写。 */
export function assembleAlchemyOutputConsumables(
  base: Consumable,
  sourceQuality: Quality,
  yieldProfile: AlchemyYieldProfile,
): Consumable[] {
  return yieldProfile.lots.map((lot) => {
    const spec = base.spec.kind === 'pill'
      ? {
          ...base.spec,
          operations: resolveAlchemyEffects({
            route: { effects: base.spec.alchemyMeta.propertyVector ?? [] },
            quality: lot.quality,
            appearance: lot.appearance,
            fitMultiplier: base.spec.alchemyMeta.source === 'formula'
              ? base.spec.alchemyMeta.fitMultiplier
              : 1,
            stability: base.spec.alchemyMeta.stability,
          }).operations,
          alchemyMeta: {
            ...base.spec.alchemyMeta,
            version: 4 as const,
            appearance: lot.appearance,
            batch: base.spec.alchemyMeta.batch
              ? {
                  ...(() => {
                    const persisted = { ...base.spec.alchemyMeta.batch };
                    delete persisted.essenceSummary;
                    delete persisted.yieldProfile;
                    return persisted;
                  })(),
                  lotQuantity: lot.quantity,
                  essenceLossRatio: yieldProfile.essenceLossRatio,
                }
              : undefined,
          },
        }
      : base.spec;
    const consumable: Consumable = {
      ...base,
      quality: lot.quality,
      quantity: lot.quantity,
      spec,
    };
    consumable.score = calculateSingleElixirScore(consumable);
    return consumable;
  });
}

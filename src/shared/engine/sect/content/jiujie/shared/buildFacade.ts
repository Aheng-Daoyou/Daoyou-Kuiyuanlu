import type { SectPathId } from '../../../core';
import { JIUJIE_CONDEMNATION_PATH_ID, JIUJIE_EYE_PATH_ID } from '../ids';

export interface JiujieBuildSettings {
  pathId?: SectPathId;
  resourceMax: number;
  thunderDuration: number;
  thunderCoefficient: number;
  debtDuration: number;
  receiveDuration: number;
  receiveReduction: number;
  memoryCap: number;
  questionCoefficient: number;
  borrowShieldRatio: number;
  finishDebtCoefficient: number;
  eyeDuration: number;
  reoffendBonus: number;
  finishMemoryRatio: number;
  settlementThunderDuration: number;
}

export function createJiujieBuildSettings(pathId?: SectPathId): JiujieBuildSettings {
  const eye = pathId === JIUJIE_EYE_PATH_ID;
  const condemnation = pathId === JIUJIE_CONDEMNATION_PATH_ID;
  return {
    pathId, resourceMax: 3, thunderDuration: 3, thunderCoefficient: 0.25,
    debtDuration: 4, receiveDuration: eye ? 2 : 1, receiveReduction: eye ? 0.80 : 0.90,
    memoryCap: eye ? 0.50 : 0.25, questionCoefficient: 0.55, borrowShieldRatio: 0.15,
    finishDebtCoefficient: condemnation ? 0.20 : 0.15, eyeDuration: 2,
    reoffendBonus: condemnation ? 0.15 : 0, finishMemoryRatio: eye ? 0.35 : 0,
    settlementThunderDuration: 0,
  };
}

export const EYE_BUILD_FACADE = Symbol('jiujie-eye-build');
export const CONDEMNATION_BUILD_FACADE = Symbol('jiujie-condemnation-build');

export class JiujieEyeBuildFacade {
  constructor(readonly settings: JiujieBuildSettings) {}
  extendReceive(): void { this.settings.receiveDuration = Math.min(5, this.settings.receiveDuration + 1); }
  strengthenReceive(): void { this.settings.receiveReduction = Math.max(0.60, this.settings.receiveReduction - 0.05); }
  deepenMemory(): void { this.settings.memoryCap = Math.min(0.90, this.settings.memoryCap + 0.20); }
  extendEye(): void { this.settings.eyeDuration = Math.min(5, this.settings.eyeDuration + 1); }
  strengthenQuestion(): void { this.settings.questionCoefficient = Math.min(0.90, this.settings.questionCoefficient + 0.15); }
  strengthenBorrow(): void { this.settings.borrowShieldRatio = Math.min(0.25, this.settings.borrowShieldRatio + 0.05); }
  strengthenSettlement(): void { this.settings.finishMemoryRatio = Math.min(0.80, this.settings.finishMemoryRatio + 0.15); }
  strengthenDebtSettlement(): void { this.settings.finishDebtCoefficient = Math.min(0.40, this.settings.finishDebtCoefficient + 0.07); }
}

export class JiujieCondemnationBuildFacade {
  constructor(readonly settings: JiujieBuildSettings) {}
  extendThunder(): void { this.settings.thunderDuration = Math.min(6, this.settings.thunderDuration + 1); }
  strengthenQuestion(): void { this.settings.questionCoefficient = Math.min(0.90, this.settings.questionCoefficient + 0.15); }
  strengthenDebtSettlement(): void { this.settings.finishDebtCoefficient = Math.min(0.45, this.settings.finishDebtCoefficient + 0.05); }
  strengthenThunderTrigger(): void { this.settings.thunderCoefficient = Math.min(0.35, this.settings.thunderCoefficient + 0.02); }
  strengthenReoffend(): void { this.settings.reoffendBonus = Math.min(0.45, this.settings.reoffendBonus + 0.10); }
  strengthenSettlement(): void { this.settings.settlementThunderDuration = Math.min(3, this.settings.settlementThunderDuration + 1); }
}

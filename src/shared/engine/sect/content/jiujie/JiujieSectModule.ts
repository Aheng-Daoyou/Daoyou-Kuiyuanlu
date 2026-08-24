import { StandardSectModule, type SectBuildBuilder, type SectProjectionContext } from '../../core';
import { compileJiujieBase } from './base/JiujieBaseCompiler';
import { JIUJIE_BASE_DEFINITION } from './definition';
import { JIUJIE_ORGANIZATION_THEME } from './organization';
import { JIUJIE_CONDEMNATION_PATH_MODULE, JIUJIE_EYE_PATH_MODULE } from './paths';
import { JiujieBaseSelectionStrategy } from './strategy';
export class JiujieSectModule extends StandardSectModule {
  constructor() { super(JIUJIE_BASE_DEFINITION, [JIUJIE_EYE_PATH_MODULE, JIUJIE_CONDEMNATION_PATH_MODULE], { organizationTheme: JIUJIE_ORGANIZATION_THEME }); }
  protected compileBase(context: SectProjectionContext, builder: SectBuildBuilder): void { compileJiujieBase(context, builder, { pathId: undefined, resourceMax: 3, thunderDuration: 3, thunderCoefficient: 0.25, debtDuration: 4, receiveDuration: 2, receiveReduction: 0.80, memoryCap: 0.50, questionCoefficient: 0.55, borrowShieldRatio: 0.10, finishDebtCoefficient: 0.15, eyeDuration: 2, reoffendBonus: 0, finishMemoryRatio: 0, settlementThunderDuration: 0 }); }
  createBaseSelectionStrategy() { return new JiujieBaseSelectionStrategy(); }
}
export const JIUJIE_MODULE = new JiujieSectModule();

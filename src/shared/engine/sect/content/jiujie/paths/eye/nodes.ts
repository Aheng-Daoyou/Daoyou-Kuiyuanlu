import { ConfiguredSectNodePlugin, type SectBuildBuilder } from '../../../../core';
import { EYE_BUILD_FACADE, type JiujieEyeBuildFacade } from '../../shared/buildFacade';
const node = (id: string, layerId: string, name: string, description: string, apply: (facade: JiujieEyeBuildFacade) => void) => new ConfiguredSectNodePlugin({ id, layerId, name, description }, (_context, builder: SectBuildBuilder) => apply(builder.requireExtension<JiujieEyeBuildFacade>(EYE_BUILD_FACADE, '劫眼临身构筑')));
export const JIUJIE_EYE_NODES = [
  node('eye-open', '1', '开眼', '承天受劫持续时间延长1回合。', (f) => f.extendReceive()), node('eye-bear', '1', '承灾', '承天受劫直接减伤提高5%。', (f) => f.strengthenReceive()), node('eye-first-light', '1', '初照', '劫眼持续时间延长1回合。', (f) => f.extendEye()),
  node('eye-record', '2', '留劫', '承劫量记录上限提高20%最大气血。', (f) => f.deepenMemory()), node('eye-question', '2', '照身', '雷狱问行伤害系数提高0.15法攻。', (f) => f.strengthenQuestion()), node('eye-return', '2', '回身', '借劫回身护盾提高5%最大气血。', (f) => f.strengthenBorrow()),
  node('eye-guard', '3', '守劫', '承天受劫持续时间再次延长1回合。', (f) => f.extendReceive()), node('eye-deep-return', '3', '归劫', '九霄清算承劫量兑现比例提高15%。', (f) => f.strengthenSettlement()), node('eye-still', '3', '定息', '承天受劫直接减伤再次提高5%。', (f) => f.strengthenReceive()),
  node('eye-long-gaze', '4', '久视', '劫眼持续时间再次延长1回合。', (f) => f.extendEye()), node('eye-heavy-thunder', '4', '重雷', '雷狱问行伤害系数再次提高0.15法攻。', (f) => f.strengthenQuestion()), node('eye-shelter', '4', '护身', '借劫回身护盾提高5%最大气血。', (f) => f.strengthenBorrow()),
  node('eye-true-record', '5', '真劫', '承劫量记录上限再次提高20%最大气血。', (f) => f.deepenMemory()), node('eye-returning-law', '5', '归法', '九霄清算承劫量兑现比例再次提高15%。', (f) => f.strengthenSettlement()), node('eye-after-rain', '5', '劫后', '每层劫债的清算伤害系数提高0.07法攻。', (f) => f.strengthenDebtSettlement()),
  node('eye-nine-gates', 'ultimate', '九门归劫', '九霄清算承劫量兑现比例再次提高15%。', (f) => f.strengthenSettlement()), node('eye-heavenly-shield', 'ultimate', '天门护身', '借劫回身护盾再次提高5%最大气血。', (f) => f.strengthenBorrow()), node('eye-calamity-without-end', 'ultimate', '劫后不坠', '每层劫债的清算伤害系数再次提高0.07法攻。', (f) => f.strengthenDebtSettlement()),
] as const;

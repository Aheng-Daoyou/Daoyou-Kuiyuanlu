import { BaseSectPathModule, STANDARD_PATH_LAYERS, type SectBuildBuilder, type SectPathCompileContext, type SectPathDefinitionWithoutNodes, type SectTacticId } from '../../core';
import { compileJiujieBase } from './base/JiujieBaseCompiler';
import { JIUJIE_CONDEMNATION_PATH_ID, JIUJIE_EYE_PATH_ID } from './ids';
import { JIUJIE_EYE_NODES } from './paths/eye/nodes';
import { JIUJIE_CONDEMNATION_NODES } from './paths/condemnation/nodes';
import { CONDEMNATION_BUILD_FACADE, EYE_BUILD_FACADE, JiujieCondemnationBuildFacade, JiujieEyeBuildFacade, createJiujieBuildSettings } from './shared/buildFacade';
import { JiujieCondemnationSelectionStrategy, JiujieEyeSelectionStrategy } from './strategy';

const eyeDefinition: SectPathDefinitionWithoutNodes = { id: JIUJIE_EYE_PATH_ID, name: '劫眼临身', description: '以身为劫眼，主动承受来力，把承受的灾厄转为劫数与归劫。', minRealm: '筑基', minRealmStage: '中期', layers: [...STANDARD_PATH_LAYERS], defaultTacticId: 'bear-and-return', tactics: [{ id: 'bear-and-return', name: '承灾归劫', description: '先承受爆发，再以九霄清算归还。' }, { id: 'close-the-eye', name: '闭目守劫', description: '优先防守，等待劫债成熟。' }, { id: 'eye-of-thunder', name: '劫眼照身', description: '标记攻击者并持续追问其行动。' }], presentation: { highlights: [{ name: '以身为眼', description: '承天受劫记录直接伤害。' }, { name: '灾厄有归', description: '承劫量最终转化为归劫伤害。' }, { name: '劫眼照身', description: '攻击劫眼者将被不可驱散劫雷标记。' }], abilityChanges: { 'receive-calamity': '节点强化承伤、承劫量记录与劫眼持续时间。', 'nine-sky-settlement': '节点可将承劫量转为额外归劫。' } } };
const condemnationDefinition: SectPathDefinitionWithoutNodes = { id: JIUJIE_CONDEMNATION_PATH_ID, name: '天谴加身', description: '以天听记录主罪，目标每一次重犯都让劫债更接近清算。', minRealm: '筑基', minRealmStage: '中期', layers: [...STANDARD_PATH_LAYERS], defaultTacticId: 'record-and-judge', tactics: [{ id: 'record-and-judge', name: '记罪清算', description: '先施劫雷，再等待目标重复主罪后清算。' }, { id: 'heavy-statute', name: '重典', description: '优先推进劫债并提高终式兑现。' }, { id: 'listen-to-heaven', name: '天听', description: '维持劫雷，积累劫数后执行终审。' }], presentation: { highlights: [{ name: '三类主罪', description: '记录伤害、扶持与控制三类行为。' }, { name: '重犯加刑', description: '重复同类主动行为会推进劫债。' }, { name: '九霄终审', description: '将劫数和劫债一次兑现。' }], abilityChanges: { 'calamity-seal': '节点强化劫雷维持和主罪记录。', 'nine-sky-settlement': '节点强化重犯与劫债的终式清算。' } } };

class EyePathModule extends BaseSectPathModule {
  constructor() { super(eyeDefinition, JIUJIE_EYE_NODES); }
  protected initializeBuild(_context: SectPathCompileContext, builder: SectBuildBuilder): void { builder.setExtension(EYE_BUILD_FACADE, new JiujieEyeBuildFacade(createJiujieBuildSettings(JIUJIE_EYE_PATH_ID))); }
  protected finalizeBuild(context: SectPathCompileContext, builder: SectBuildBuilder): void { compileJiujieBase(context, builder, builder.requireExtension<JiujieEyeBuildFacade>(EYE_BUILD_FACADE, '劫眼临身构筑').settings); }
  createSelectionStrategy(tacticId: SectTacticId) { return new JiujieEyeSelectionStrategy(tacticId); }
}
class CondemnationPathModule extends BaseSectPathModule {
  constructor() { super(condemnationDefinition, JIUJIE_CONDEMNATION_NODES); }
  protected initializeBuild(_context: SectPathCompileContext, builder: SectBuildBuilder): void { builder.setExtension(CONDEMNATION_BUILD_FACADE, new JiujieCondemnationBuildFacade(createJiujieBuildSettings(JIUJIE_CONDEMNATION_PATH_ID))); }
  protected finalizeBuild(context: SectPathCompileContext, builder: SectBuildBuilder): void { compileJiujieBase(context, builder, builder.requireExtension<JiujieCondemnationBuildFacade>(CONDEMNATION_BUILD_FACADE, '天谴加身构筑').settings); }
  createSelectionStrategy(tacticId: SectTacticId) { return new JiujieCondemnationSelectionStrategy(tacticId); }
}
export const JIUJIE_EYE_PATH_MODULE = new EyePathModule();
export const JIUJIE_CONDEMNATION_PATH_MODULE = new CondemnationPathModule();

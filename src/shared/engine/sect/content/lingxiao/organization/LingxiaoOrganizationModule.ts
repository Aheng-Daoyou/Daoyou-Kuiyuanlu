import {
  StandardSectOrganizationModule,
  type SectOrganizationTheme,
} from '../../../core';

/** 红尘剑宗只声明组织玩法的展示主题；核心流程由标准组织模块提供。 */
export const LINGXIAO_ORGANIZATION_THEME: SectOrganizationTheme = {
  taskPresentation: {
    gate_sweep: {
      description: '沿通往山下的石阶清理落叶，完成一轮山门勤务。',
      actionLabel: '前往山阶清扫',
      dialogue: {
        offeredReply: '山阶扫叶便交给我吧',
        activeReply: '山阶那桩勤务，请再说一遍',
        claimableReply: '山阶已经扫净，请录事查验',
        claimedReply: '请替我查查山阶勤务的功簿',
        instruction: {
          text: '沿通往山下的石阶清去落叶，晨钟再响前回来复命。',
        },
      },
    },
    weekly_tournament: {
      description: '在试剑台与同门剑影验证本周修行。',
      dialogue: {
        offeredReply: '本周试剑，我来应战',
        activeReply: '试剑台的安排，请再说一遍',
        claimableReply: '本周试剑已经结束，请录事查验',
        claimedReply: '请替我查查本周试剑的功簿',
        instruction: {
          text: '去试剑台与同门剑影交手，以本周所得胜过一场，再回来复命。',
        },
      },
    },
    elder_trial: {
      description: '接下传功长老三式问剑，取得真传资格。',
      dialogue: {
        offeredReply: '弟子愿受三式问剑',
        activeReply: '三式问剑，请长老再作指点',
        claimableReply: '弟子已经过关，请长老查验',
        claimedReply: '请长老查验弟子的问剑记录',
        instruction: {
          text: '去试炼场接我三式问剑。胜过剑影，才算有资格在真传名册上落笔。',
        },
      },
    },
  },
  shopGrants: {
    true_cloud_ore: {
      name: '百炼山铁',
      description: '红尘剑宗山腹反复受地火淬炼的稀有灵铁。',
    },
    true_spirit_pill: { name: '问剑蕴神丹' },
  },
  opponents: {
    weekly_tournament: { name: '同门试剑傀儡' },
    elder_trial: { name: '传功长老剑影' },
  },
  stipendGrantNames: { trueHerb: '剑叶灵草' },
};

export class LingxiaoOrganizationModule extends StandardSectOrganizationModule {
  constructor() {
    super(LINGXIAO_ORGANIZATION_THEME);
  }
}

export const LINGXIAO_ORGANIZATION = new LingxiaoOrganizationModule();

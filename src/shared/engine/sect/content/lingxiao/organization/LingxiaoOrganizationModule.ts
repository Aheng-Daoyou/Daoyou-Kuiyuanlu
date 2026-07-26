import {
  StandardSectOrganizationModule,
  type SectOrganizationTheme,
} from '../../../core';

/** 红尘剑宗只声明组织玩法的展示主题；核心流程由标准组织模块提供。 */
export const LINGXIAO_ORGANIZATION_THEME: SectOrganizationTheme = {
  shopGrants: {
    true_cloud_ore: {
      name: '百炼山铁',
      description: '红尘剑宗山腹反复受地火淬炼的稀有灵铁。',
    },
    true_spirit_pill: { name: '问剑蕴神丹' },
  },
  stipendGrantNames: { trueHerb: '剑叶灵草' },
};

export class LingxiaoOrganizationModule extends StandardSectOrganizationModule {
  constructor() {
    super(LINGXIAO_ORGANIZATION_THEME);
  }
}

export const LINGXIAO_ORGANIZATION = new LingxiaoOrganizationModule();

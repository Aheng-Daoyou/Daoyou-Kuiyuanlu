import {
  StandardSectOrganizationModule,
  type SectOrganizationTheme,
} from '../../../core';

/** 红尘剑宗只声明组织玩法的展示主题；核心流程由标准组织模块提供。 */
export const LINGXIAO_ORGANIZATION_THEME: SectOrganizationTheme = {};

export class LingxiaoOrganizationModule extends StandardSectOrganizationModule {
  constructor() {
    super(LINGXIAO_ORGANIZATION_THEME);
  }
}

export const LINGXIAO_ORGANIZATION = new LingxiaoOrganizationModule();

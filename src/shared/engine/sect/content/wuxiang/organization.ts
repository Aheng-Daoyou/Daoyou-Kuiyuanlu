import type { SectOrganizationTheme } from '../../core';

export const WUXIANG_ORGANIZATION_THEME: SectOrganizationTheme = {
  taskPresentation: {
    gate_sweep: {
      description: '沿照壁清理昨夜落下的香灰与血莲残瓣。',
      actionLabel: '前往照壁洒扫',
      dialogue: {
        offeredReply: '照壁拂尘便交给我吧',
        activeReply: '照壁那桩日务，请再说一遍',
        claimableReply: '照壁已经洒扫干净，请师兄查验',
        claimedReply: '请替我查查照壁日务的功簿',
        instruction: {
          text: '沿照壁清去昨夜落下的香灰与血莲残瓣，做完便回来复命。',
        },
      },
    },
    weekly_tournament: {
      description: '在无相木人前验证佛魔转相是否仍守得住一念。',
      dialogue: {
        offeredReply: '本周校身，我愿一试',
        activeReply: '无相木人的考校，请再说一遍',
        claimableReply: '校身已经结束，请师兄查验',
        claimedReply: '请替我查查本周校身的功簿',
        instruction: {
          text: '去问身场面对无相木人，在佛魔转相之间守住一念，胜过一场再回来。',
        },
      },
    },
    elder_trial: {
      description: '承受戒律师三问，再以所得之业照还其身。',
      dialogue: {
        offeredReply: '弟子愿受三问照业',
        activeReply: '三问照业，请戒律师再作指点',
        claimableReply: '弟子已经照还此业，请戒律师查验',
        claimedReply: '请戒律师查验弟子的照业记录',
        instruction: {
          text: '入问身场承受三问，再以所见之业照还法身。能见、能受、能渡，方算过关。',
        },
      },
    },
  },
  shopGrants: {
    true_cloud_ore: {
      name: '无相骨玉',
      description: '血池石壁中凝出的白色矿髓，温润如骨。',
    },
    true_spirit_pill: { name: '照身定念丹' },
  },
  opponents: {
    weekly_tournament: { name: '无相试身木人' },
    elder_trial: { name: '戒律师法身' },
  },
  facilityNames: {
    archive: '贝叶藏',
    cultivation_room: '止观室',
    workshop: '火供院',
  },
  stipendGrantNames: { trueHerb: '血莲心' },
};

import type { SectOrganizationTheme } from '../../core';

export const TIANYAN_ORGANIZATION_THEME: SectOrganizationTheme = {
  taskPresentation: {
    gate_sweep: {
      description:
        '沿观象门与中宫之间校正被云雨冲乱的五行地刻，并记录今日偏差。',
      actionLabel: '前往观象阶校正地刻',
      dialogue: {
        offeredReply: '今日地刻由我来校正',
        activeReply: '地刻校正之事，请再说一遍',
        claimableReply: '地刻已经校正，请算使查验',
        claimedReply: '请替我查查今日校正的记录',
        instruction: {
          text: '沿观象门至中宫逐段校正被云雨冲乱的五行地刻，并记下今日偏差。',
        },
      },
    },
    weekly_tournament: {
      description: '在中宫演法台与同门推演傀儡验证本周神通次序。',
      actionLabel: '参加中宫衍法',
      dialogue: {
        offeredReply: '本周衍法，我来落子',
        activeReply: '中宫衍法的次序，请再说一遍',
        claimableReply: '本周衍法已经完成，请算使查验',
        claimedReply: '请替我查查本周衍法的记录',
        instruction: {
          text: '去中宫演法台与推演傀儡交手，以本周神通次序完成一局。',
        },
      },
    },
    elder_trial: {
      description: '接下河洛长老布置的三局残阵，在有限术式中完成破局。',
      actionLabel: '应对河洛问局',
      dialogue: {
        offeredReply: '弟子愿解三局残阵',
        activeReply: '三局残阵，请长老再作指点',
        claimableReply: '残阵已经解开，请长老查验',
        claimedReply: '请长老查验弟子的破局记录',
        instruction: {
          text: '入河洛台解开三局残阵。术式虽有限，落子却不止一种，破局后再来见我。',
        },
      },
    },
  },
  shopGrants: {
    true_cloud_ore: {
      name: '归流玄铜',
      description: '太白峰白铜屋面集露后析出的灵铜，表面水纹会随五峰余势改变。',
    },
    true_spirit_pill: { name: '太初蕴神丹' },
  },
  opponents: {
    weekly_tournament: { name: '同门推演傀儡' },
    elder_trial: { name: '河洛长老法影' },
  },
  facilityNames: {
    archive: '五经阁',
    cultivation_room: '太初静室',
    workshop: '太白铸府',
  },
  stipendGrantNames: { trueHerb: '青华衍生草' },
};

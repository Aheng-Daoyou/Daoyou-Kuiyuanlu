import type { SectOrganizationTheme } from '../../core';

export const YOUDU_ORGANIZATION_THEME: SectOrganizationTheme = {
  taskPresentation: {
    gate_sweep: {
      title: '巡查魂灯',
      description: '沿黑水石径巡查魂灯，记下倒影与行人错开的每一瞬。',
      actionLabel: '前往黑水巡灯',
      dialogue: {
        offeredReply: '今日魂灯由我来巡',
        activeReply: '巡灯的路径，请再说一遍',
        claimableReply: '魂灯已经巡完，请巡灯使查验',
        claimedReply: '请替我查查今日巡灯的记录',
        instruction: {
          text: '沿黑水石径逐盏巡查魂灯，记下倒影与行人错开的地方，再回来复命。',
        },
      },
    },
    mine_patrol: {
      title: '平息界隙回声',
      description: '前往黑水阴脉，收束从界隙中逸出的失控念灵。',
      actionLabel: '前往阴脉',
      dialogue: {
        offeredReply: '阴脉的回声由我来收束',
        activeReply: '界隙回声一事，请再说一遍',
        claimableReply: '失控念灵已经平息，请巡灯使查验',
        claimedReply: '请替我查查阴脉回声的记录',
        instruction: {
          text: '去黑水阴脉找到界隙回声，将逸出的失控念灵收束干净，再回来复命。',
        },
      },
    },
    pill_delivery: {
      title: '返照药契',
      description: '寻来一枚合用丹药，供返照室安定离魂弟子的神识。',
      actionLabel: '交付定魂丹药',
      dialogue: {
        offeredReply: '返照室所需丹药，我来寻',
        activeReply: '返照药契的要求，请再说一遍',
        claimableReply: '丹药已经入契，请巡灯使查验',
        claimedReply: '请替我查查返照药契的记录',
        instruction: {
          text: '替返照室寻来一枚合用丹药，用来安定离魂弟子的神识。',
          requirementPrefix: '替返照室寻来',
          requirementSuffix: '，带回招魂司验契。',
        },
      },
    },
    artifact_delivery: {
      title: '镇魂器契',
      description: '寻来一件合用且未装备的法宝，用于修补镇魂仪轨。',
      actionLabel: '交付镇魂法器',
      dialogue: {
        offeredReply: '修补镇魂仪轨的法器，我来寻',
        activeReply: '镇魂器契的要求，请再说一遍',
        claimableReply: '法器已经入契，请巡灯使查验',
        claimedReply: '请替我查查镇魂器契的记录',
        instruction: {
          text: '替招魂司寻来一件合用的未装备法宝，用于修补镇魂仪轨。',
          requirementPrefix: '替招魂司寻来',
          requirementSuffix: '，带回后用于修补镇魂仪轨。',
        },
      },
    },
    weekly_diligence: {
      title: '巡灯周录',
      description: '一周完成五次招魂司勤务，补全黑水沿岸的巡灯簿。',
      actionLabel: '查看巡灯簿',
      dialogue: {
        offeredReply: '本周巡灯簿也记我一份',
        activeReply: '巡灯周录已经记到哪里了',
        claimableReply: '本周巡灯簿已经补全，请命簿使查验',
        claimedReply: '请替我翻翻本周巡灯簿',
        instruction: {
          text: '本周完成五次招魂司勤务，将黑水沿岸的巡灯簿补全。',
        },
      },
    },
    weekly_tournament: {
      title: '照影校术',
      description: '在照影场校验招魂、镇魄与送魂之法。',
      actionLabel: '进入照影场',
      dialogue: {
        offeredReply: '本周照影校术，我来应试',
        activeReply: '照影场的考校，请再说一遍',
        claimableReply: '照影校术已经完成，请命簿使查验',
        claimedReply: '请替我查查照影校术的记录',
        instruction: {
          text: '去照影场校验招魂、镇魄与送魂之法，胜过试魂傀再回来。',
        },
      },
    },
    weekly_bounty: {
      title: '失名悬契',
      description: '追查夺舍邪修、役魂商贩或伪造招魂契者留下的线索。',
      actionLabel: '领取悬契',
      dialogue: {
        offeredReply: '这份失名悬契由我来查',
        activeReply: '失名悬契的线索，请再说一遍',
        claimableReply: '失名悬契已经办妥，请命簿使查验',
        claimedReply: '请替我查查失名悬契的记录',
        instruction: {
          text: '循悬契追查夺舍邪修、役魂商贩或伪造契书者，找到残影后将其收伏。',
          requirementPrefix: '这份悬契要验一件遗物。替我寻来',
          requirementSuffix: '，带回后我会核验其魂息。',
        },
      },
    },
    elder_trial: {
      title: '七灯问名',
      description: '随引魂师穿过七灯，守住自己的姓名与归路。',
      actionLabel: '踏入七灯阵',
      dialogue: {
        offeredReply: '弟子愿入七灯问名',
        activeReply: '七灯问名，请引魂师再作指点',
        claimableReply: '弟子已经走过七灯，请引魂师查验',
        claimedReply: '请引魂师查验弟子的问名记录',
        instruction: {
          text: '踏入七灯阵，依次守住姓名、来处与归路。走过七灯仍不失本心，才算过关。',
        },
      },
    },
  },
  shopGrants: {
    outer_qinglu: {
      name: '魂灯油',
      description: '取自阴木灵脂，可供魂灯安静燃烧一夜。',
    },
    outer_recovery_pill: {
      name: '渡夜回气丹',
      description: '招魂司值夜所用的制式回气丹。',
    },
    inner_ironwood: {
      name: '黑水砂',
      description: '黑水河床沉积的细砂，可稳定丹器中的阴阳流转。',
    },
    inner_healing_pill: {
      name: '返魂止血丹',
      description: '返照室储备的疗伤丹药，只救生身，不拘魂魄。',
    },
    true_cloud_ore: {
      name: '镇魂铁',
      description: '黑水阴脉中沉积的旧铁，可稳固器物神韵。',
    },
    true_spirit_pill: {
      name: '返照定魂丹',
      description: '真传弟子渡魂远行前服用的高阶回气丹。',
    },
  },
  opponents: {
    mine_patrol: { title: '阴脉回声', name: '失控念灵' },
    weekly_tournament: { title: '照影校术', name: '照影试魂傀' },
    weekly_bounty: { title: '失名悬契', name: '役魂商贩残影' },
    elder_trial: { title: '七灯问名', name: '引魂师法身' },
  },
  facilityNames: {
    archive: '三魂阁',
    cultivation_room: '返照室',
    workshop: '镇铁炉',
    spirit_vein: '黑水阴脉',
    herb_garden: '返照香圃',
  },
  stipendGrantNames: {
    herb: '魂灯油',
    trueHerb: '返照香',
    innerMaterial: '黑水砂',
  },
};

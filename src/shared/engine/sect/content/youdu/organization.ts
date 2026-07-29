import type { SectOrganizationTheme } from '../../core';

export const YOUDU_ORGANIZATION_THEME: SectOrganizationTheme = {
  elderTrial: {
    name: '归魂婆婆·试炼化身',
    description: '携魂灯立于忘川影中，以蚀魂与镇魄逼人守住本心。',
    configVersion: 1,
    methodIds: [
      'youdu-canon',
      'three-souls-separation',
      'forgetful-river-record',
      'seven-souls-seizure',
      'soul-pinning-ironbook',
      'dead-heart-living-spirit',
    ],
    pathId: 'tide',
    tacticId: 'tide-cycle',
    abilityLoadout: [
      'soul-severing-call',
      'forgetful-river-tide',
      'pin-soul',
      'soul-shall-not-return',
    ],
    artifactNames: ['镇魂玄铁令', '忘川夜衣', '引魂灯佩'],
    artifactDescriptions: [
      '玄铁令饮下游魂余势，反哺持令之人。',
      '黑水织成夜衣，在魂魄将散时护住形神。',
      '一盏灯火照定归路，使外邪难乱三魂。',
    ],
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
  facilityNames: {
    archive: '三魂阁',
    cultivation_room: '返照室',
    workshop: '镇铁炉',
    spirit_vein: '黑水阴脉',
    herb_garden: '返照香圃',
  },
};

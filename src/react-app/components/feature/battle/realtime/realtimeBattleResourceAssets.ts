const RESOURCE_ASSET_ROOT = '/assets/battle/realtime/ui/resources';

const RESOURCE_ASSETS: Readonly<Record<string, string>> = {
  'sect.lingxiao.sword-momentum': `${RESOURCE_ASSET_ROOT}/sword-momentum.png`,
  'sect.tianyan.derivation': `${RESOURCE_ASSET_ROOT}/derivation.png`,
  'sect.wuxiang.war-intent': `${RESOURCE_ASSET_ROOT}/heart-intent.png`,
  'sect.youdu.soul-fire': `${RESOURCE_ASSET_ROOT}/soul-fire.png`,
};

const GENERIC_RESOURCE_ASSET = `${RESOURCE_ASSET_ROOT}/generic-resource.png`;

/**
 * Presentation-only registry. Combat resource IDs remain battle-v5's stable
 * identity; the realtime renderer owns their artwork and never falls back to
 * an engine-provided Emoji glyph.
 */
export function realtimeBattleResourceAsset(resourceId: string): string {
  return RESOURCE_ASSETS[resourceId] ?? GENERIC_RESOURCE_ASSET;
}

import { GameplayTags } from '@shared/engine/shared/tag-domain';

export const JIUJIE_SECT_ID = 'jiujie';
export const JIUJIE_CALAMITY = 'sect.jiujie.calamity';
export const JIUJIE_THUNDER = 'sect.jiujie.thunder';
export const JIUJIE_DEBT = 'sect.jiujie.debt';
export const JIUJIE_EYE = 'sect.jiujie.eye';
export const JIUJIE_REOFFEND = 'sect.jiujie.reoffend';
export const JIUJIE_SIN_DAMAGE = 'sect.jiujie.sin.damage';
export const JIUJIE_SIN_SUPPORT = 'sect.jiujie.sin.support';
export const JIUJIE_SIN_CONTROL = 'sect.jiujie.sin.control';

export const JIUJIE_EYE_PATH_ID = 'calamity-eye';
export const JIUJIE_CONDEMNATION_PATH_ID = 'heavenly-condemnation';

export const jiujieTag = (id: string) =>
  GameplayTags.BUFF.SECT.namespace(JIUJIE_SECT_ID, id);

export const jiujieAbilityTag = (id: string) =>
  GameplayTags.ABILITY.SECT.ability(JIUJIE_SECT_ID, id);

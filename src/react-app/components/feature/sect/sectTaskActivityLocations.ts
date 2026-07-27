import type { SectTaskViewData } from '@shared/contracts/sect';
import { createSectRoomNpcHref } from './sectRoomNavigation';

export type SectTaskActivityLocationKey = 'sect.spirit-vein' | 'sect.arena';

interface SectTaskActivityLocation {
  route: string;
  returnLabel: string;
  roleKey: string;
}

const LOCATIONS: Readonly<
  Record<SectTaskActivityLocationKey, SectTaskActivityLocation>
> = {
  'sect.spirit-vein': {
    route: '/game/sect/spirit-vein',
    returnLabel: '返回矿场',
    roleKey: 'keeper',
  },
  'sect.arena': {
    route: '/game/sect/arena',
    returnLabel: '返回演武场',
    roleKey: 'marshal',
  },
};

export function isSectTaskActivityLocationKey(
  value: unknown,
): value is SectTaskActivityLocationKey {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(LOCATIONS, value)
  );
}

export function readSectTaskActivityLocation(
  action: SectTaskViewData['actions'][number],
): { key: SectTaskActivityLocationKey; travelReply: string } | undefined {
  const value = action.parameters?.executionLocation;
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (
    !isSectTaskActivityLocationKey(record.key) ||
    typeof record.travelReply !== 'string' ||
    !record.travelReply.trim()
  )
    return undefined;
  return { key: record.key, travelReply: record.travelReply };
}

export function getSectTaskActivityLocation(
  key: SectTaskActivityLocationKey,
): SectTaskActivityLocation {
  const location = LOCATIONS[key];
  return {
    ...location,
    route: createSectRoomNpcHref(location.route, location.roleKey),
  };
}

export function resolveSectTaskActivityOrigin(
  value: string | null,
): SectTaskActivityLocationKey | undefined {
  return isSectTaskActivityLocationKey(value) ? value : undefined;
}

export function createSectTaskBattleHref(
  taskId: string,
  origin?: SectTaskActivityLocationKey,
): string {
  const query = new URLSearchParams({ attemptId: crypto.randomUUID() });
  if (origin) query.set('origin', origin);
  return `/game/sect/tasks/${encodeURIComponent(taskId)}/battle?${query.toString()}`;
}
